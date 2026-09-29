import { Repository } from './repository.mjs'
import { PythonSource } from './python-source.mjs'
import { calendar, PREFIX, SCHEDULE_KINDS, weekDays } from './settings.mjs'

export class ApiError extends Error {
  constructor(status, message, retryAfter = null) {
    super(message)
    this.status = status
    this.retryAfter = retryAfter
  }
}

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const resourceKey = (resource) => JSON.stringify(resource)
const numeric = (value) => value == null || value === '' ? null : Number(value)
const informative = (value) => typeof value === 'string' && /[\p{L}\p{N}]/u.test(value)
  ? value.trim() : null

export function integer(value, label, min = 1, max = Number.MAX_SAFE_INTEGER) {
  if (value === null || value === undefined || !/^\d+$/.test(String(value))) {
    throw new ApiError(422, `${label}: требуется целое число от ${min} до ${max}.`)
  }
  const number = Number(value)
  if (!Number.isSafeInteger(number) || number < min || number > max) {
    throw new ApiError(422, `${label}: значение вне допустимого диапазона.`)
  }
  return number
}

function validatePayload(resource, payload) {
  if (!object(payload) || typeof payload.source_url !== 'string'
      || typeof payload.fetched_at !== 'string' || !Number.isFinite(Date.parse(payload.fetched_at))
      || !Array.isArray(payload.records) || !payload.records.every(object)) {
    throw new Error('Источник вернул неизвестный формат данных; сохранённая копия не изменена.')
  }
  if (resource.kind === 'groups' && !payload.records.every((row) =>
    Number.isSafeInteger(Number(row.group_id)) && Number(row.group_id) > 0
      && typeof row.group_title === 'string' && row.group_title.trim())) {
    throw new Error('Источник вернул некорректный список групп.')
  }
  if (SCHEDULE_KINDS.has(resource.kind)) {
    if (!Array.isArray(payload.lessons) || !Array.isArray(payload.undated)
        || payload.lessons.length + payload.undated.length !== payload.records.length
        || !payload.undated.every((row) => object(row)
          && (typeof row.schedule_weekday_id === 'boolean'
            || !/^[1-7]$/.test(String(row.schedule_weekday_id))))
        || !payload.lessons.every((lesson) => object(lesson)
          && typeof lesson.id === 'string' && typeof lesson.subject === 'string'
          && Number.isInteger(lesson.weekday) && lesson.weekday >= 1 && lesson.weekday <= 7
          && Array.isArray(lesson.weeks) && lesson.weeks.every((week) => Number.isInteger(week) && week > 0)
          && object(lesson.time) && object(lesson.room) && object(lesson.teacher) && object(lesson.raw))
        || new Set(payload.lessons.map((lesson) => lesson.id)).size !== payload.lessons.length) {
      throw new Error('Источник вернул некорректные занятия; сохранённая копия не изменена.')
    }
  }
}

export class ScheduleService {
  constructor(settings, { source = new PythonSource(settings), now = Date.now, background = true, bulkImport = true } = {}) {
    this.settings = settings
    this.source = source
    this.now = now
    this.repository = new Repository(settings.database, settings.namespace)
    this.repository.seedWatchedGroups(this.now(), settings.periodId)
    const savedCatalog = this.repository.get(resourceKey({ kind: 'groups' }))
    if (savedCatalog) this.repository.prepareImport(savedCatalog.payload.records,
      settings.periodId, savedCatalog.payload.fetched_at, settings.scheduleTtl)
    this.pending = new Map()
    this.queue = []
    this.active = 0
    this.backgroundActive = 0
    this.closing = false
    this.backgroundEnabled = background && !settings.offline
    this.importEnabled = this.backgroundEnabled && bulkImport
    this.importing = new Set()
    if (background && !settings.offline) {
      this.lastSweepDate = calendar(settings, this.now()).today
      this.timer = setInterval(() => this.tick(), settings.pollInterval * 1000)
      this.timer.unref()
      queueMicrotask(() => this.refreshWatchedGroups())
      queueMicrotask(() => this.refresh({ kind: 'groups' }).catch(() => {}))
      queueMicrotask(() => this.pumpImport())
    }
  }

  tick() {
    if (this.closing || this.settings.offline) return
    this.refreshDue()
    this.pumpImport()
    const today = calendar(this.settings, this.now()).today
    if (today !== this.lastSweepDate) {
      this.lastSweepDate = today
      this.refreshWatchedGroups()
    }
  }

  refreshWatchedGroups() {
    if (this.closing || this.settings.offline) return
    for (const id of this.repository.watchedGroups(this.now(), this.settings.periodId)) {
      this.refresh({ kind: 'group', id, period: this.settings.periodId }).catch(() => {})
    }
  }

  pumpImport() {
    if (!this.importEnabled || this.closing) return
    const period = this.settings.periodId
    while (this.importing.size < 1) {
      const id = this.repository.nextImport(period, this.now(), this.importing)
      if (id === null) break
      const resource = { kind: 'group', id, period }
      const key = resourceKey(resource)
      const failure = this.repository.failure(key)
      if (failure && failure.retry_at > this.now()) {
        this.repository.importFailure(id, period, failure.retry_at)
        continue
      }
      this.importing.add(id)
      this.refresh(resource).catch(() => {
        const until = this.repository.failure(key)?.retry_at ?? this.now() + this.settings.retryDelay * 1000
        this.repository.importFailure(id, period, until)
      }).finally(() => {
        this.importing.delete(id)
        if (!this.closing) queueMicrotask(() => this.pumpImport())
      })
    }
  }

  refreshDue() {
    if (this.closing) return
    const now = this.now()
    for (const key of this.repository.due(now)) {
      this.refresh(JSON.parse(key)).catch(() => {})
    }
    const catalogKey = resourceKey({ kind: 'groups' })
    const catalogFailure = this.repository.failure(catalogKey)
    if (this.backgroundEnabled && !this.repository.get(catalogKey)
        && (!catalogFailure || catalogFailure.retry_at <= now)) {
      this.refresh({ kind: 'groups' }).catch(() => {})
    }
    // A failed first fetch has no snapshot, so it cannot appear in due().
    for (const id of this.repository.watchedGroups(now, this.settings.periodId)) {
      const resource = { kind: 'group', id, period: this.settings.periodId }
      const key = resourceKey(resource)
      const failure = this.repository.failure(key)
      if (!this.repository.get(key) && (!failure || failure.retry_at <= now)) {
        this.refresh(resource).catch(() => {})
      }
    }
  }

  refresh(resource, { priority = false, force = false } = {}) {
    const key = resourceKey(resource)
    if (this.pending.has(key)) {
      if (priority) {
        const index = this.queue.findIndex((job) => job.key === key)
        if (index >= 0) {
          const [job] = this.queue.splice(index, 1)
          job.priority = true
          this.queue.unshift(job)
          this.drain()
        }
      }
      return this.pending.get(key)
    }
    if (this.closing || this.settings.offline) return Promise.reject(new ApiError(503, 'Обновление отключено.'))
    const failure = this.repository.failure(key)
    if (!force && failure && failure.retry_at > this.now()) {
      return Promise.reject(new ApiError(503, failure.message, Math.ceil((failure.retry_at - this.now()) / 1000)))
    }
    if (!priority && this.pending.size >= 100) return Promise.reject(new ApiError(503, 'Очередь обновления заполнена. Повторите позже.', 30))
    let resolveJob, rejectJob
    const promise = new Promise((resolve, reject) => { resolveJob = resolve; rejectJob = reject })
    this.pending.set(key, promise)
    const job = { key, resource, priority, resolve: resolveJob, reject: rejectJob }
    if (priority) this.queue.unshift(job); else this.queue.push(job)
    this.drain()
    return promise
  }

  drain() {
    while (!this.closing && this.active < 2 && this.queue.length) {
      let index = this.queue.findIndex((job) => job.priority)
      if (index < 0) {
        if (this.backgroundActive >= 1) break
        index = 0
      }
      const [job] = this.queue.splice(index, 1)
      this.active += 1
      if (!job.priority) this.backgroundActive += 1
      this.perform(job)
    }
  }

  async perform(job) {
    try {
      const payload = await this.source.fetch(job.resource)
      validatePayload(job.resource, payload)
      const ttl = SCHEDULE_KINDS.has(job.resource.kind) ? this.settings.scheduleTtl : this.settings.catalogTtl
      this.repository.save(job.key, payload, this.now() + ttl * 1000, this.now())
      if (job.resource.kind === 'groups') {
        this.repository.prepareImport(payload.records, this.settings.periodId,
          payload.fetched_at, this.settings.scheduleTtl)
        queueMicrotask(() => this.pumpImport())
      } else if (job.resource.kind === 'group' && job.resource.period === this.settings.periodId) {
        this.repository.importSuccess(job.resource.id, this.settings.periodId, this.now())
      }
      job.resolve(payload)
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2000) : 'Ошибка источника расписания.'
      this.repository.recordFailure(job.key, message, this.now() + this.settings.retryDelay * 1000)
      job.reject(new ApiError(503, message, this.settings.retryDelay))
    } finally {
      this.pending.delete(job.key)
      this.active -= 1
      if (!job.priority) this.backgroundActive -= 1
      this.drain()
    }
  }

  async snapshot(resource, { priority = false, force = false } = {}) {
    const key = resourceKey(resource)
    let cached = this.repository.get(key)
    if (force) {
      if (this.settings.offline) throw new ApiError(503, 'Обновление отключено.')
      await this.refresh(resource, { priority, force: true })
      cached = this.repository.get(key)
    } else if (!cached) {
      if (this.settings.offline) throw new ApiError(503, 'Сервис работает без сети; сохранённой копии этих данных ещё нет.', 60)
      await this.refresh(resource, { priority })
      cached = this.repository.get(key)
    } else if (cached.expiresAt <= this.now() && !this.settings.offline) {
      this.refresh(resource).catch(() => {})
    }
    this.repository.touch(key, this.now())
    const failure = this.repository.failure(key)
    return {
      payload: cached.payload,
      metadata: {
        source_url: cached.payload.source_url, fetched_at: cached.payload.fetched_at,
        expires_at: new Date(cached.expiresAt).toISOString(),
        stale: cached.expiresAt <= this.now(), refreshing: this.pending.has(key),
        refresh_error: failure?.message ?? null, offline: this.settings.offline,
      },
    }
  }

  async schedule(kind, id, period, week = null, includeRaw = false, forceRefresh = false) {
    if (!SCHEDULE_KINDS.has(kind)) throw new ApiError(422, 'Неизвестный тип расписания.')
    integer(id, 'ID')
    integer(period, 'Учебный период')
    if (week !== null) {
      integer(week, 'Учебная неделя', 1, 53)
      if (period !== this.settings.periodId) throw new ApiError(422, 'Календарь настроен для другого периода. Запросите весь период без week или обновите настройки сервиса.')
    }
    if (kind === 'group' && period === this.settings.periodId) {
      this.repository.watchGroup(id, period, this.now())
    }
    const { payload, metadata } = await this.snapshot(
      { kind, id, period }, { priority: true, force: forceRefresh },
    )
    const undated = payload.undated ?? [] // Snapshots from older service versions.
    const informativeUndated = undated.map((row) => ({
      subject: informative(row.schedule_subject_title),
      teacher: informative(row.teacher_fullname) ?? informative(row.teacher),
      comment: informative(row.comment),
      weeks: Array.isArray(row.schedule_weeks) ? row.schedule_weeks : null,
    })).filter((entry) => entry.subject || entry.teacher || entry.comment)
    const days = weekDays(this.settings, week)
    const links = this.repository.links()
    const lessons = payload.lessons.filter((lesson) => week === null || lesson.weeks.includes(week)).map((lesson) => {
      const { raw, ...fields } = lesson
      return {
        ...fields, date: week === null ? null : days[lesson.weekday - 1].date,
        room: { ...lesson.room, map_id: links.get(Number(lesson.room.id)) ?? null },
        ...(includeRaw ? { raw } : {}),
      }
    })
    return {
      schema_version: 1, ...metadata, entity: { type: kind, id }, semester_id: period, week,
      week_start: days[0]?.date ?? null, week_end: days[6]?.date ?? null, days, lessons,
      undated_count: informativeUndated.length,
      undated: informativeUndated,
    }
  }

  async groups(query = '', limit = 30, filial = null, course = null) {
    const { payload, metadata } = await this.snapshot({ kind: 'groups' })
    const text = query.trim().toLocaleLowerCase('ru')
    const groups = payload.records.filter((row) =>
      row.group_title.toLocaleLowerCase('ru').includes(text)
      && (filial === null || Number(row.filial_id) === filial)
      && (course === null || Number(row.course) === course))
      .map((row) => ({
        group_id: Number(row.group_id), group_title: row.group_title,
        course: numeric(row.course), faculty: row.faculty_title ?? row.faculty ?? null,
        filial_id: numeric(row.filial_id), filial_title: row.filial_title ?? null,
      })).sort((a, b) => a.group_title.localeCompare(b.group_title, 'ru') || a.group_id - b.group_id)
    return { ...metadata, groups: groups.slice(0, limit), total: groups.length, truncated: groups.length > limit }
  }

  availableGroups() {
    const key = resourceKey({ kind: 'groups' })
    const cached = this.repository.get(key)
    const known = new Map()
    if (cached) {
      for (const row of cached.payload.records) {
        const id = Number(row.group_id)
        if (!Number.isSafeInteger(id) || id <= 0 || typeof row.group_title !== 'string') continue
        known.set(id, {
          group_id: id, group_title: row.group_title,
          course: numeric(row.course), faculty: row.faculty_title ?? row.faculty ?? null,
          filial_id: numeric(row.filial_id), filial_title: row.filial_title ?? null,
        })
      }
    }
    const groups = [...known.values()].sort((a, b) =>
      a.group_title.localeCompare(b.group_title, 'ru') || a.group_id - b.group_id)
    const failure = this.repository.failure(key)
    return {
      groups, total: groups.length, catalog_loaded: Boolean(cached),
      fetched_at: cached?.payload.fetched_at ?? null,
      refreshing: this.pending.has(key), refresh_error: failure?.message ?? null,
      import: this.repository.importProgress(this.settings.periodId, this.now()),
    }
  }

  async catalog(resource) {
    const { payload, metadata } = await this.snapshot(resource)
    return { ...metadata, records: payload.records }
  }

  async route(path, params) {
    if (path === '/config') return calendar(this.settings, this.now())
    if (path === '/health') return {
      status: 'ok', offline: this.settings.offline, cached_resources: this.repository.count(),
      pending_refreshes: this.pending.size,
      group_import: this.repository.importProgress(this.settings.periodId, this.now()),
    }
    const optionalInt = (key, min = 1, max = Number.MAX_SAFE_INTEGER) =>
      params.has(key) ? integer(params.get(key), key, min, max) : null
    if (path === '/groups/available') return this.availableGroups()
    if (path === '/groups') {
      const query = params.get('q') ?? ''
      if (query.length > 200) throw new ApiError(422, 'Слишком длинный поисковый запрос.')
      return this.groups(query, optionalInt('limit', 1, 100) ?? 30, optionalInt('filial_id'), optionalInt('course', 1, 12))
    }
    const schedule = /^\/schedules\/(group|teacher|room)\/([^/]+)$/.exec(path)
    if (schedule) {
      const raw = params.get('include_raw') ?? 'false'
      const refresh = params.get('refresh') ?? 'false'
      if (!['true', 'false', '1', '0'].includes(raw)) throw new ApiError(422, 'include_raw: используйте true или false.')
      if (!['true', 'false', '1', '0'].includes(refresh)) throw new ApiError(422, 'refresh: используйте true или false.')
      return this.schedule(schedule[1], integer(schedule[2], 'ID'), optionalInt('semester') ?? this.settings.periodId,
        optionalInt('week', 1, 53), raw === 'true' || raw === '1', refresh === 'true' || refresh === '1')
    }
    if (path === '/buildings') return this.catalog({ kind: 'buildings', id: integer(params.get('organization_id'), 'organization_id') })
    if (path === '/rooms') return this.catalog({ kind: 'rooms', id: integer(params.get('building_id'), 'building_id', 0) })
    const catalog = /^\/catalogs\/(teachers|filials|organizations)$/.exec(path)
    if (catalog) return this.catalog({ kind: catalog[1] })
    throw new ApiError(404, 'Метод API не найден.')
  }

  middleware() {
    return (req, res, next) => {
      const url = new URL(req.url, 'http://localhost')
      if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) { next(); return }
      const send = (status, data, retryAfter = null) => {
        if (res.destroyed || res.writableEnded) return
        res.statusCode = status
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        if (retryAfter !== null) res.setHeader('Retry-After', String(retryAfter))
        res.end(JSON.stringify(data))
      }
      if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); send(405, { detail: 'Используйте GET.' }); return }
      this.route(url.pathname.slice(PREFIX.length), url.searchParams)
        .then((data) => send(200, data))
        .catch((error) => {
          if (!(error instanceof ApiError)) console.error('[schedule]', error)
          send(error instanceof ApiError ? error.status : 500,
            { detail: error instanceof ApiError ? error.message : 'Внутренняя ошибка сервиса расписания.' }, error.retryAfter ?? null)
        })
    }
  }

  close() {
    if (this.closePromise) return this.closePromise
    this.closing = true
    clearInterval(this.timer)
    const pending = [...this.pending.values()]
    for (const job of this.queue.splice(0)) {
      this.pending.delete(job.key)
      job.reject(new ApiError(503, 'Сервис останавливается.'))
    }
    this.source.close?.()
    this.closePromise = Promise.allSettled(pending).then(() => this.repository.close())
    return this.closePromise
  }
}
