import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, request as httpRequest } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomBytes, scryptSync } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { CampusService, campusSettings } from '../service.mjs'

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'campus-test-'))
  let now = Date.parse('2026-09-30T18:59:50Z')
  const delivered = []
  const service = new CampusService({
    databasePath: join(directory, 'campus.sqlite'),
    // Keep test policy independent of the developer's .env (e.g. CAMPUS_EMAIL_DOMAINS=*).
    emailDomains: ['stud.uust.ru'],
    publicOrigin: null,
    secureCookies: false,
    testEmailCode: null,
    newsIds: ['news-one', 'news-two'],
    now: () => now,
    codeSecret: 'a'.repeat(64),
    mailer: {
      send: async (email, code, purpose) => {
        delivered.push({ email, code, purpose })
      },
    },
    ...options,
  })
  const server = createServer(service.middleware())
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const client = () => {
    let cookie = ''
    return async (path, body, config = {}) => {
      const headers = {
        'Content-Type': 'application/json',
        Origin: origin,
        Cookie: cookie,
        ...config.headers,
      }
      const response = await fetch(origin + '/api/campus' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const setCookie = response.headers.get('set-cookie')
      if (setCookie) cookie = setCookie.split(';')[0]
      return { status: response.status, data: await response.json(), cookie: setCookie }
    }
  }
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve))
    service.close()
    await rm(directory, { recursive: true, force: true })
  })
  return {
    service,
    directory,
    client,
    origin,
    delivered,
    register: async (api, person, config) => {
      const started = await api('/auth/register', person, config)
      if (started.status !== 202) return started
      return api(
        '/auth/verify-email',
        {
          challengeId: started.data.challengeId,
          code: delivered.at(-1).code,
        },
        config,
      )
    },
    advance: (ms) => {
      now += ms
    },
    setTime: (time) => {
      now = Date.parse(time)
    },
  }
}
const identity = (n = 'alice') => ({
  login: `${n}@stud.uust.ru`,
  password: 'LongPassword!25',
  name: n,
})

test('invite-only mode rejects signup and still admits a verified existing account', async (t) => {
  assert.equal(campusSettings({ CAMPUS_REGISTRATION_ENABLED: 'false' }).registrationEnabled, false)
  const f = await fixture(t)
  const api = f.client()
  assert.equal((await f.register(api, identity())).status, 201)
  assert.equal((await api('/auth/logout', {})).status, 200)
  f.service.options.registrationEnabled = false
  assert.equal((await api('/auth/config')).data.registrationEnabled, false)
  assert.equal((await api('/auth/register', identity('bob'))).status, 403)
  assert.equal(f.delivered.length, 1)
  assert.equal((await api('/auth/login', identity())).status, 200)
  assert.equal((await api('/me')).data.user.login, 'alice@stud.uust.ru')
})

test('wildcard email setting accepts other providers and still requires code verification', async (t) => {
  assert.deepEqual(campusSettings({ CAMPUS_EMAIL_DOMAINS: '*' }).emailDomains, ['*'])
  assert.throws(() => campusSettings({ CAMPUS_EMAIL_DOMAINS: '*,stud.uust.ru' }))
  const f = await fixture(t, { emailDomains: ['*'] })
  const api = f.client()
  const person = { ...identity(), login: 'tester@example.com' }
  assert.deepEqual((await api('/auth/config')).data.emailDomains, ['*'])
  const started = await api('/auth/register', person)
  assert.equal(started.status, 202)
  assert.equal(f.delivered.at(-1).email, person.login)
  assert.equal((await api('/me')).data.user, null)
  const verified = await api('/auth/verify-email', {
    challengeId: started.data.challengeId,
    code: f.delivered.at(-1).code,
  })
  assert.equal(verified.status, 201)
  assert.equal((await api('/me')).data.user.login, person.login)
  assert.equal((await api('/auth/register', { ...identity(), login: 'not-an-email' })).status, 400)
})

test('development test code confirms registration and legacy login without sending mail', async (t) => {
  assert.equal(
    campusSettings({ NODE_ENV: 'development', CAMPUS_TEST_EMAIL_CODE: '123456' }).testEmailCode,
    '123456',
  )
  assert.equal(
    campusSettings({ NODE_ENV: 'production', CAMPUS_TEST_EMAIL_CODE: '123456' }).testEmailCode,
    null,
  )
  const f = await fixture(t, {
    testEmailCode: '123456',
    mailer: {
      send: async () => {
        throw new Error('SMTP should not be called')
      },
    },
  })
  const api = f.client()
  assert.equal((await api('/auth/config')).data.testEmailCode, '123456')
  const started = await api('/auth/register', identity())
  assert.equal(started.status, 202)
  assert.equal(f.delivered.length, 0)
  assert.equal(
    (
      await api('/auth/verify-email', {
        challengeId: started.data.challengeId,
        code: '123456',
      })
    ).status,
    201,
  )

  const salt = 'a'.repeat(32)
  const oldHash = scryptSync('LongPassword!25', salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  }).toString('hex')
  f.service.db
    .prepare(
      'INSERT INTO users(login,name,password_hash,created_at,email_verified_at) VALUES (?,?,?,?,NULL)',
    )
    .run('legacy@stud.uust.ru', 'Legacy', `scrypt$32768$${salt}$${oldHash}`, f.service.now())
  const pending = await api('/auth/login', {
    login: 'legacy@stud.uust.ru',
    password: 'LongPassword!25',
  })
  assert.equal(pending.status, 202)
  f.advance(61000)
  assert.equal(
    (await api('/auth/resend-code', { challengeId: pending.data.challengeId })).status,
    200,
  )
  assert.equal(
    (
      await api('/auth/verify-email', {
        challengeId: pending.data.challengeId,
        code: '123456',
      })
    ).status,
    200,
  )
  assert.equal(f.delivered.length, 0)
})

test('email challenge is private, single use, rotated on resend and rejects five incorrect codes', async (t) => {
  const f = await fixture(t),
    api = f.client()
  const started = await api('/auth/register', identity())
  assert.equal(started.status, 202)
  assert.equal((await api('/me')).data.user, null)
  assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM users').get().n, 0)
  const first = f.delivered.at(-1).code
  const row = f.service.db.prepare('SELECT password_hash,code_hash FROM email_verifications').get()
  assert.ok(!row.password_hash.includes(identity().password))
  assert.ok(!row.code_hash.includes(first))
  assert.equal(
    (await api('/auth/resend-code', { challengeId: started.data.challengeId })).status,
    429,
  )
  f.advance(61000)
  const resent = await api('/auth/resend-code', { challengeId: started.data.challengeId })
  assert.equal(resent.status, 200)
  assert.notEqual(f.delivered.at(-1).code, first)
  assert.equal(
    (await api('/auth/verify-email', { challengeId: started.data.challengeId, code: first }))
      .status,
    400,
  )
  const valid = await api('/auth/verify-email', {
    challengeId: started.data.challengeId,
    code: f.delivered.at(-1).code,
  })
  assert.equal(valid.status, 201)
  assert.equal(
    (
      await api('/auth/verify-email', {
        challengeId: started.data.challengeId,
        code: f.delivered.at(-1).code,
      })
    ).status,
    410,
  )
  const next = await api('/auth/register', identity('bob'))
  const wrong = f.delivered.at(-1).code === '999999' ? '888888' : '999999'
  for (let i = 0; i < 5; i++)
    assert.equal(
      (await api('/auth/verify-email', { challengeId: next.data.challengeId, code: wrong })).status,
      400,
    )
  assert.equal(
    (
      await api('/auth/verify-email', {
        challengeId: next.data.challengeId,
        code: f.delivered.at(-1).code,
      })
    ).status,
    410,
  )
})

test('expired challenge and SMTP failure cannot create an account', async (t) => {
  const f = await fixture(t),
    api = f.client()
  const pending = await api('/auth/register', identity())
  f.advance(11 * 60000)
  assert.equal(
    (
      await api('/auth/verify-email', {
        challengeId: pending.data.challengeId,
        code: f.delivered.at(-1).code,
      })
    ).status,
    410,
  )
  assert.equal((await api('/me')).data.user, null)
  const failed = await fixture(t, {
    mailer: {
      send: async () => {
        throw new Error('SMTP unavailable')
      },
    },
  })
  assert.equal((await failed.client()('/auth/register', identity('failed'))).status, 503)
  assert.equal(failed.service.db.prepare('SELECT count(*) AS n FROM users').get().n, 0)
  assert.equal(
    failed.service.db.prepare('SELECT status FROM email_verifications').get().status,
    'failed',
  )
  const unconfigured = await fixture(t, { codeSecret: null })
  assert.equal((await unconfigured.client()('/auth/register', identity('missing'))).status, 503)
})

test('existing account retains forum and wallet after password and email confirmation', async (t) => {
  const f = await fixture(t),
    api = f.client()
  const created = await f.register(api, identity())
  const userId = created.data.user.id
  f.service.db.prepare('UPDATE users SET email_verified_at=NULL,balance=45 WHERE id=?').run(userId)
  f.service.db
    .prepare(
      "INSERT INTO forum_topics(user_id,category,title,body,created_at) VALUES (?,'study','Old topic','Existing content',?)",
    )
    .run(userId, Date.now())
  assert.equal((await api('/me')).data.user, null)
  assert.equal(
    (await api('/auth/login', { ...identity(), password: 'wrong-password' })).status,
    401,
  )
  const pending = await api('/auth/login', identity())
  assert.equal(pending.status, 202)
  assert.equal((await api('/me')).data.user, null)
  const verified = await api('/auth/verify-email', {
    challengeId: pending.data.challengeId,
    code: f.delivered.at(-1).code,
  })
  assert.equal(verified.data.user.id, userId)
  assert.equal(verified.data.wallet.balance, 45)
  assert.equal(
    f.service.db.prepare('SELECT count(*) AS n FROM forum_topics WHERE user_id=?').get(userId).n,
    1,
  )
  assert.equal((await api('/auth/register', identity())).status, 409)
})

test('old scrypt hashes still log in and upgrade without changing the password', async (t) => {
  const f = await fixture(t),
    api = f.client()
  const created = await f.register(api, identity())
  const salt = randomBytes(16).toString('hex')
  const old = `scrypt$32768$${salt}$${scryptSync(identity().password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }).toString('hex')}`
  f.service.db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(old, created.data.user.id)
  const logged = await api('/auth/login', identity())
  assert.equal(logged.status, 200)
  assert.match(
    f.service.db.prepare('SELECT password_hash FROM users WHERE id=?').get(created.data.user.id)
      .password_hash,
    /^scrypt\$131072\$8\$1\$/,
  )
})

test('two simultaneous confirmations create exactly one account', async (t) => {
  const f = await fixture(t),
    api = f.client()
  const started = await api('/auth/register', identity())
  const body = { challengeId: started.data.challengeId, code: f.delivered.at(-1).code }
  const results = await Promise.all([
    api('/auth/verify-email', body),
    api('/auth/verify-email', body),
  ])
  assert.deepEqual(results.map((x) => x.status).sort(), [201, 410])
  assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM users').get().n, 1)
  assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 1)
})

test('version zero migration retains user and forum IDs and invalidates legacy sessions', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'campus-legacy-'))
  const databasePath = join(directory, 'campus.sqlite')
  const old = new DatabaseSync(databasePath)
  old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, login TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    password_hash TEXT NOT NULL, created_at INTEGER NOT NULL, balance INTEGER NOT NULL DEFAULT 0,
    earned INTEGER NOT NULL DEFAULT 0, tickets INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL);
    CREATE TABLE forum_topics(id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),category TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL);
    INSERT INTO users VALUES (17,'alice@stud.uust.ru','Alice','legacy-hash',1,12,18,1);
    INSERT INTO forum_topics VALUES (41,17,'study','Old topic','Existing content',1);
    INSERT INTO sessions VALUES ('old-token',17,9999999999999);`)
  old.close()
  const service = new CampusService({ databasePath })
  t.after(async () => {
    service.close()
    await rm(directory, { recursive: true, force: true })
  })
  assert.equal(service.db.prepare('SELECT id,balance,email_verified_at FROM users').get().id, 17)
  assert.equal(
    service.db.prepare('SELECT id,balance,email_verified_at FROM users').get().balance,
    12,
  )
  assert.equal(
    service.db.prepare('SELECT id,balance,email_verified_at FROM users').get().email_verified_at,
    null,
  )
  assert.equal(service.db.prepare('SELECT count(*) AS n FROM sessions').get().n, 0)
  assert.equal(service.db.prepare('SELECT id,user_id FROM forum_topics').get().id, 41)
  assert.equal(service.db.prepare('PRAGMA user_version').get().user_version, 2)
  service.close()
  const reopened = new CampusService({ databasePath })
  assert.equal(reopened.db.prepare('SELECT count(*) AS n FROM users').get().n, 1)
  reopened.close()
})

test('accounts use normalized university email and hashed expiring sessions, and persist across reopen', async (t) => {
  const f = await fixture(t),
    api = f.client()
  assert.equal(
    (await api('/auth/register', { ...identity(), login: 'alice@gmail.com' })).status,
    400,
  )
  assert.equal(
    (await api('/auth/register', { ...identity(), login: 'arbitrary-login' })).status,
    400,
  )
  const registered = await api('/auth/register', { ...identity(), login: ' ALICE@STUD.UUST.RU ' })
  assert.equal(registered.status, 202)
  assert.equal(registered.data.email, 'alice@stud.uust.ru')
  assert.equal(registered.cookie, null)
  assert.equal((await api('/me')).data.user, null)
  const verified = await api('/auth/verify-email', {
    challengeId: registered.data.challengeId,
    code: f.delivered.at(-1).code,
  })
  assert.equal(verified.data.user.emailVerified, true)
  assert.match(verified.cookie, /HttpOnly/)
  assert.match(verified.cookie, /SameSite=Lax/)
  const row = f.service.db.prepare('SELECT password_hash FROM users').get()
  assert.ok(!row.password_hash.includes('LongPassword'))
  const token = verified.cookie.split(';')[0].split('=')[1]
  assert.notEqual(f.service.db.prepare('SELECT token_hash FROM sessions').get().token_hash, token)
  assert.equal(
    (await f.client()('/auth/login', { ...identity(), password: 'wrong-password' })).status,
    401,
  )
  assert.equal((await api('/auth/logout', {})).status, 200)
  assert.equal((await api('/me')).data.user, null)
  const other = new CampusService({
    databasePath: join(f.directory, 'campus.sqlite'),
    newsIds: ['news-one'],
  })
  assert.equal(other.db.prepare('SELECT count(*) AS n FROM users').get().n, 1)
  other.close()
  const logged = await api('/auth/login', identity())
  assert.equal(logged.data.user.name, 'alice')
  f.advance(15 * 86400000)
  assert.equal((await api('/me')).data.user, null)
})

test('rewards validate real catalog/graph keys, deduplicate per user and day, and ignore client amounts', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client()
  await f.register(a, identity())
  await f.register(b, identity('bob'))
  assert.equal(
    (await a('/reward', { kind: 'news-read', key: 'invented', points: 9999 })).status,
    400,
  )
  const earned = await a('/reward', { kind: 'news-read', key: 'news-one', points: 9999 })
  assert.equal(earned.data.wallet.balance, 3)
  assert.equal((await a('/reward', { kind: 'news-read', key: 'news-one' })).data.added, false)
  assert.equal((await a('/reward', { kind: 'news-save', key: 'news-one' })).data.wallet.balance, 4)
  assert.equal((await b('/reward', { kind: 'news-read', key: 'news-one' })).data.wallet.balance, 3)
  assert.equal((await a('/reward', { kind: 'route', key: '5-203>6-401:inside' })).status, 400)
  assert.equal((await a('/reward', { kind: 'route', key: '1-203>1-203:inside' })).status, 400)
  assert.equal(
    (await a('/reward', { kind: 'route', key: '1-203>6-401:inside' })).data.wallet.balance,
    6,
  )
  assert.equal((await a('/reward', { kind: 'route', key: '1-203>6-401:inside' })).data.added, false)
  f.advance(20000)
  assert.equal(
    (await a('/reward', { kind: 'route', key: '1-203>6-401:inside' })).data.wallet.balance,
    8,
  )
  const leaderboard = await a('/leaderboard')
  assert.equal(leaderboard.data.total, 2)
  assert.deepEqual(
    leaderboard.data.users.map((x) => x.earned),
    [8, 3],
  )
})

test('game challenges enforce owner, elapsed time, expiry, replay prevention and Ufa day boundary', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client()
  await f.register(a, identity())
  await f.register(b, identity('bob'))
  const start = (await a('/game/start', {})).data
  assert.equal(start.clicksRequired, 40)
  assert.equal(
    (await b('/game/finish', { challengeId: start.challengeId, clicks: 40 })).status,
    400,
  )
  assert.equal(
    (await a('/game/finish', { challengeId: start.challengeId, clicks: 40 })).status,
    400,
  )
  f.advance(6000)
  assert.equal(
    (await a('/game/finish', { challengeId: start.challengeId, clicks: 40 })).data.wallet.balance,
    25,
  )
  assert.equal(
    (await a('/game/finish', { challengeId: start.challengeId, clicks: 40 })).data.added,
    false,
  )
  assert.equal((await a('/game/start', {})).status, 409)
  f.advance(6000)
  const next = (await a('/game/start', {})).data
  f.advance(6000)
  assert.equal(
    (await a('/game/finish', { challengeId: next.challengeId, clicks: 40 })).data.wallet.balance,
    50,
  )
  f.advance(86400000)
  const stale = (await a('/game/start', {})).data
  f.advance(16 * 60000)
  assert.equal(
    (await a('/game/finish', { challengeId: stale.challengeId, clicks: 40 })).status,
    400,
  )
})

test('forum is shared, requires login, caps rewards and settles monthly tickets once without changing wallet coins', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    publicApi = f.client()
  f.setTime('2026-09-28T12:00:00Z')
  await f.register(a, identity())
  assert.equal(
    (
      await publicApi('/forum/topics', {
        category: 'study',
        title: 'Help please',
        body: 'How do we prepare?',
      })
    ).status,
    401,
  )
  let topic
  for (let day = 0; day < 2; day++) {
    for (let i = 0; i < 3; i++)
      topic = (
        await a('/forum/topics', {
          category: 'study',
          title: `Preparing for exams ${i}`,
          body: 'Share useful resources please.',
        })
      ).data.topic
    assert.equal(
      (
        await a('/forum/topics', {
          category: 'study',
          title: 'One more topic',
          body: 'A meaningful question.',
        })
      ).data.forumPointsAdded,
      0,
    )
    assert.equal(
      (
        await a('/forum/topics', {
          category: 'study',
          title: 'One more topic',
          body: 'A meaningful question.',
        })
      ).status,
      409,
    )
    for (let i = 0; i < 10; i++)
      assert.equal(
        (
          await a(`/forum/topics/${topic.id}/replies`, {
            body: `Use the official lecture notes ${i}.`,
          })
        ).status,
        201,
      )
    assert.equal(
      (await a(`/forum/topics/${topic.id}/replies`, { body: 'One extra reply.' })).data
        .forumPointsAdded,
      0,
    )
    assert.equal(
      (await a(`/forum/topics/${topic.id}/replies`, { body: 'One extra reply.' })).status,
      409,
    )
    if (day === 0) f.setTime('2026-09-29T12:00:00Z')
  }
  const visible = (await publicApi(`/forum/topics/${topic.id}`)).data
  assert.equal(visible.replies.length, 11)
  assert.equal(visible.topic.author, 'alice')
  assert.equal((await a('/me')).data.wallet.forumPoints, 70)
  f.setTime('2026-09-30T19:00:00Z')
  const wallet = (await a('/me')).data.wallet
  assert.equal(wallet.forumPoints, 0)
  assert.equal(wallet.tickets, 1)
  assert.equal(wallet.balance, 0)
  assert.equal((await a('/me')).data.wallet.tickets, 1)
})

test('merch debit is atomic, insufficient funds rejected and floor uses lifetime earned', async (t) => {
  const f = await fixture(t),
    a = f.client()
  await f.register(a, identity())
  assert.equal((await a('/redeem', { item: 'hoodie' })).status, 409)
  f.service.db.prepare('UPDATE users SET balance=500,earned=550').run()
  const requests = await Promise.all([
    a('/redeem', { item: 'hoodie' }),
    a('/redeem', { item: 'hoodie' }),
  ])
  assert.deepEqual(requests.map((x) => x.status).sort(), [200, 409])
  const wallet = (await a('/me')).data.wallet
  assert.equal(wallet.balance, 0)
  assert.equal(wallet.earned, 550)
  assert.equal(wallet.floor, 5)
  assert.equal(wallet.nextFloorAt, null)
  assert.equal(f.service.db.prepare('SELECT count(*) AS n FROM redemptions').get().n, 1)
})

test('write endpoints reject cross-origin and oversized input, and login rate limiting survives service restart', async (t) => {
  const f = await fixture(t),
    a = f.client()
  assert.equal(
    (await a('/auth/register', identity(), { headers: { Origin: 'https://attacker.example' } }))
      .status,
    403,
  )
  assert.equal((await a('/auth/register', { ...identity(), name: 'a'.repeat(40000) })).status, 413)
  await f.register(a, identity())
  for (let i = 0; i < 10; i++)
    assert.equal((await a('/auth/login', { ...identity(), password: 'incorrect' })).status, 401)
  assert.equal((await a('/auth/login', identity())).status, 429)
  const reopened = new CampusService({
    databasePath: join(f.directory, 'campus.sqlite'),
    now: () => Date.parse('2026-09-30T18:59:50Z'),
  })
  const restartedServer = createServer(reopened.middleware())
  await new Promise((resolve) => restartedServer.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${restartedServer.address().port}`
  const stillLimited = await fetch(origin + '/api/campus/auth/login', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(identity()),
  })
  assert.equal(stillLimited.status, 429)
  await new Promise((resolve) => restartedServer.close(resolve))
  reopened.close()
})

test('production cookies require secure transport and a configured public origin', async (t) => {
  const f = await fixture(t, { secureCookies: true, publicOrigin: 'https://campus.example' }),
    a = f.client()
  assert.equal((await a('/auth/register', identity())).status, 403)
  const accepted = await f.register(a, identity(), {
    headers: { Origin: 'https://campus.example' },
  })
  assert.equal(accepted.status, 201)
  assert.match(accepted.cookie, /; Secure/)
})

test('duplicate reward requests in flight credit once and one user never receives another wallet', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client()
  await f.register(a, identity())
  await f.register(b, identity('bob'))
  const results = await Promise.all([
    a('/reward', { kind: 'news-read', key: 'news-one' }),
    a('/reward', { kind: 'news-read', key: 'news-one' }),
  ])
  assert.equal(results.filter((x) => x.data.added).length, 1)
  assert.equal((await a('/me')).data.wallet.balance, 3)
  assert.equal((await b('/me')).data.wallet.balance, 0)
})

test('password derivation has a global concurrency bound to prevent memory exhaustion', async (t) => {
  const f = await fixture(t)
  const results = await Promise.all(
    Array.from({ length: 6 }, (_, i) => f.client()('/auth/register', identity(`student${i}`))),
  )
  assert.ok(results.some((x) => x.status === 429))
  assert.ok(results.some((x) => x.status === 202))
})

test('passwords preserve intentional leading and trailing spaces', async (t) => {
  const f = await fixture(t),
    a = f.client()
  const spaced = { ...identity(), password: '  LongPassword!25  ' }
  assert.equal((await f.register(a, spaced)).status, 201)
  await a('/auth/logout', {})
  assert.equal((await a('/auth/login', identity())).status, 401)
  assert.equal((await a('/auth/login', spaced)).status, 200)
})

test('forum cursor pages reach older topics and retain newest replies after the original limits', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    publicApi = f.client()
  const user = (await f.register(a, identity())).data.user
  f.service.transaction(() => {
    const topic = f.service.db.prepare(
      "INSERT INTO forum_topics(user_id,category,title,body,created_at) VALUES (?,'study',?,?,?)",
    )
    for (let i = 1; i <= 123; i++)
      topic.run(
        user.id,
        `Topic ${i}`,
        'Useful question for this course.',
        Date.parse('2026-09-30T12:00:00Z') + i,
      )
    const reply = f.service.db.prepare(
      'INSERT INTO forum_replies(topic_id,user_id,body,created_at) VALUES (123,?,?,?)',
    )
    for (let i = 1; i <= 207; i++)
      reply.run(user.id, `Reply ${i}`, Date.parse('2026-09-30T13:00:00Z') + i)
  })
  const newest = (await publicApi('/forum/topics')).data
  assert.equal(newest.topics.length, 50)
  assert.equal(newest.topics[0].id, 123)
  assert.equal(newest.total, 123)
  assert.equal(newest.hasMore, true)
  assert.equal(newest.nextBeforeId, 74)
  const middle = (await publicApi(`/forum/topics?beforeId=${newest.nextBeforeId}`)).data
  const oldest = (await publicApi(`/forum/topics?beforeId=${middle.nextBeforeId}`)).data
  assert.equal(oldest.topics.at(-1).id, 1)
  assert.equal(oldest.hasMore, false)
  assert.equal(oldest.nextBeforeId, null)
  assert.equal(
    new Set([...newest.topics, ...middle.topics, ...oldest.topics].map((x) => x.id)).size,
    123,
  )
  const latestReplies = (await publicApi('/forum/topics/123')).data
  assert.equal(latestReplies.totalReplies, 207)
  assert.equal(latestReplies.replies[0].id, 158)
  assert.equal(latestReplies.replies.at(-1).body, 'Reply 207')
  assert.equal(latestReplies.nextBeforeReplyId, 158)
  assert.equal(latestReplies.hasMore, true)
  let before = latestReplies.nextBeforeReplyId
  const seen = new Set(latestReplies.replies.map((x) => x.id))
  while (before !== null) {
    const page = (await publicApi(`/forum/topics/123?beforeReplyId=${before}&limit=40`)).data
    assert.ok(page.replies.length <= 40)
    for (const reply of page.replies) {
      assert.equal(seen.has(reply.id), false)
      seen.add(reply.id)
    }
    before = page.nextBeforeReplyId
  }
  assert.equal(seen.size, 207)
  const added = await a('/forum/topics/123/replies', {
    body: 'The newest real posted reply stays visible.',
  })
  assert.equal(added.status, 201)
  const reopened = (await publicApi('/forum/topics/123')).data
  assert.equal(reopened.replies.at(-1).id, added.data.reply.id)
  assert.equal(reopened.totalReplies, 208)
  assert.equal((await publicApi('/forum/topics?beforeId=invalid')).status, 400)
  assert.equal((await publicApi('/forum/topics/123?limit=0')).status, 400)
  assert.equal((await publicApi('/forum/topics/123?beforeReplyId=-1')).status, 400)
})

test('route rewards identify real graph paths instead of invented door aliases or unchanged outdoor permission', async (t) => {
  const f = await fixture(t),
    a = f.client()
  await f.register(a, identity())
  assert.equal((await a('/reward', { kind: 'route', key: '1-201>1-202:inside' })).status, 400)
  assert.equal((await a('/reward', { kind: 'route', key: '1-201>2-201:inside' })).data.added, true)
  assert.equal((await a('/reward', { kind: 'route', key: '1-202>2-299:inside' })).data.added, false)
  assert.equal(
    (await a('/reward', { kind: 'route', key: '1-201>2-201:outside' })).data.added,
    false,
  )
  assert.equal((await a('/me')).data.wallet.balance, 2)
  assert.equal((await a('/reward', { kind: 'route', key: '1-301>2-301:inside' })).data.added, true)
  assert.equal((await a('/me')).data.wallet.balance, 4)
})

test('malformed absolute HTTP request target receives JSON 400 without crashing the server', async (t) => {
  const f = await fixture(t)
  const response = await new Promise((resolve) => {
    const request = httpRequest(f.origin, { method: 'GET', path: 'http://[' }, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () =>
        resolve({
          status: response.statusCode,
          type: response.headers['content-type'],
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      )
    })
    request.on('error', () => resolve({ status: 0 }))
    request.setTimeout(500, () => request.destroy())
    request.end()
  })
  assert.equal(response.status, 400)
  assert.match(response.type, /application\/json/)
  assert.equal(typeof JSON.parse(response.body).error, 'string')
  assert.equal((await f.client()('/me')).status, 200)
})

test('forum likes are idempotent, saved lists are private and both persist in SQLite', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client(),
    guest = f.client()
  const alice = (await f.register(a, identity('alice'))).data.user
  await f.register(b, identity('bob'))
  const topic = (
    await a('/forum/topics', {
      category: 'study',
      title: 'Помогите с сессией',
      body: 'Где найти список вопросов к экзамену?',
    })
  ).data.topic
  assert.equal(topic.canDelete, true)
  assert.equal(topic.authorId, alice.id)
  const before = (await b('/me')).data.wallet.forumPoints
  const path = `/forum/topics/${topic.id}`
  assert.equal((await guest(`${path}/like`, { liked: true })).status, 401)
  assert.equal((await a(`${path}/like`, { liked: 'yes' })).status, 400)
  assert.equal(
    (await a(`${path}/like`, { liked: true }, { headers: { Origin: 'https://another.example' } }))
      .status,
    403,
  )
  await Promise.all([b(`${path}/like`, { liked: true }), b(`${path}/like`, { liked: true })])
  assert.equal((await b(path)).data.topic.likes, 1)
  assert.equal((await b(path)).data.topic.liked, true)
  assert.equal((await a(path)).data.topic.liked, false)
  assert.equal((await guest(path)).data.topic.canDelete, false)
  await b(`${path}/bookmark`, { saved: true })
  await b(`${path}/bookmark`, { saved: true })
  assert.equal((await b('/forum/topics?scope=saved')).data.total, 1)
  assert.equal((await a('/forum/topics?scope=saved')).data.total, 0)
  assert.equal((await guest('/forum/topics?scope=saved')).status, 401)
  assert.equal((await b('/forum/topics?scope=mine')).data.total, 0)
  assert.equal((await a('/forum/topics?scope=mine')).data.total, 1)
  assert.equal((await b('/me')).data.wallet.forumPoints, before)
  assert.equal(JSON.stringify((await guest(path)).data).includes('@stud.uust.ru'), false)
  const reopened = new CampusService({ databasePath: join(f.directory, 'campus.sqlite') })
  assert.equal(reopened.db.prepare('SELECT count(*) AS n FROM forum_bookmarks').get().n, 1)
  assert.equal(reopened.topic(topic.id).likes, 1)
  reopened.close()
  await b(`${path}/like`, { liked: false })
  await b(`${path}/bookmark`, { saved: false })
  assert.equal((await b(path)).data.topic.likes, 0)
  assert.equal((await b('/forum/topics?scope=saved')).data.total, 0)
})

test('reply references stay within a topic; authors can delete and quoted text is removed', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client(),
    guest = f.client()
  await f.register(a, identity('alice'))
  await f.register(b, identity('bob'))
  const create = (title) =>
    a('/forum/topics', { category: 'clubs', title, body: 'Собираем команду для нового проекта.' })
  const topic = (await create('Набираем команду')).data.topic
  const other = (await create('Другое обсуждение')).data.topic
  const path = `/forum/topics/${topic.id}`
  const first = (await a(`${path}/replies`, { body: 'Секретное содержимое удаляемого ответа' }))
    .data.reply
  assert.equal(
    (
      await b(`/forum/topics/${other.id}/replies`, {
        body: 'Cross topic quote',
        parentId: first.id,
      })
    ).status,
    400,
  )
  assert.equal(
    (await b(`${path}/replies`, { body: 'Invalid reference', parentId: '1' })).status,
    400,
  )
  const child = (
    await b(`${path}/replies`, { body: 'Готов помочь с этим проектом!', parentId: first.id })
  ).data.reply
  assert.equal(child.parent.id, first.id)
  assert.equal(child.parent.author, 'alice')
  assert.equal((await b(`/forum/replies/${first.id}/delete`, {})).status, 403)
  assert.equal((await guest(`/forum/replies/${first.id}/delete`, {})).status, 401)
  await b(`/forum/replies/${first.id}/like`, { liked: true })
  await b(`/forum/replies/${first.id}/like`, { liked: true })
  assert.equal((await b(path)).data.replies[0].likes, 1)
  assert.equal((await a(`/forum/replies/${first.id}/delete`, {})).status, 200)
  const result = (await guest(path)).data
  assert.equal(result.totalReplies, 1)
  assert.deepEqual(result.replies[0].parent, {
    id: first.id,
    deleted: true,
    author: null,
    body: null,
  })
  assert.equal(JSON.stringify(result).includes('Секретное'), false)
  assert.equal(
    (await b(`${path}/replies`, { body: 'Ответ удалённому участнику', parentId: first.id })).status,
    400,
  )
  assert.equal((await b(`/forum/replies/${first.id}/like`, { liked: true })).status, 404)
  assert.equal(
    f.service.db.prepare('SELECT body FROM forum_replies WHERE id=?').get(first.id).body,
    '',
  )
})

test('only the topic owner can delete; hidden topics cannot be read, saved, liked or answered', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    b = f.client()
  await f.register(a, identity('alice'))
  await f.register(b, identity('bob'))
  let lastId = 0
  for (let i = 0; i < 4; i++) {
    const created = await a('/forum/topics', {
      category: 'ideas',
      title: `Улучшим кампус ${i}`,
      body: 'Предлагаю обсудить новую студенческую инициативу.',
    })
    assert.equal(created.status, 201)
    assert.equal(created.data.forumPointsAdded, i < 3 ? 5 : 0)
    const topic = created.data.topic,
      path = `/forum/topics/${topic.id}`
    assert.ok(topic.id > lastId)
    lastId = topic.id
    await b(`${path}/bookmark`, { saved: true })
    const reply = (await b(`${path}/replies`, { body: 'Поддерживаю такую инициативу' })).data.reply
    assert.equal((await b(`${path}/delete`, {})).status, 403)
    assert.equal((await a(`${path}/delete`, {})).status, 200)
    assert.equal((await a(path)).status, 404)
    assert.equal((await b(`${path}/like`, { liked: true })).status, 404)
    assert.equal((await b(`${path}/bookmark`, { saved: true })).status, 404)
    assert.equal((await b(`${path}/replies`, { body: 'Ещё один ответ' })).status, 404)
    assert.equal((await b(`/forum/replies/${reply.id}/like`, { liked: true })).status, 404)
    assert.equal((await b('/forum/topics?scope=saved')).data.total, 0)
    assert.equal((await a('/forum/topics')).data.total, 0)
  }
  assert.equal((await a('/me')).data.wallet.forumPoints, 15)
  assert.equal(
    f.service.db.prepare('SELECT count(*) AS n FROM forum_rewards WHERE kind=?').get('topic').n,
    3,
  )
})

test('forum search, categories and popular/unanswered cursors filter the complete database', async (t) => {
  const f = await fixture(t),
    a = f.client(),
    guest = f.client()
  const user = (await f.register(a, identity())).data.user
  f.service.transaction(() => {
    const insert = f.service.db.prepare(
      'INSERT INTO forum_topics(user_id,category,title,body,created_at) VALUES (?,?,?,?,?)',
    )
    for (let i = 1; i <= 64; i++) {
      insert.run(
        user.id,
        i % 2 ? 'study' : 'clubs',
        i === 1 ? 'Подготовка к СЕССИИ' : `Вопрос номер ${i}`,
        i === 2 ? 'Скидка 100% для студентов' : 'Обсуждаем вопросы студентов',
        Date.now(),
      )
      if (i <= 3) f.service.db.prepare('INSERT INTO forum_topic_likes VALUES (?,?)').run(i, user.id)
    }
    f.service.db
      .prepare('INSERT INTO forum_replies(topic_id,user_id,body,created_at) VALUES (1,?,?,?)')
      .run(user.id, 'Есть ответ', Date.now())
  })
  assert.equal(
    (await guest('/forum/topics?q=' + encodeURIComponent('сессии'))).data.topics[0].id,
    1,
  )
  assert.equal((await guest('/forum/topics?q=%25')).data.total, 1)
  assert.equal((await guest('/forum/topics?category=study')).data.total, 32)
  assert.equal((await guest('/forum/topics?sort=unanswered')).data.total, 63)
  const first = (await guest('/forum/topics?sort=top&limit=2')).data
  assert.deepEqual(
    first.topics.map((x) => x.id),
    [3, 2],
  )
  let page = first,
    seen = [...first.topics]
  while (page.hasMore) {
    page = (
      await guest(
        `/forum/topics?sort=top&limit=10&beforeId=${page.nextBeforeId}&beforeLikes=${page.nextBeforeLikes}`,
      )
    ).data
    seen.push(...page.topics)
  }
  assert.equal(seen.length, 64)
  assert.equal(new Set(seen.map((x) => x.id)).size, 64)
  assert.deepEqual(
    seen.slice(0, 4).map((x) => x.id),
    [3, 2, 1, 64],
  )
  assert.deepEqual({ ...page.stats }, { topics: 64, replies: 1, authors: 1 })
  assert.equal((await guest('/forum/topics?sort=top&beforeId=3')).status, 400)
  assert.equal((await guest('/forum/topics?category=unknown')).status, 400)
  assert.equal((await guest('/forum/topics?sort=injection')).status, 400)
  assert.equal((await guest('/forum/topics?scope=other')).status, 400)
  assert.equal((await guest('/forum/topics?sort=top&beforeId=2&beforeLikes=-1')).status, 400)
})

test('public HTTPS proxy does not lock out the ninth independent registration', async (t) => {
  const f = await fixture(t, { publicOrigin: 'https://pocketuust.example.ts.net' })
  const api = f.client()
  for (let i = 1; i <= 9; i++) {
    const response = await api('/auth/register', identity(`visitor${i}`), {
      headers: { Origin: 'https://pocketuust.example.ts.net' },
    })
    assert.equal(response.status, 202)
  }
  assert.equal(
    (
      await api('/auth/register', identity('foreign'), {
        headers: { Origin: 'https://evil.example' },
      })
    ).status,
    403,
  )
})
