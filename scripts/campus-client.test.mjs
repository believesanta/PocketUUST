import test from 'node:test'
import assert from 'node:assert/strict'
import {
  api,
  refreshCampus,
  changeAccount,
  awardActivity,
  getCampusSnapshot,
} from '../src/features/campus/client.ts'
const response = (data) =>
  new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const account = (id) => ({
  user: { id, login: `user${id}@stud.uust.ru`, name: `User ${id}` },
  wallet: {
    balance: id,
    earned: id,
    floor: 1,
    forumPoints: 0,
    tickets: 0,
    nextFloorAt: 30,
    gameAvailable: true,
    activity: [],
  },
})
test('email challenge keeps the visitor signed out until the code succeeds', async () => {
  const fresh = await import('../src/features/campus/client.ts?email-confirmation')
  const original = globalThis.fetch
  const challenge = {
    status: 'verification_required',
    challengeId: 'challenge',
    email: 'user1@stud.uust.ru',
    expiresAt: '2026-09-30T19:10:00Z',
    resendAvailableAt: '2026-09-30T19:01:00Z',
  }
  globalThis.fetch = async (path) =>
    path.endsWith('/auth/register')
      ? new Response(JSON.stringify(challenge), {
          status: 202,
          headers: { 'content-type': 'application/json' },
        })
      : response({ ...account(1), status: 'authenticated' })
  try {
    const pending = await fresh.changeAccount('register', {})
    assert.deepEqual(pending, challenge)
    assert.equal(fresh.getCampusSnapshot().user, null)
    await fresh.verifyAccount(challenge.challengeId, '000123')
    assert.equal(fresh.getCampusSnapshot().user.id, 1)
  } finally {
    globalThis.fetch = original
  }
})
test('authenticated login response enters the account without requesting another code', async () => {
  const fresh = await import('../src/features/campus/client.ts?verified-login')
  const original = globalThis.fetch
  globalThis.fetch = async () => response({ ...account(3), status: 'authenticated' })
  try {
    assert.equal(await fresh.changeAccount('login', {}), null)
    assert.equal(fresh.getCampusSnapshot().user.id, 3)
  } finally {
    globalThis.fetch = original
  }
})
test('old guest response cannot overwrite successful authentication', async () => {
  const original = globalThis.fetch,
    old = deferred()
  globalThis.fetch = async (path) => (path.endsWith('/me') ? old.promise : response(account(1)))
  try {
    const pending = refreshCampus()
    await changeAccount('login', { login: 'user1@stud.uust.ru', password: 'not-a-real-secret' })
    old.resolve(response({ user: null, wallet: null }))
    await pending
    assert.equal(getCampusSnapshot().user.id, 1)
  } finally {
    globalThis.fetch = original
  }
})
test('old reward response cannot leak another account wallet after switching', async () => {
  const original = globalThis.fetch,
    old = deferred()
  globalThis.fetch = async (path) => (path.endsWith('/reward') ? old.promise : response(account(2)))
  try {
    const pending = awardActivity('news-read', 'known-news')
    await changeAccount('login', {})
    old.resolve(
      response({ added: true, message: 'old', wallet: { ...account(1).wallet, balance: 999 } }),
    )
    await pending
    assert.equal(getCampusSnapshot().user.id, 2)
    assert.equal(getCampusSnapshot().wallet.balance, 2)
  } finally {
    globalThis.fetch = original
  }
})
test('bodyless campus writes still use the server JSON contract', async () => {
  const original = globalThis.fetch
  let sent
  globalThis.fetch = async (_path, options) => {
    sent = options
    return response({ ok: true })
  }
  try {
    await api('/api/campus/game/start', { method: 'POST' })
    assert.equal(sent.headers['Content-Type'], 'application/json')
    assert.equal(sent.body, '{}')
  } finally {
    globalThis.fetch = original
  }
})
test('same-account reward snapshots cannot go backwards when actions overlap', async () => {
  const original = globalThis.fetch,
    first = deferred()
  let requests = 0
  globalThis.fetch = async (path) =>
    path.endsWith('/reward')
      ? ++requests === 1
        ? first.promise
        : response({
            added: true,
            message: 'new',
            wallet: { ...account(2).wallet, balance: 4, earned: 4 },
          })
      : response(account(2))
  try {
    const a = awardActivity('news-read', 'one'),
      b = awardActivity('news-save', 'one')
    await new Promise(setImmediate)
    first.resolve(
      response({
        added: true,
        message: 'old',
        wallet: { ...account(2).wallet, balance: 3, earned: 3 },
      }),
    )
    await Promise.all([a, b])
    assert.equal(getCampusSnapshot().wallet.balance, 4)
  } finally {
    globalThis.fetch = original
  }
})
test('a pre-reward me snapshot cannot replace a newly credited wallet', async () => {
  const original = globalThis.fetch,
    old = deferred()
  globalThis.fetch = async (path) =>
    path.endsWith('/me')
      ? old.promise
      : response({
          added: true,
          message: 'new',
          wallet: { ...account(2).wallet, balance: 7, earned: 7 },
        })
  try {
    const pending = refreshCampus()
    await awardActivity('news-read', 'two')
    old.resolve(response(account(2)))
    await pending
    assert.equal(getCampusSnapshot().wallet.balance, 7)
  } finally {
    globalThis.fetch = original
  }
})
test('failed authentication recovers the current session instead of leaving initial loading stuck', async () => {
  const fresh = await import('../src/features/campus/client.ts?failed-login'),
    original = globalThis.fetch,
    old = deferred()
  let reads = 0
  globalThis.fetch = async (path) =>
    path.endsWith('/me')
      ? ++reads === 1
        ? old.promise
        : response(account(1))
      : new Response(JSON.stringify({ error: 'Wrong password' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        })
  try {
    const pending = fresh.refreshCampus()
    await assert.rejects(fresh.changeAccount('login', {}), /Wrong password/)
    old.resolve(response({ user: null, wallet: null }))
    await pending
    assert.equal(fresh.getCampusSnapshot().loading, false)
    assert.equal(fresh.getCampusSnapshot().user?.id, 1)
  } finally {
    globalThis.fetch = original
  }
})
test('a delayed reward cannot restore coins already spent on merchandise', async () => {
  const original = globalThis.fetch,
    old = deferred()
  globalThis.fetch = async (path) =>
    path.endsWith('/reward')
      ? old.promise
      : path.endsWith('/me')
        ? response({ ...account(2), wallet: { ...account(2).wallet, balance: 3, earned: 503 } })
        : response({ ok: true })
  try {
    const reward = awardActivity('news-read', 'late')
    await new Promise(setImmediate)
    await api('/api/campus/redeem', { method: 'POST', body: { item: 'hoodie' } })
    await refreshCampus()
    assert.equal(getCampusSnapshot().wallet.balance, 3)
    old.resolve(
      response({
        added: true,
        message: 'new',
        wallet: { ...account(2).wallet, balance: 503, earned: 503 },
      }),
    )
    await reward
    assert.equal(getCampusSnapshot().wallet.balance, 3)
  } finally {
    globalThis.fetch = original
  }
})
