import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AssistantService } from '../service.mjs'
import { knowledgeDocuments } from '../knowledge.mjs'
import { settingsFromEnv, calendar } from '../../schedule/settings.mjs'
import { quickReply } from '../../../src/features/campus/quick-replies.ts'

test('the four suggestion buttons and short greetings reply immediately without calling the model', async () => {
  let modelCalls = 0
  const service = new AssistantService({ settings: { provider: 'ollama' }, fetcher: async () => { modelCalls++; throw Error('offline') } })
  for (const question of ['Как найти аудиторию?', 'Где искать стажировку?', 'Где посмотреть скидки?', 'Как получить баллы?']) {
    const client = quickReply(question)
    const server = await service.ask(question)
    assert.deepEqual(server, client)
    assert.equal(server.mode, 'grounded')
    assert.ok(server.sources.length)
    assert.ok(server.answer.length > 40)
  }
  for (const question of ['Привет!', 'Как дела?', 'Кто ты?', 'Что ты умеешь?']) {
    const server = await service.ask(question)
    assert.deepEqual(server, quickReply(question))
    assert.match(server.answer, /помощник|помочь|Карман/i)
  }
  for (const question of ['Ты кто?', 'А ты кто такой вообще?', 'Привет, а ты кто?', 'Как тебя зовут?',
    'Ты бот или человек?', 'Расскажи о себе, пожалуйста', 'Представься', 'Зачем ты тут?']) {
    const answer = await service.ask(question)
    assert.deepEqual(answer, quickReply(question))
    assert.match(answer.answer, /Я Карман/)
  }
  for (const question of ['Приветик!', 'Добрый вечер, Карман!', 'Как у тебя дела?', 'Как поживаешь?'])
    assert.ok(quickReply(question)?.answer)
  for (const question of ['Привет, какое завтра расписание?', 'Кто ведёт пары завтра?',
    'Кто ты и какие завтра пары?', 'Привет, где искать стажировку?'])
    assert.equal(quickReply(question), null)
  assert.equal(modelCalls, 0)
})

test('assistant answers a sourced FAQ using retrieved evidence; excludes forum content', async () => {
  const docs = knowledgeDocuments()
  assert.ok(docs.some((doc) => doc.title.includes('студенческий билет')))
  assert.ok(docs.some((doc) => doc.title.includes('стипендии')))
  assert.ok(docs.every((doc) => !doc.id.startsWith('forum-')))
  let prompt
  const service = new AssistantService({ documents: docs,
    settings: { provider: 'ollama', url: 'http://127.0.0.1:11434/api/chat', model: 'mock' },
    fetcher: async (_url, options) => {
      prompt = JSON.parse(options.body).messages[1].content
      return { ok: true, json: async () => ({ message: { content: JSON.stringify({
        answer: 'Обратитесь в МФСО за восстановлением студенческого билета.',
      }) } }) }
    },
  })
  const result = await service.ask('Что делать, если потерял студенческий билет?')
  assert.equal(result.mode, 'generated')
  assert.match(result.answer, /МФСО/)
  assert.match(prompt, /восстановлен/)
  assert.ok(result.sources.some((source) => source.sourceUrl?.includes('student_card')))
})

test('unrelated question never reaches the model; failed model leaves honest excerpts', async () => {
  let calls = 0
  const service = new AssistantService({
    documents: [{ id: 'stip', title: 'Стипендия', text: 'Стипендия оформляется по приказу.', keywords: ['стипендия'], section: 'services' }],
    settings: { provider: 'ollama', url: 'http://127.0.0.1:11434/api/chat', model: 'mock' },
    fetcher: async () => { calls++; throw new Error('offline') },
  })
  assert.equal((await service.ask('Как приготовить лазанью?')).mode, 'no-match')
  assert.equal(calls, 0)
  const result = await service.ask('Стипендия?')
  assert.equal(result.mode, 'search')
  assert.equal(result.excerpts[0], 'Стипендия оформляется по приказу.')
  assert.equal(calls, 1)
})

test('latest UUST events use dated news with source links, without a model', async () => {
  const service = new AssistantService({ settings: { provider: 'off' } })
  const result = await service.ask('Какие последние события случились в УУНиТ?')
  assert.equal(result.mode, 'grounded')
  assert.match(result.answer, /\d{2}\.\d{2}\.\d{4}/)
  assert.match(result.answer, /лента обновлена/)
  assert.ok(result.answer.includes(result.sources[0].title))
  assert.equal(result.sources.length, 3)
  assert.ok(result.sources.every((source) => source.sourceUrl?.startsWith('https://uust.ru/news/')))
})

test('the assistant reads refreshed news on the next question', async (context) => {
  const directory = mkdtempSync(join(tmpdir(), 'pocketuust-news-'))
  const previous = process.env.NEWS_DATA_DIR
  process.env.NEWS_DATA_DIR = directory
  context.after(() => {
    if (previous === undefined) delete process.env.NEWS_DATA_DIR
    else process.env.NEWS_DATA_DIR = previous
    rmSync(directory, { recursive: true, force: true })
  })
  const service = new AssistantService({ settings: { provider: 'off' } })
  const initial = await service.ask('Какие последние новости УУНиТ?')
  const entry = {
    id: 'fresh', title: 'Новая университетская новость', summary: 'Официальная публикация.',
    group: 'Официальные', sourceName: 'УУНиТ', sourceUrl: 'https://uust.ru/news/get/new',
    tags: [], checkedAt: null, publishedAt: '2026-09-27T10:00:00Z', image: null,
  }
  writeFileSync(join(directory, 'student-life.json'), JSON.stringify({ newsFetchedAt: '2026-09-28T10:00:00Z', news: [entry] }))
  const updated = await service.ask('Какие последние новости УУНиТ?')
  assert.notEqual(initial.sources[0].id, updated.sources[0].id)
  assert.match(updated.answer, /Новая университетская новость/)
  assert.match(updated.answer, /обновлена 28\.09\.2026/)
})

test('upcoming events are not confused with already published news', async () => {
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10)
  const service = new AssistantService({ settings: { provider: 'off' }, documents: [
    { id: 'future', kind: 'event', date: tomorrow, title: 'Будущая лекция', sourceUrl: 'https://uust.ru/events/get/lecture' },
    { id: 'past', kind: 'news', date: new Date().toISOString(), title: 'Вчерашняя новость', sourceUrl: 'https://uust.ru/news/get/lecture' },
  ] })
  const result = await service.ask('Какие ближайшие мероприятия в УУНиТ?')
  assert.equal(result.mode, 'grounded')
  assert.match(result.answer, /Ближайшие события/)
  assert.match(result.answer, /Будущая лекция/)
  assert.ok(result.sources.every((source) => source.sourceUrl?.includes('/events/')))
})

test('tomorrow timetable resolves a spaced group name through the shared schedule service', async () => {
  const settings = settingsFromEnv({})
  const now = () => Date.parse('2026-09-28T11:00:00Z')
  const today = calendar(settings, now()).today
  let requested
  const scheduleService = {
    settings, now,
    availableGroups: () => ({ groups: [{ group_id: 107, group_title: 'ТОП-107Б' }] }),
    schedule: async (...args) => {
      requested = args
      return { lessons: [{ date: '2026-09-29', subject: 'Математика',
        time: { start: '09:00', end: '10:30' }, room: { title: '1-203' }, teacher: { name: 'Иванов И. И.' }, lesson_type: 'лекция' }],
        stale: false, offline: false, undated_count: 0, week_start: '2026-09-28', week_end: '2026-10-04' }
    },
  }
  assert.equal(today, '2026-09-28')
  const service = new AssistantService({ scheduleService, settings: { provider: 'off' } })
  const result = await service.ask('Какие завтра пары у ТОП 107 Б?')
  assert.deepEqual(requested, ['group', 107, settings.periodId, 5])
  assert.match(result.answer, /Математика/)
  assert.match(result.answer, /09:00–10:30/)
  assert.match(result.answer, /1-203/)
  assert.equal(result.mode, 'grounded')
  assert.equal(result.sources[0].section, 'schedule')
  const selected = await service.ask('Какие завтра пары?', 107)
  assert.match(selected.answer, /Математика/)
  const week = await service.ask('Расписание ТОП-107Б на неделю')
  assert.match(week.answer, /2026-09-28 — 2026-10-04/)
  assert.match(week.answer, /2026-09-29 · 09:00/)
  const missing = await service.ask('Какие завтра пары у ТОП-999Б?', 107)
  assert.match(missing.answer, /Укажите название или ID/)
  assert.deepEqual(requested, ['group', 107, settings.periodId, 5])
})

test('HTTP endpoint accepts questions, rejects oversized input and exposes no key', async (context) => {
  const service = new AssistantService({ settings: { provider: 'off', url: 'http://127.0.0.1:11434/api/chat', model: 'none', apiKey: 'secret' } })
  const server = createServer((request, response) => service.middleware()(request, response, () => {
    response.writeHead(404).end()
  }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => server.close())
  const url = `http://127.0.0.1:${server.address().port}/api/assistant/ask`
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'Где посмотреть расписание?' }) })
  assert.equal(response.status, 200)
  const answer = await response.json()
  assert.ok(answer.sources.some((source) => source.section === 'schedule'))
  assert.equal(answer.mode, 'grounded')
  assert.ok(!JSON.stringify(answer).includes('secret'))
  const invalid = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: 'x'.repeat(301) }) })
  assert.equal(invalid.status, 400)
})

test('assistant accepts the configured HTTPS origin through a local proxy', async (context) => {
  const service = new AssistantService({ settings: { provider: 'off', publicOrigin: 'https://campus.example.ts.net' } })
  const server = createServer((request, response) => service.middleware()(request, response, () => {
    response.writeHead(404).end()
  }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  context.after(() => server.close())
  const url = `http://127.0.0.1:${server.address().port}/api/assistant/ask`
  const body = JSON.stringify({ question: 'Где расписание?' })
  const allowed = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://campus.example.ts.net' }, body })
  assert.equal(allowed.status, 200)
  const rejected = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://other.example.org' }, body })
  assert.equal(rejected.status, 403)
})
