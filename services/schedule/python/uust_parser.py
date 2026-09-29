#!/usr/bin/env python3
"""Read the JSON API used by schedule.uust.ru; Python 3.10+, no dependencies."""

from __future__ import annotations

import argparse
import gzip
import hashlib
from http.client import HTTPException
import json
import math
import os
from pathlib import Path
import re
import socket
import sys
import tempfile
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen


DEFAULT_API_BASE = "https://dev.uust-time.ru/api/v/852972"
ENTITY_TYPES = {"group": 0, "teacher": 1, "room": 2}
SCHEDULE_KEYS = (
    "schedule_id", "schedule_subject_title", "schedule_weekday_id",
    "schedule_weeks",
)
TIME_RANGE = re.compile(r"^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$")
JsonRow = dict[str, Any]


class ScheduleError(Exception):
    """An actionable API, cache, or data-format error."""


@dataclass(frozen=True)
class Snapshot:
    """A complete API response, with its actual retrieval timestamp."""

    url: str
    fetched_at: str
    records: list[JsonRow]
    from_cache: bool = False


def atomic_json(path: Path, value: Any) -> None:
    """Replace an output only after a complete JSON file has been written."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=path.parent,
            prefix=f".{path.name}.", suffix=".tmp", delete=False,
        ) as stream:
            temporary = Path(stream.name)
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
        os.replace(temporary, path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def as_records(payload: Any, required: tuple[str, ...]) -> list[JsonRow]:
    """Accept arrays and PHP-style objects indexed by numeric row keys."""
    if isinstance(payload, dict):
        if not all(str(key).isdigit() for key in payload):
            raise ScheduleError(
                "API вернул объект вместо списка записей; возможна ошибка "
                "сервера или изменение формата."
            )
        payload = list(payload.values())
    if not isinstance(payload, list):
        raise ScheduleError("API вернул JSON неожиданного формата.")
    for index, row in enumerate(payload):
        if not isinstance(row, dict) or any(key not in row for key in required):
            raise ScheduleError(
                f"Запись {index} не содержит ожидаемых полей {required}."
            )
    return payload


def positive_id(value: Any, label: str) -> int:
    """Reject malformed identifiers instead of constructing a wrong URL."""
    if isinstance(value, bool) or not re.fullmatch(r"[1-9]\d*", str(value)):
        raise ScheduleError(f"{label}: требуется положительное целое число.")
    return int(value)


class UustClient:
    """Small synchronous client with explicit offline mode and disk caching."""

    def __init__(
        self,
        api_base: str = DEFAULT_API_BASE,
        cache_dir: str | Path | None = None,
        timeout: float = 30,
        cache_ttl: float = 900,
        offline: bool = False,
        refresh: bool = False,
        retries: int = 1,
        cache_enabled: bool = True,
    ) -> None:
        parsed = urlsplit(api_base)
        if (
            parsed.scheme not in {"http", "https"} or not parsed.netloc
            or parsed.query or parsed.fragment or parsed.username
            or parsed.password
        ):
            raise ScheduleError("Некорректный базовый URL API.")
        if not math.isfinite(timeout) or timeout <= 0:
            raise ScheduleError("Тайм-аут должен быть положительным числом.")
        if not math.isfinite(cache_ttl) or cache_ttl < 0:
            raise ScheduleError("Срок хранения кэша не может быть отрицательным.")
        if retries < 0 or retries > 3:
            raise ScheduleError("Допустимо от 0 до 3 повторов запроса.")
        if offline and refresh:
            raise ScheduleError("--offline и --refresh нельзя использовать вместе.")
        if offline and not cache_enabled:
            raise ScheduleError("Offline mode requires a cache.")
        default_cache = Path(
            os.environ.get("XDG_CACHE_HOME", str(Path.home() / ".cache"))
        ) / "pocketuust" / "schedule"
        self.api_base = api_base.rstrip("/")
        self.cache_dir = Path(cache_dir) if cache_dir else default_cache
        self.timeout = timeout
        self.cache_ttl = cache_ttl
        self.offline = offline
        self.refresh = refresh
        self.retries = retries
        self.cache_enabled = cache_enabled

    def _request(self, url: str) -> Any:
        request = Request(url, headers={
            "Accept": "application/json",
            "Accept-Encoding": "gzip",
            "User-Agent": "PocketUUST-Schedule-Client/1.0",
        })
        for attempt in range(self.retries + 1):
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    raw = response.read()
                    if response.headers.get("Content-Encoding") == "gzip":
                        raw = gzip.decompress(raw)
                return json.loads(raw.decode("utf-8-sig"))
            except HTTPError as error:
                status = error.code
                retry_after = error.headers.get("Retry-After")
                error.close()
                if status in {502, 503, 504} and attempt < self.retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                if status == 429:
                    detail = (
                        f" Retry-After: {retry_after}." if retry_after else ""
                    )
                    raise ScheduleError(
                        "API ограничил частоту запросов (HTTP 429). "
                        f"Повторите позже.{detail}"
                    ) from error
                if status in {401, 403}:
                    raise ScheduleError(
                        f"API отказал в доступе (HTTP {status}). "
                        "Проверьте доступность сайта и условия доступа к API."
                    ) from error
                raise ScheduleError(f"API вернул HTTP {status}: {url}") from error
            except (
                URLError, TimeoutError, socket.timeout, OSError, HTTPException,
            ) as error:
                if attempt < self.retries:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                raise ScheduleError(
                    f"Не удалось полностью загрузить данные: {error}. "
                    "Существующие файлы сохранены. Если кэш уже есть, "
                    "можно явно включить --offline."
                ) from error
            except (ValueError, UnicodeError, EOFError) as error:
                raise ScheduleError(
                    "Ответ API не является полным корректным JSON. "
                    "Частичный ответ не сохранён в кэш."
                ) from error
        raise ScheduleError("Не удалось выполнить запрос.")

    def _get(self, endpoint: str, required: tuple[str, ...]) -> Snapshot:
        url = f"{self.api_base}/{endpoint}?{urlencode({'site': 'schedule'})}"
        if not self.cache_enabled:
            records = as_records(self._request(url), required)
            fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
            return Snapshot(url, fetched_at, records)
        key = hashlib.sha256(url.encode("utf-8")).hexdigest()
        cache_path = self.cache_dir / f"{key}.json"
        if not self.refresh:
            try:
                cached = json.loads(cache_path.read_text(encoding="utf-8"))
                if cached["url"] != url:
                    raise ValueError("URL кэша не совпадает")
                timestamp = datetime.fromisoformat(cached["fetched_at"])
                if timestamp.tzinfo is None:
                    raise ValueError("В кэше нет часового пояса")
                records = as_records(cached["records"], required)
                age = time.time() - timestamp.timestamp()
                if self.offline or 0 <= age < self.cache_ttl:
                    return Snapshot(url, cached["fetched_at"], records, True)
            except (
                OSError, ValueError, KeyError, TypeError, OverflowError,
                ScheduleError,
            ):
                if self.offline:
                    raise ScheduleError(
                        f"Нет корректного кэша для {endpoint}. "
                        "Сначала выполните этот запрос с интернетом."
                    ) from None
        if self.offline:
            raise ScheduleError(f"Нет сохранённых данных для {endpoint}.")
        records = as_records(self._request(url), required)
        fetched_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        snapshot = Snapshot(url, fetched_at, records)
        atomic_json(cache_path, {
            "url": url, "fetched_at": fetched_at, "records": records,
        })
        return snapshot

    def groups(self) -> Snapshot:
        return self._get("groups", ("group_id", "group_title"))

    def teachers(self) -> Snapshot:
        return self._get("teachers", ("isu_person_id",))

    def filials(self) -> Snapshot:
        return self._get("filials", ("filial_id", "filial_title"))

    def organizations(self) -> Snapshot:
        return self._get("organizations", ("org_id", "org_title"))

    def buildings(self, organization_id: int) -> Snapshot:
        identifier = positive_id(organization_id, "ID организации")
        return self._get(f"buildings/{identifier}", ("building_id",))

    def rooms(self, building_id: int) -> Snapshot:
        # The API includes building 0 ("Дистанционно").
        identifier = 0 if str(building_id) == "0" else positive_id(
            building_id, "ID корпуса",
        )
        return self._get(f"audiences/{identifier}", ("room_id", "room_title"))

    def schedule(
        self, entity_type: str, entity_id: int, semester_id: int,
    ) -> Snapshot:
        if entity_type not in ENTITY_TYPES:
            raise ScheduleError("Тип расписания: group, teacher или room.")
        identifier = positive_id(entity_id, "ID группы/преподавателя/аудитории")
        semester = positive_id(semester_id, "ID учебного периода")
        endpoint = (
            f"schedule/{ENTITY_TYPES[entity_type]}/{identifier}"
            f"/semester/{semester}"
        )
        return self._get(endpoint, SCHEDULE_KEYS)


def resolve_group(
    records: list[JsonRow], name: str, filial_id: int | None = None,
) -> JsonRow:
    """Resolve an exact name; never silently choose between duplicate names."""
    matches = [
        row for row in records
        if str(row["group_title"]).strip().casefold() == name.strip().casefold()
        and (filial_id is None or str(row.get("filial_id")) == str(filial_id))
    ]
    distinct = {str(row["group_id"]): row for row in matches}
    if len(distinct) != 1:
        if not distinct:
            raise ScheduleError(
                f"Группа «{name}» не найдена. Посмотрите groups --query."
            )
        ids = ", ".join(distinct)
        raise ScheduleError(
            f"Название «{name}» неоднозначно; group_id: {ids}. "
            "Укажите --group-id или уточните --filial-id."
        )
    return next(iter(distinct.values()))


def normalize_lesson(row: JsonRow) -> JsonRow:
    """Keep source fields and expose stable, convenient application fields."""
    weekday = positive_id(row["schedule_weekday_id"], "День недели")
    if weekday > 7:
        raise ScheduleError("День недели вне диапазона 1–7.")
    source_weeks = row["schedule_weeks"]
    if not isinstance(source_weeks, list):
        raise ScheduleError("schedule_weeks должен быть массивом номеров недель.")
    weeks = sorted({positive_id(week, "Номер недели") for week in source_weeks})
    text = str(row.get("schedule_time_title") or "").strip()
    start = end = None
    match = TIME_RANGE.fullmatch(text)
    if match:
        times = []
        for value in match.groups():
            hour, minute = map(int, value.split(":"))
            if not 0 <= hour <= 23 or not 0 <= minute <= 59:
                raise ScheduleError(f"Некорректное время занятия: {text}")
            times.append(f"{hour:02d}:{minute:02d}")
        start, end = times
    return {
        "schedule_id": row["schedule_id"],
        "subject": row["schedule_subject_title"],
        "lesson_type": row.get("type"),
        "weekday": weekday,
        "weeks": weeks,
        "time": {
            "slot": row.get("schedule_time_num"), "text": text,
            "start": start, "end": end,
        },
        "group": {
            "id": row.get("student_group_number_id"),
            "title": row.get("student_group_number_title"),
        },
        "teacher": {
            "id": row.get("teacher_id"),
            "name": row.get("teacher_fullname") or row.get("teacher"),
        },
        "room": {
            "id": row.get("room_id"),
            "title": row.get("room_title"),
            "short_title": row.get("room_title_short"),
            "building_id": row.get("building_id"),
            "building_title": row.get("building_title"),
            "building_short_title": row.get("building_short_title"),
        },
        "comment": row.get("comment"),
        "raw": row,
    }


def schedule_document(
    snapshot: Snapshot, entity_type: str, entity_id: int,
    semester_id: int, week: int | None = None,
) -> JsonRow:
    """Build a serializable snapshot; week numbers are academic, not ISO."""
    if week is not None:
        week = positive_id(week, "Номер учебной недели")
    lessons = []
    undated = []
    for row in snapshot.records:
        weekday = row.get("schedule_weekday_id")
        if isinstance(weekday, bool) or not re.fullmatch(r"[1-7]", str(weekday)):
            # Some source rows have no valid weekday. Keep them visible
            # separately; never guess which day the class belongs to.
            undated.append(row)
        else:
            lessons.append(normalize_lesson(row))
    for lesson in lessons:
        # Room responses can omit room_id; the request already identifies it.
        if lesson[entity_type]["id"] is None:
            lesson[entity_type]["id"] = entity_id
    if week is not None:
        lessons = [lesson for lesson in lessons if week in lesson["weeks"]]
    lessons.sort(key=lambda lesson: (
        lesson["weekday"], lesson["time"]["start"] or "99:99",
        str(lesson["subject"]), str(lesson["schedule_id"]),
    ))
    return {
        "schema_version": 1,
        "source_url": snapshot.url,
        "fetched_at": snapshot.fetched_at,
        "from_cache": snapshot.from_cache,
        "entity": {"type": entity_type, "id": entity_id},
        "semester_id": semester_id,
        "week": week,
        "lessons": lessons,
        "undated": undated,
    }


def cli_positive(value: str) -> int:
    try:
        return positive_id(value, "Значение")
    except ScheduleError as error:
        raise argparse.ArgumentTypeError(str(error)) from error


def cli_building(value: str) -> int:
    return 0 if value == "0" else cli_positive(value)


def make_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Расписание УУНиТ через JSON API сайта. Python 3.10+."
    )
    commands = parser.add_subparsers(dest="command", required=True)
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument(
        "--api-base", default=os.environ.get("UUST_API_BASE", DEFAULT_API_BASE),
        help="Базовый URL API; также UUST_API_BASE.",
    )
    common.add_argument("--cache-dir", type=Path)
    common.add_argument("--cache-ttl", type=float, default=900)
    common.add_argument("--timeout", type=float, default=30)
    common.add_argument("--out", type=Path, help="JSON-файл; иначе stdout.")
    mode = common.add_mutually_exclusive_group()
    mode.add_argument("--offline", action="store_true", help="Только кэш.")
    mode.add_argument("--refresh", action="store_true", help="Обновить кэш.")
    for name in (
        "groups", "teachers", "filials", "organizations", "buildings", "rooms",
    ):
        command = commands.add_parser(name, parents=[common])
        command.add_argument("--query", default="", help="Фильтр по подстроке.")
        command.add_argument("--filial-id", type=cli_positive)
        if name == "groups":
            command.add_argument("--course", type=cli_positive)
        if name == "buildings":
            command.add_argument("--organization-id", type=cli_positive, required=True)
        if name == "rooms":
            command.add_argument("--building-id", type=cli_building, required=True)
    command = commands.add_parser("schedule", parents=[common])
    entity = command.add_mutually_exclusive_group(required=True)
    entity.add_argument("--group-id", type=cli_positive)
    entity.add_argument("--group-name", help="Точное название группы.")
    entity.add_argument("--teacher-id", type=cli_positive)
    entity.add_argument("--room-id", type=cli_positive)
    command.add_argument("--filial-id", type=cli_positive)
    command.add_argument(
        "--semester", type=cli_positive, required=True,
        help="ID периода API, а не номер 1/2. На 26.09.2026: 241 = 2026/2027.",
    )
    command.add_argument("--week", type=cli_positive, help="Учебная неделя.")
    return parser


def run(args: argparse.Namespace) -> JsonRow:
    client = UustClient(
        api_base=args.api_base, cache_dir=args.cache_dir,
        timeout=args.timeout, cache_ttl=args.cache_ttl,
        offline=args.offline, refresh=args.refresh,
    )
    if args.command == "schedule":
        if args.filial_id is not None and args.group_name is None:
            raise ScheduleError("--filial-id применяется вместе с --group-name.")
        if args.group_name is not None:
            group = resolve_group(
                client.groups().records, args.group_name, args.filial_id,
            )
            entity_type, entity_id = "group", int(group["group_id"])
        else:
            entity_type, entity_id = next(
                (name, getattr(args, f"{name}_id")) for name in ENTITY_TYPES
                if getattr(args, f"{name}_id") is not None
            )
        snapshot = client.schedule(entity_type, entity_id, args.semester)
        return schedule_document(
            snapshot, entity_type, entity_id, args.semester, args.week,
        )
    if args.command == "buildings":
        snapshot = client.buildings(args.organization_id)
    elif args.command == "rooms":
        snapshot = client.rooms(args.building_id)
    else:
        snapshot = getattr(client, args.command)()
    records = snapshot.records
    if args.query:
        query = args.query.casefold()
        records = [
            row for row in records
            if query in " ".join(str(value) for value in row.values()).casefold()
        ]
    if args.filial_id is not None:
        records = [
            row for row in records
            if str(row.get("filial_id")) == str(args.filial_id)
        ]
    if getattr(args, "course", None) is not None:
        records = [
            row for row in records if str(row.get("course")) == str(args.course)
        ]
    return {
        "source_url": snapshot.url, "fetched_at": snapshot.fetched_at,
        "from_cache": snapshot.from_cache, "records": records,
    }


def main(argv: list[str] | None = None) -> int:
    args = make_parser().parse_args(argv)
    try:
        document = run(args)
        if args.out:
            atomic_json(args.out, document)
            print(f"Сохранено: {args.out}", file=sys.stderr)
        else:
            print(json.dumps(document, ensure_ascii=False, indent=2))
    except (ScheduleError, OSError) as error:
        print(f"Ошибка: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
