"""One JSON job on stdin, one validated JSON result on stdout; no server."""

from collections import Counter
import hashlib
import json
import sys

from uust_parser import ScheduleError, UustClient, schedule_document


def execute(job: dict) -> dict:
    client = UustClient(
        api_base=job["base_url"], timeout=job.get("timeout", 20),
        cache_enabled=False, retries=1,
    )
    kind = job["kind"]
    if kind in {"group", "teacher", "room"}:
        snapshot = client.schedule(kind, job["id"], job["period"])
    elif kind == "buildings":
        snapshot = client.buildings(job["id"])
    elif kind == "rooms":
        snapshot = client.rooms(job["id"])
    elif kind in {"groups", "teachers", "filials", "organizations"}:
        snapshot = getattr(client, kind)()
    else:
        raise ScheduleError("Неизвестный вид данных.")
    result = {
        "source_url": snapshot.url,
        "fetched_at": snapshot.fetched_at,
        "records": snapshot.records,
    }
    if kind in {"group", "teacher", "room"}:
        document = schedule_document(
            snapshot, kind, job["id"], job["period"],
        )
        result["lessons"] = document["lessons"]
        result["undated"] = document["undated"]
        occurrences = Counter()
        for lesson in result["lessons"]:
            canonical = json.dumps(
                lesson["raw"], ensure_ascii=False, sort_keys=True,
            ).encode("utf-8")
            digest = hashlib.sha256(canonical).hexdigest()[:20]
            occurrences[digest] += 1
            lesson["id"] = f"{digest}-{occurrences[digest]}"
    return result


def main() -> int:
    try:
        job = json.load(sys.stdin)
        print(json.dumps(execute(job), ensure_ascii=False))
    except (ScheduleError, OSError, ValueError, KeyError, TypeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
