import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { settingsFromEnv, calendar, SERVICE_ROOT } from '../settings.mjs'
import { ScheduleService } from '../service.mjs'
import { PythonSource } from '../python-source.mjs'

const python = process.env.SCHEDULE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
const raw = JSON.parse(readFileSync(new URL('./fixtures/group-13650.json', import.meta.url), 'utf8'))
// Recorded source response, normalized by the actual Python implementation.
const lessons = JSON.parse(execFileSync(python, ['-c', `
import sys, json
sys.path.insert(0, sys.argv[1])
from uust_parser import Snapshot, schedule_document
rows = json.load(sys.stdin)
snapshot = Snapshot("https://fixture.invalid", "2026-09-26T10:00:00+00:00", rows, False)
print(json.dumps(schedule_document(snapshot, "group", 13650, 241)["lessons"]))
`, join(SERVICE_ROOT, 'python')], { input: JSON.stringify(raw), encoding: 'utf8' }))
  .map((lesson, index) => ({ ...lesson, id: `recorded-${index}` }))
const payload = { source_url: 'https://fixture.invalid', fetched_at: '2026-09-26T10:00:00+00:00', records: raw, lessons, undated: [] }
const catalog = { source_url: 'https://fixture.invalid/groups', fetched_at: '2026-09-26T10:00:00+00:00', records: [
  { group_id: 13650, group_title: 'БМИ-ИВТ-103М' },
] }
const resource = { kind: 'group', id: 13650, period: 241 }
const clone = (value) => structuredClone(value)

test('site mode loads the group catalog and fetches only groups requested by a student', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'pocketuust-schedule-lazy-'))
  const calls = []
  const source = { fetch: async item => {
    calls.push(item.kind)
    return clone(item.kind === 'groups' ? catalog : payload)
  } }
  const service = new ScheduleService(settingsFromEnv({}, {database:join(directory,'cache.sqlite3')}),
    {source,bulkImport:false})
  t.after(async()=>{await service.close();rmSync(directory,{recursive:true,force:true})})
  await service.snapshot({kind:'groups'})
  await new Promise(resolve=>setImmediate(resolve))
  assert.deepEqual(calls,['groups'])
  assert.equal(service.availableGroups().groups.length,1)
  await service.schedule('group',13650,241,4)
  assert.deepEqual(calls,['groups','group'])
})

function setup(t, { fetcher, overrides = {} } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'pocketuust-schedule-'))
  let time = Date.parse('2026-09-26T10:00:00Z')
  let calls = 0
  const settings = settingsFromEnv({}, { database: join(directory, 'cache.sqlite3'), scheduleTtl: 10, ...overrides })
  const source = { fetch: async (item) => { calls++; return fetcher ? fetcher(item) : clone(payload) } }
  const service = new ScheduleService(settings, { source, now: () => time, background: false })
  t.after(async () => { await service.close(); rmSync(directory, { recursive: true, force: true }) })
  return { service, settings, directory, calls: () => calls, advance: (ms) => { time += ms } }
}

async function listen(t, handler) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections() }))
  return `http://127.0.0.1:${server.address().port}`
}

test('one source request serves concurrent clients and fresh cache reads', async (t) => {
  const { service, calls } = setup(t)
  const responses = await Promise.all(Array.from({ length: 12 }, () => service.schedule('group', 13650, 241, 4)))
  assert.equal(calls(), 1)
  assert.equal(responses[0].lessons.length, 8)
  await service.schedule('group', 13650, 241, 5)
  assert.equal(calls(), 1)
})

test('explicit refresh replaces a fresh database snapshot from the source', async (t) => {
  const { service, calls } = setup(t)
  await service.schedule('group', 13650, 241, 4)
  assert.equal(calls(), 1)
  await service.schedule('group', 13650, 241, 4, false, true)
  assert.equal(calls(), 2)
})

test('academic weeks use configured Monday and preserve repeated source IDs', async (t) => {
  const { service } = setup(t)
  const response = await service.schedule('group', 13650, 241, 4)
  assert.equal(response.week_start, '2026-09-21')
  assert.equal(response.week_end, '2026-09-27')
  assert.ok(response.lessons.every((lesson) => lesson.weeks.includes(4) && lesson.date))
  const all = await service.schedule('group', 13650, 241)
  assert.equal(all.lessons.length, 41)
  const repeated = all.lessons.filter((lesson) => Number(lesson.schedule_id) === 242463)
  assert.deepEqual(repeated.map((lesson) => lesson.time.slot).sort(), [3, 4])
  assert.equal(new Set(all.lessons.map((lesson) => lesson.id)).size, 41)
  assert.ok(all.lessons.every((lesson) => !('raw' in lesson) && lesson.room.map_id === null))
})

test('stale cache responds immediately; failed refresh retains data and backs off', async (t) => {
  let fail = false
  const { service, advance, calls } = setup(t, { fetcher: () => { if (fail) throw new Error('Источник недоступен'); return clone(payload) } })
  await service.snapshot(resource)
  fail = true
  advance(11000)
  const stale = await service.snapshot(resource)
  assert.equal(stale.metadata.stale, true)
  assert.equal(stale.metadata.refreshing, true)
  await Promise.allSettled([...service.pending.values()])
  const after = await service.snapshot(resource)
  assert.equal(after.metadata.refresh_error, 'Источник недоступен')
  assert.equal(after.payload.lessons.length, 41)
  assert.equal(after.metadata.fetched_at, payload.fetched_at)
  assert.equal(calls(), 2)
  advance(61000)
  fail = false
  await service.refresh(resource)
  assert.equal(calls(), 3)
  assert.equal((await service.snapshot(resource)).metadata.refresh_error, null)
})

test('malformed replacement cannot erase a successful snapshot', async (t) => {
  let malformed = false
  const { service, advance } = setup(t, { fetcher: () => malformed ? { ...payload, lessons: [] } : clone(payload) })
  await service.snapshot(resource)
  malformed = true
  advance(11000)
  await assert.rejects(service.refresh(resource), /некорректные занятия/)
  assert.equal((await service.snapshot(resource)).payload.lessons.length, 41)
})

test('a valid empty schedule replaces removed lessons', async (t) => {
  let empty = false
  const { service, advance } = setup(t, { fetcher: () => empty ? { ...payload, records: [], lessons: [] } : clone(payload) })
  await service.snapshot(resource)
  empty = true
  advance(11000)
  await service.refresh(resource)
  const result = await service.schedule('group', 13650, 241, 4)
  assert.deepEqual(result.lessons, [])
  assert.equal(result.stale, false)
})

test('database survives restart and serves offline; upstream namespace isolates caches', async (t) => {
  const { service, settings } = setup(t)
  await service.snapshot(resource)
  await service.close()
  const offline = new ScheduleService({ ...settings, offline: true }, { background: false })
  const another = new ScheduleService(settingsFromEnv({}, { ...settings, upstreamUrl: 'https://another.invalid', offline: true }), { background: false })
  try {
    assert.equal((await offline.schedule('group', 13650, 241, 4)).lessons.length, 8)
    await assert.rejects(another.snapshot(resource), /сохранённой копии/)
  } finally { await offline.close(); await another.close() }
})

test('only explicit room mappings are returned; raw data is opt-in', async (t) => {
  const { service } = setup(t)
  const first = await service.schedule('group', 13650, 241, 4)
  const id = Number(first.lessons.find((lesson) => lesson.room.id).room.id)
  service.repository.linkRoom(id, 'test-building:2:201')
  const mapped = await service.schedule('group', 13650, 241, 4, true)
  assert.ok(mapped.lessons.filter((lesson) => Number(lesson.room.id) === id).every((lesson) => lesson.room.map_id === 'test-building:2:201'))
  assert.ok(mapped.lessons.every((lesson) => lesson.raw))
})

test('group search preserves same-name groups, filters campus and reports empty matches', async (t) => {
  const { service, calls } = setup(t, { fetcher: () => ({
    ...payload, records: [
      { group_id: 1, group_title: 'ИВТ-101', filial_id: 2, course: 1 },
      { group_id: 2, group_title: 'ИВТ-101', filial_id: 3, course: 1 },
      { group_id: 3, group_title: 'ПИ-201', filial_id: 2, course: 2 },
    ],
  }) })
  const result = await service.groups('ивт', 1)
  assert.equal(result.total, 2)
  assert.equal(result.truncated, true)
  assert.equal((await service.groups('ивт', 30, 3)).groups[0].group_id, 2)
  assert.equal((await service.groups('нет')).total, 0)
  assert.equal(calls(), 1)
})

test('HTTP contract validates before fetching and does not expose writes', async (t) => {
  const { service, calls } = setup(t)
  const middleware = service.middleware()
  const base = await listen(t, (req, res) => middleware(req, res, () => { res.statusCode = 404; res.end() }))
  for (const path of ['/schedules/group/-1', '/schedules/group/1?week=0', '/schedules/group/1?week=54',
    '/schedules/group/1?week=3&semester=240', '/schedules/group/1?include_raw=oops',
    '/schedules/group/1?refresh=oops', '/rooms', '/groups?limit=101']) {
    assert.equal((await fetch(`${base}/api/schedule/v1${path}`)).status, 422, path)
  }
  assert.equal(calls(), 0)
  const write = await fetch(`${base}/api/schedule/v1/groups`, { method: 'POST' })
  assert.equal(write.status, 405)
  assert.equal(write.headers.get('allow'), 'GET')
  const response = await fetch(`${base}/api/schedule/v1/schedules/group/13650?week=4`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal((await response.json()).lessons.length, 8)
})

test('cold source failures return 503 and Retry-After, never an empty schedule', async (t) => {
  const { service, calls } = setup(t, { fetcher: () => { throw new Error('Timeout') } })
  const middleware = service.middleware()
  const base = await listen(t, (req, res) => middleware(req, res, () => res.end()))
  for (let i = 0; i < 2; i++) {
    const result = await fetch(`${base}/api/schedule/v1/schedules/group/13650?week=4`)
    assert.equal(result.status, 503)
    assert.equal(result.headers.get('retry-after'), '60')
    assert.equal((await result.json()).detail, 'Timeout')
  }
  assert.equal(calls(), 1)
})

test('background refresh updates only cached resources used recently', async (t) => {
  const { service, advance, calls } = setup(t)
  await service.snapshot(resource)
  advance(11000)
  service.refreshDue()
  await Promise.allSettled([...service.pending.values()])
  assert.equal(calls(), 2)
  advance(8 * 86400000)
  service.refreshDue()
  assert.equal(calls(), 2)
})

test('source concurrency is globally limited to two different schedules', async (t) => {
  let active = 0, peak = 0
  const releases = []
  const { service } = setup(t, { fetcher: async () => {
    active++; peak = Math.max(peak, active)
    await new Promise((resolve) => releases.push(resolve))
    active--; return clone(payload)
  } })
  const tasks = [1, 2, 3, 4].map((id) => service.snapshot(
    { kind: 'group', id, period: 241 }, { priority: true },
  ))
  assert.equal(releases.length, 2)
  releases.shift()(); releases.shift()()
  await new Promise((resolve) => setImmediate(resolve))
  releases.shift()(); releases.shift()()
  await Promise.all(tasks)
  assert.equal(peak, 2)
})

test('a user request starts while the background import is busy', async (t) => {
  const started = []
  let releaseFirst
  const firstGate = new Promise((resolve) => { releaseFirst = resolve })
  const { service } = setup(t, { fetcher: async (item) => {
    started.push(item.id)
    if (item.id === 1) await firstGate
    return clone(payload)
  } })
  const first = service.refresh({ kind: 'group', id: 1, period: 241 })
  const waiting = service.refresh({ kind: 'group', id: 2, period: 241 })
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(started, [1])

  const foreground = service.schedule('group', 3, 241, 4)
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(started, [1, 3])
  await foreground
  assert.deepEqual(started, [1, 3], 'the queued import still waits for its background slot')

  releaseFirst()
  await Promise.all([first, waiting])
  assert.deepEqual(started, [1, 3, 2])
})

test('real Python subprocess reads gzipped source JSON and rejects a broken response', async (t) => {
  let broken = false
  const base = await listen(t, (req, res) => {
    assert.equal(req.url, '/schedule/0/13650/semester/241?site=schedule')
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Encoding', 'gzip')
    res.end(gzipSync(broken ? '{"broken":' : JSON.stringify(raw)))
  })
  const source = new PythonSource(settingsFromEnv({}, { upstreamUrl: base, python }))
  t.after(() => source.close())
  const parsed = await source.fetch(resource)
  assert.equal(parsed.lessons.length, 41)
  assert.equal(new Set(parsed.lessons.map((lesson) => lesson.id)).size, 41)
  assert.ok(parsed.lessons.some((lesson) => /[А-Яа-я]/.test(lesson.subject)))
  assert.ok(parsed.lessons.every((lesson) => !lesson.subject.includes('�')))
  broken = true
  await assert.rejects(source.fetch(resource), /JSON/)
})

test('an upstream row without weekday is reported separately and valid lessons remain available', async (t) => {
  const withoutDay = { ...raw[0], schedule_weekday_id: 0, schedule_id: 999999 }
  const invalidDay = { ...raw[0], schedule_weekday_id: 'не указан', schedule_id: 999998 }
  const placeholder = { ...raw[0], schedule_weekday_id: 0, schedule_id: 999997,
    schedule_subject_title: '.', teacher_fullname: '', teacher: '', comment: '' }
  const upstream = await listen(t, (_req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(JSON.stringify([...raw, withoutDay, invalidDay, placeholder]))
  })
  const source = new PythonSource(settingsFromEnv({}, { upstreamUrl: upstream, python }))
  t.after(() => source.close())
  const result = await source.fetch(resource)
  assert.equal(result.records.length, 44)
  assert.equal(result.lessons.length, 41)
  assert.equal(result.undated.length, 3)
  const { service } = setup(t, { fetcher: () => result })
  const response = await service.schedule('group', 13650, 241, 4)
  assert.equal(response.lessons.length, 8)
  assert.equal(response.undated_count, 2)
  assert.equal(response.undated[0].subject, withoutDay.schedule_subject_title)
  assert.ok(response.undated.every((entry) => entry.subject !== '.'))
})

test('calendar follows Ufa date and rejects invalid period anchors', () => {
  const settings = settingsFromEnv({})
  const config = calendar(settings, Date.parse('2026-09-27T20:30:00Z'))
  assert.equal(config.today, '2026-09-28')
  assert.equal(config.current_week, 5)
  assert.equal(config.window_start_week, 5)
  assert.equal(config.window_end_week, 9)
  assert.equal(config.window_start_date, '2026-09-28')
  assert.equal(config.window_end_date, '2026-11-01')
  assert.throws(() => settingsFromEnv({}, { firstMonday: '2026-09-01' }), /понедельника/)
})

test('selected group is prefetched on next startup and once per Ufa calendar day', async (t) => {
  const { service, settings } = setup(t)
  await service.schedule('group', 13650, 241, 4)
  assert.deepEqual(service.repository.watchedGroups(Date.parse('2026-09-26T10:00:00Z'), 241), [13650])
  await service.close()

  let now = Date.parse('2026-09-26T10:00:00Z')
  let calls = 0
  const restarted = new ScheduleService(settings, {
    source: { fetch: async (item) => item.kind === 'groups' ? clone(catalog) : (calls++, clone(payload)) },
    now: () => now, background: true,
  })
  try {
    await new Promise((resolve) => setImmediate(resolve))
    await Promise.allSettled([...restarted.pending.values()])
    assert.equal(calls, 1, 'startup refreshes a previously selected group')
    restarted.tick()
    assert.equal(calls, 1, 'same day does not refresh again')
    now = Date.parse('2026-09-26T19:01:00Z') // Already Sep 27 in Ufa.
    restarted.tick()
    await Promise.allSettled([...restarted.pending.values()])
    assert.equal(calls, 2)
    restarted.tick()
    assert.equal(calls, 2)
  } finally { await restarted.close() }
})

test('a failed first request still registers the group for startup retry', async (t) => {
  const { service, settings } = setup(t, { fetcher: () => { throw new Error('Источник недоступен') } })
  await assert.rejects(service.schedule('group', 13650, 241, 4), /Источник недоступен/)
  assert.equal(service.repository.count(), 0)
  await service.close()
  let calls = 0
  const restarted = new ScheduleService(settings, {
    source: { fetch: async (item) => item.kind === 'groups' ? clone(catalog) : (calls++, clone(payload)) },
    now: () => Date.parse('2026-09-26T10:02:00Z'), background: true,
  })
  try {
    await new Promise((resolve) => setImmediate(resolve))
    await Promise.allSettled([...restarted.pending.values()])
    assert.equal(calls, 1)
    assert.equal((await restarted.schedule('group', 13650, 241, 4)).lessons.length, 8)
  } finally { await restarted.close() }
})

test('a failed first fetch retries automatically when the backoff expires', async (t) => {
  let fail = true
  const { service, advance, calls } = setup(t, {
    fetcher: () => { if (fail) throw new Error('Временная ошибка'); return clone(payload) },
  })
  await assert.rejects(service.schedule('group', 13650, 241, 4), /Временная ошибка/)
  service.refreshDue()
  assert.equal(calls(), 1, 'a retry must respect the 60 second backoff')
  fail = false
  advance(61000)
  service.refreshDue()
  await Promise.allSettled([...service.pending.values()])
  assert.equal(calls(), 2)
  assert.equal((await service.schedule('group', 13650, 241, 4)).lessons.length, 8)
})

test('startup imports previously cached groups from the old database format', async (t) => {
  const { service, settings } = setup(t)
  await service.snapshot(resource)
  assert.deepEqual(service.repository.watchedGroups(Date.parse('2026-09-26T10:00:00Z'), 241), [])
  await service.close()
  let calls = 0
  const restarted = new ScheduleService(settings, {
    source: { fetch: async (item) => item.kind === 'groups' ? clone(catalog) : (calls++, clone(payload)) },
    now: () => Date.parse('2026-09-26T10:00:00Z'), background: true,
  })
  try {
    await new Promise((resolve) => setImmediate(resolve))
    await Promise.allSettled([...restarted.pending.values()])
    assert.equal(calls, 1)
  } finally { await restarted.close() }
})

test('dropdown reads only SQLite while all group schedules import and resume after restart', async (t) => {
  const fullCatalog = { ...catalog, records: [
    { group_id: 10, group_title: 'Группа-А' },
    { group_id: 11, group_title: 'Группа-Б' },
    { group_id: 12, group_title: 'Группа-В' },
  ] }
  const { service, settings, calls } = setup(t, {
    fetcher: (item) => item.kind === 'groups' ? clone(fullCatalog) : clone(payload),
  })
  assert.deepEqual(service.availableGroups().groups, [])
  assert.equal(calls(), 0, 'reading the dropdown must not call the source')
  await service.refresh({ kind: 'groups' })
  const before = service.availableGroups()
  assert.equal(before.catalog_loaded, true)
  assert.equal(before.groups.length, 3)
  assert.deepEqual(before.import, { total: 3, downloaded: 0, fresh: 0, waiting_retry: 0 })
  assert.equal(calls(), 1, 'reading SQLite still does not call the source')
  await service.refresh({ kind: 'group', id: 99, period: 241 })
  assert.deepEqual(service.availableGroups().groups.map((group) => group.group_id), [10, 11, 12],
    'manually requested IDs must not change the official catalog shown in the dropdown')
  await service.refresh({ kind: 'group', id: 10, period: 241 })
  assert.equal(service.availableGroups().import.downloaded, 1)
  await service.close()

  const fetched = []
  const restarted = new ScheduleService(settings, {
    source: { fetch: async (item) => {
      if (item.kind === 'groups') return clone(fullCatalog)
      fetched.push(item.id)
      return clone(payload)
    } },
    now: () => Date.parse('2026-09-26T10:00:00Z'), background: true,
  })
  try {
    for (let i = 0; i < 15 && restarted.availableGroups().import.downloaded < 3; i++) {
      await new Promise((resolve) => setImmediate(resolve))
    }
    assert.deepEqual(fetched.toSorted((a, b) => a - b), [11, 12, 99])
    assert.equal(restarted.availableGroups().import.downloaded, 3)
    assert.equal((await restarted.schedule('group', 12, 241, 4)).lessons.length, 8)
  } finally { await restarted.close() }
})
