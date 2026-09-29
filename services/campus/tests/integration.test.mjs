import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNewsServer } from '../../../scripts/serve.mjs'
import { CampusService } from '../service.mjs'

test('standalone site mounts campus accounts and runtime news rewards while retaining static/news endpoints and closes SQLite', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'campus-site-'))
  const distPath = join(directory, 'dist'),
    seedPath = join(directory, 'seed.json'),
    dataPath = join(directory, 'news')
  await mkdir(distPath)
  await writeFile(join(distPath, 'index.html'), '<!doctype html><title>PocketUUST</title>')
  await writeFile(
    seedPath,
    JSON.stringify({
      newsFetchedAt: '2026-09-27T10:00:00Z',
      news: [
        {
          id: 'runtime-story',
          title: 'Новость',
          summary: 'Текст',
          group: 'Кампус',
          tags: [],
          sourceName: 'УУНиТ',
          sourceUrl: 'https://uust.ru/news/',
          checkedAt: null,
          publishedAt: null,
          image: null,
        },
      ],
    }),
  )
  let deliveredCode
  const campusService = new CampusService({
    databasePath: join(directory, 'campus.sqlite'),
    newsFiles: [join(dataPath, 'student-life.json')],
    codeSecret: 'b'.repeat(64),
    mailer: {
      send: async (_email, code) => {
        deliveredCode = code
      },
    },
  })
  const app = await createNewsServer({
    distPath,
    seedPath,
    dataPath,
    campusService,
    refresh: async () => {},
    log: () => {},
  })
  t.after(async () => {
    await app.close()
    await rm(directory, { recursive: true, force: true })
  })
  await app.listen(0, '127.0.0.1')
  const origin = `http://127.0.0.1:${app.server.address().port}`
  assert.equal((await fetch(origin + '/')).status, 200)
  assert.equal((await fetch(origin + '/api/news')).status, 200)
  const registered = await fetch(origin + '/api/campus/auth/register', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      login: 'student@stud.uust.ru',
      password: 'StrongPassword!25',
      name: 'Student',
    }),
  })
  assert.equal(registered.status, 202)
  const { challengeId } = await registered.json()
  const verified = await fetch(origin + '/api/campus/auth/verify-email', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId, code: deliveredCode }),
  })
  assert.equal(verified.status, 201)
  const cookie = verified.headers.get('set-cookie').split(';')[0]
  const rewarded = await fetch(origin + '/api/campus/reward', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ kind: 'news-read', key: 'runtime-story' }),
  })
  assert.equal((await rewarded.json()).wallet.balance, 3)
  await app.close()
  assert.equal(campusService.db, null)
})
