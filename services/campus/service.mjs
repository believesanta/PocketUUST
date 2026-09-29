import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  randomBytes,
  randomInt,
  createHash,
  createHmac,
  scrypt,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'
import { parsePlace, planRoute } from '../../src/features/navigation/routing.ts'
import { createMailer } from './mailer.mjs'
import { ForumStore } from './forum.mjs'

const derive = promisify(scrypt)
let activePasswordDerivations = 0
async function boundedDerive(...args) {
  if (activePasswordDerivations >= 2)
    fail(429, 'Сервер обрабатывает входы. Повторите через несколько секунд.')
  activePasswordDerivations++
  try {
    return await derive(...args)
  } finally {
    activePasswordDerivations--
  }
}
const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const DAY = 86400000
const SESSION_AGE = 14 * DAY
const CODE_AGE = 10 * 60000
const CHALLENGE_AGE = 30 * 60000
const RESEND_DELAY = 60000
const CATEGORIES = new Set([
  'study',
  'freshmen',
  'dorms',
  'clubs',
  'career',
  'market',
  'memes',
  'ideas',
])
const FLOORS = [0, 30, 80, 150, 250]
const digest = (value) => createHash('sha256').update(value).digest('hex')
const randomToken = () => randomBytes(32).toString('base64url')
const dateParts = (now) => new Date(now + 5 * 3600000).toISOString()
const dayKey = (now) => dateParts(now).slice(0, 10)
const monthKey = (now) => dateParts(now).slice(0, 7)
const iso = (now) => new Date(now).toISOString()

class HttpError extends Error {
  constructor(status, message, code, retryAfterSeconds) {
    super(message)
    this.status = status
    this.code = code
    this.retryAfterSeconds = retryAfterSeconds
  }
}
function fail(status, message, code, retryAfterSeconds) {
  throw new HttpError(status, message, code, retryAfterSeconds)
}
function field(value, label, min, max, trim = true) {
  if (typeof value !== 'string') fail(400, `${label}: ожидается текст`)
  const normalized = trim ? value.trim() : value
  if (
    normalized.length < min ||
    normalized.length > max ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(normalized)
  )
    fail(400, `${label}: от ${min} до ${max} символов`)
  return normalized
}
function pageOptions(request, cursorName) {
  const query = new URL(request.url, 'http://localhost').searchParams
  const cursor = query.get(cursorName),
    limit = query.get('limit')
  if (cursor !== null && (!/^[1-9]\d{0,14}$/.test(cursor) || !Number.isSafeInteger(Number(cursor))))
    fail(400, 'Некорректный указатель страницы')
  if (limit !== null && (!/^[1-9]\d?$/.test(limit) || Number(limit) > 50))
    fail(400, 'Размер страницы: от 1 до 50')
  return {
    before: cursor === null ? Number.MAX_SAFE_INTEGER : Number(cursor),
    limit: limit === null ? 50 : Number(limit),
  }
}
async function passwordHash(password) {
  const salt = randomBytes(16).toString('hex')
  const bytes = await boundedDerive(password, salt, 64, {
    N: 131072,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024,
  })
  return `scrypt$131072$8$1$${salt}$${bytes.toString('hex')}`
}
async function passwordMatches(password, stored) {
  const parts = stored.split('$')
  const old = parts.length === 4 && parts[0] === 'scrypt' && parts[1] === '32768'
  const current = parts.length === 6 && parts.slice(0, 4).join('$') === 'scrypt$131072$8$1'
  if (!old && !current) return false
  const salt = parts.at(-2),
    hash = parts.at(-1)
  if (!/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{128}$/.test(hash)) return false
  const candidate = await boundedDerive(password, salt, 64, {
    N: old ? 32768 : 131072,
    r: 8,
    p: 1,
    maxmem: old ? 64 * 1024 * 1024 : 256 * 1024 * 1024,
  })
  const expected = Buffer.from(hash, 'hex')
  return expected.length === candidate.length && timingSafeEqual(expected, candidate)
}
const challengeCode = () => String(randomInt(1000000)).padStart(6, '0')
const codeDigest = (secret, challengeHash, purpose, version, code) =>
  createHmac('sha256', secret)
    .update(`${challengeHash}:${purpose}:${version}:${code}`)
    .digest('hex')

export function campusSettings(env = process.env) {
  const domains = (env.CAMPUS_EMAIL_DOMAINS ?? 'stud.uust.ru')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
  if (
    !domains.length ||
    domains.some(
      (x) => x !== '*' && !/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(x),
    ) ||
    (domains.includes('*') && domains.length !== 1)
  )
    throw new Error('CAMPUS_EMAIL_DOMAINS: укажите домены через запятую')
  const publicOrigin = env.CAMPUS_PUBLIC_ORIGIN ? new URL(env.CAMPUS_PUBLIC_ORIGIN).origin : null
  const secureCookies =
    env.NODE_ENV === 'production' ||
    publicOrigin?.startsWith('https:') ||
    env.CAMPUS_SECURE_COOKIES === 'true'
  const smtpPort = Number(env.CAMPUS_SMTP_PORT ?? 587)
  return {
    databasePath: resolve(env.CAMPUS_DATA_DIR ?? resolve(ROOT, '.runtime/campus'), 'campus.sqlite'),
    emailDomains: domains,
    registrationEnabled: env.CAMPUS_REGISTRATION_ENABLED !== 'false',
    publicOrigin,
    secureCookies,
    smtpHost: env.CAMPUS_SMTP_HOST,
    smtpPort: Number.isInteger(smtpPort) && smtpPort > 0 && smtpPort < 65536 ? smtpPort : null,
    smtpSecure: env.CAMPUS_SMTP_SECURE === 'true',
    smtpUser: env.CAMPUS_SMTP_USER,
    smtpPassword: env.CAMPUS_SMTP_PASSWORD,
    mailFrom: env.CAMPUS_MAIL_FROM,
    codeSecret: env.CAMPUS_EMAIL_CODE_SECRET,
    testEmailCode:
      env.NODE_ENV === 'development' && /^[0-9]{6}$/.test(env.CAMPUS_TEST_EMAIL_CODE ?? '')
        ? env.CAMPUS_TEST_EMAIL_CODE
        : null,
    newsFiles: [
      resolve(ROOT, 'src/features/student-life/student-life.json'),
      resolve(env.NEWS_DATA_DIR ?? resolve(ROOT, '.runtime/news'), 'student-life.json'),
    ],
  }
}

export class CampusService {
  constructor(options = {}) {
    this.options = { ...campusSettings(), ...options }
    this.now = this.options.now ?? Date.now
    this.lastPrune = 0
    this.lastVerificationPrune = 0
    this.mailer = this.options.mailer ?? createMailer(this.options)
    this.codeSecret = /^[0-9a-fA-F]{64}$/.test(this.options.codeSecret ?? '')
      ? Buffer.from(this.options.codeSecret, 'hex')
      : null
    mkdirSync(dirname(this.options.databasePath), { recursive: true })
    this.db = new DatabaseSync(this.options.databasePath)
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY, login TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
        password_hash TEXT NOT NULL, created_at INTEGER NOT NULL,
        balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0), earned INTEGER NOT NULL DEFAULT 0 CHECK(earned>=0),
        tickets INTEGER NOT NULL DEFAULT 0 CHECK(tickets>=0)
      );
      CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), kind TEXT NOT NULL,
        activity_key TEXT NOT NULL, period TEXT NOT NULL, points INTEGER NOT NULL, label TEXT NOT NULL,
        created_at INTEGER NOT NULL, UNIQUE(user_id,kind,activity_key,period)
      );
      CREATE INDEX IF NOT EXISTS activities_user_date ON activities(user_id,created_at);
      CREATE TABLE IF NOT EXISTS game_challenges (token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,expires_at INTEGER NOT NULL, consumed INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS forum_topics (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),category TEXT NOT NULL,title TEXT NOT NULL,body TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS forum_replies (id INTEGER PRIMARY KEY,topic_id INTEGER NOT NULL REFERENCES forum_topics(id),user_id INTEGER NOT NULL REFERENCES users(id),body TEXT NOT NULL,created_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS forum_replies_topic ON forum_replies(topic_id,created_at);
      CREATE INDEX IF NOT EXISTS forum_replies_topic_id ON forum_replies(topic_id,id);
      CREATE TABLE IF NOT EXISTS forum_rewards (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),kind TEXT NOT NULL,content_id INTEGER NOT NULL,month TEXT NOT NULL,day TEXT NOT NULL,points INTEGER NOT NULL, UNIQUE(kind,content_id));
      CREATE INDEX IF NOT EXISTS forum_rewards_user_period ON forum_rewards(user_id,month,day,kind);
      CREATE TABLE IF NOT EXISTS month_settlements (user_id INTEGER NOT NULL REFERENCES users(id),month TEXT NOT NULL,points INTEGER NOT NULL,tickets INTEGER NOT NULL,created_at INTEGER NOT NULL, PRIMARY KEY(user_id,month));
      CREATE TABLE IF NOT EXISTS redemptions (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),item TEXT NOT NULL,cost INTEGER NOT NULL,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
    `)
    const version = this.db.prepare('PRAGMA user_version').get().user_version
    if (version < 1)
      this.transaction(() => {
        if (
          !this.db
            .prepare('PRAGMA table_info(users)')
            .all()
            .some((col) => col.name === 'email_verified_at')
        )
          this.db.exec('ALTER TABLE users ADD COLUMN email_verified_at INTEGER')
        this.db.exec(`CREATE TABLE IF NOT EXISTS email_verifications (
        challenge_hash TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE,
        purpose TEXT NOT NULL, user_id INTEGER REFERENCES users(id), name TEXT,
        password_hash TEXT, code_hash TEXT NOT NULL, version INTEGER NOT NULL,
        created_at INTEGER NOT NULL, code_expires_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL, resend_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL
      );
      DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email_verified_at IS NULL);
      PRAGMA user_version=1;`)
      })
    this.forum = new ForumStore(this.db, fail)
    if (version < 2) this.transaction(() => this.forum.migrate())
  }

  close() {
    this.mailer?.close?.()
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }

  transaction(operation) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  prune(now) {
    if (now - this.lastVerificationPrune >= 60000 || !this.lastVerificationPrune) {
      this.lastVerificationPrune = now
      this.db.prepare('DELETE FROM email_verifications WHERE expires_at<=?').run(now)
    }
    if (now - this.lastPrune < 3600000) return
    this.lastPrune = now
    this.db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(now)
    this.db.prepare('DELETE FROM game_challenges WHERE expires_at<=?').run(now)
    this.db.prepare('DELETE FROM rate_limits WHERE expires_at<=?').run(now)
  }

  rate(bucket, limit, now, window = 15 * 60000) {
    this.transaction(() => {
      const row = this.db
        .prepare('SELECT count,expires_at FROM rate_limits WHERE bucket=?')
        .get(bucket)
      if (row && row.expires_at > now && row.count >= limit)
        fail(
          429,
          'Слишком много попыток. Повторите позже.',
          'RATE_LIMITED',
          Math.ceil((row.expires_at - now) / 1000),
        )
      this.db
        .prepare(
          `INSERT INTO rate_limits VALUES (?,?,?) ON CONFLICT(bucket) DO UPDATE SET count=excluded.count,expires_at=excluded.expires_at`,
        )
        .run(
          bucket,
          row && row.expires_at > now ? row.count + 1 : 1,
          row && row.expires_at > now ? row.expires_at : now + window,
        )
    })
  }

  loginValue(value) {
    const login = field(value, 'Электронная почта', 5, 254).toLowerCase()
    if (
      !/^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9.-]+$/.test(login) ||
      login.split('@').length !== 2 ||
      (!this.options.emailDomains.includes('*') &&
        !this.options.emailDomains.includes(login.split('@')[1]))
    ) {
      fail(
        400,
        this.options.emailDomains.includes('*')
          ? 'Укажите действительный адрес электронной почты'
          : `Используйте почту: ${this.options.emailDomains.map((x) => '@' + x).join(', ')}`,
      )
    }
    return login
  }

  session(request, now) {
    const cookie = request.headers.cookie ?? ''
    const token = /(?:^|;\s*)campus_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(cookie)?.[1]
    if (!token) return null
    return (
      this.db
        .prepare(
          'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.email_verified_at IS NOT NULL',
        )
        .get(digest(token), now) ?? null
    )
  }

  sessionRecord(userId, now, request) {
    const previous = /(?:^|;\s*)campus_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(
      request.headers.cookie ?? '',
    )?.[1]
    const token = randomToken()
    if (previous) this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(previous))
    this.db
      .prepare('INSERT INTO sessions VALUES (?,?,?)')
      .run(digest(token), userId, now + SESSION_AGE)
    return token
  }

  setSessionCookie(response, token) {
    response.setHeader(
      'Set-Cookie',
      `campus_session=${token}; Path=/api/campus; HttpOnly; SameSite=Lax; Max-Age=${SESSION_AGE / 1000}${this.options.secureCookies ? '; Secure' : ''}`,
    )
  }

  sessionCookie(response, userId, now, request) {
    const token = this.transaction(() => this.sessionRecord(userId, now, request))
    this.setSessionCookie(response, token)
  }

  userView(user) {
    return {
      id: user.id,
      login: user.login,
      name: user.name,
      emailVerified: user.email_verified_at !== null,
    }
  }

  verificationReady() {
    if ((!this.mailer && !this.options.testEmailCode) || !this.codeSecret)
      fail(
        503,
        'Подтверждение почты пока недоступно. Сообщите администратору.',
        'EMAIL_DELIVERY_UNAVAILABLE',
      )
  }

  verificationView(row, token) {
    return {
      status: 'verification_required',
      challengeId: token,
      email: row.email,
      expiresAt: iso(Math.min(row.code_expires_at, row.expires_at)),
      resendAvailableAt: iso(row.resend_at),
    }
  }

  proxyLimitFactor(request) {
    // A local HTTPS proxy presents one socket IP for all visitors. Do not trust
    // forwarded headers from the browser: they can be supplied by the client.
    return this.options.publicOrigin &&
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress)
      ? 10
      : 1
  }

  limitMail(email, ip, now, factor = 1) {
    this.rate(`mail-email:${digest(email)}`, 5, now, 3600000)
    this.rate(`mail-ip:${ip}`, 20 * factor, now, 3600000)
  }

  async deliver(row, code) {
    if (!this.options.testEmailCode) {
      try {
        await this.mailer.send(row.email, code, row.purpose)
      } catch {
        this.db
          .prepare(
            "UPDATE email_verifications SET status='failed' WHERE challenge_hash=? AND version=? AND status='sending'",
          )
          .run(row.challenge_hash, row.version)
        fail(503, 'Не удалось отправить письмо. Попробуйте позже.', 'EMAIL_DELIVERY_UNAVAILABLE')
      }
    }
    const updated = this.db
      .prepare(
        "UPDATE email_verifications SET status='active' WHERE challenge_hash=? AND version=? AND status='sending'",
      )
      .run(row.challenge_hash, row.version)
    if (!updated.changes) fail(410, 'Заявка больше не действует.', 'VERIFICATION_EXPIRED')
  }

  async beginVerification(
    { email, purpose, userId = null, name = null, hash = null },
    ip,
    now,
    factor = 1,
  ) {
    this.verificationReady()
    const current = this.db
      .prepare('SELECT resend_at FROM email_verifications WHERE email=?')
      .get(email)
    if (current && current.resend_at > now)
      fail(
        429,
        'Подождите перед повторной отправкой кода.',
        'RATE_LIMITED',
        Math.ceil((current.resend_at - now) / 1000),
      )
    this.limitMail(email, ip, now, factor)
    const token = randomToken(),
      challengeHash = digest(token),
      code = this.options.testEmailCode ?? challengeCode()
    const row = {
      challenge_hash: challengeHash,
      email,
      purpose,
      user_id: userId,
      name,
      password_hash: hash,
      version: 1,
      created_at: now,
      code_expires_at: now + CODE_AGE,
      expires_at: now + CHALLENGE_AGE,
      resend_at: now + RESEND_DELAY,
    }
    this.transaction(() => {
      const old = this.db
        .prepare('SELECT resend_at FROM email_verifications WHERE email=?')
        .get(email)
      if (old && old.resend_at > now)
        fail(
          429,
          'Подождите перед повторной отправкой кода.',
          'RATE_LIMITED',
          Math.ceil((old.resend_at - now) / 1000),
        )
      this.db.prepare('DELETE FROM email_verifications WHERE email=?').run(email)
      this.db
        .prepare(
          `INSERT INTO email_verifications
        (challenge_hash,email,purpose,user_id,name,password_hash,code_hash,version,created_at,code_expires_at,expires_at,resend_at,attempts,status)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0,'sending')`,
        )
        .run(
          challengeHash,
          email,
          purpose,
          userId,
          name,
          hash,
          codeDigest(this.codeSecret, challengeHash, purpose, 1, code),
          1,
          now,
          row.code_expires_at,
          row.expires_at,
          row.resend_at,
        )
    })
    await this.deliver(row, code)
    return this.verificationView(row, token)
  }

  async resendVerification(token, ip, now, factor = 1) {
    this.verificationReady()
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      fail(410, 'Заявка больше не действует.', 'VERIFICATION_INVALID')
    const challengeHash = digest(token)
    let code = this.options.testEmailCode ?? challengeCode()
    const candidate = this.db
      .prepare(
        'SELECT email,resend_at,expires_at,attempts,status FROM email_verifications WHERE challenge_hash=?',
      )
      .get(challengeHash)
    if (!candidate) fail(410, 'Заявка больше не действует.', 'VERIFICATION_INVALID')
    if (candidate.expires_at <= now || candidate.attempts >= 5 || candidate.status === 'blocked')
      fail(410, 'Заявка больше не действует.', 'VERIFICATION_EXPIRED')
    if (candidate.resend_at > now || candidate.status === 'sending')
      fail(
        429,
        'Подождите перед повторной отправкой кода.',
        'RATE_LIMITED',
        Math.max(1, Math.ceil((candidate.resend_at - now) / 1000)),
      )
    this.limitMail(candidate.email, ip, now, factor)
    const row = this.transaction(() => {
      const previous = this.db
        .prepare('SELECT * FROM email_verifications WHERE challenge_hash=?')
        .get(challengeHash)
      if (
        !previous ||
        previous.expires_at <= now ||
        previous.attempts >= 5 ||
        previous.status === 'blocked'
      )
        fail(410, 'Заявка больше не действует.', 'VERIFICATION_EXPIRED')
      if (previous.resend_at > now || previous.status === 'sending')
        fail(
          429,
          'Подождите перед повторной отправкой кода.',
          'RATE_LIMITED',
          Math.max(1, Math.ceil((previous.resend_at - now) / 1000)),
        )
      while (
        !this.options.testEmailCode &&
        codeDigest(this.codeSecret, challengeHash, previous.purpose, previous.version, code) ===
          previous.code_hash
      )
        code = challengeCode()
      const row = {
        ...previous,
        version: previous.version + 1,
        code_expires_at: Math.min(now + CODE_AGE, previous.expires_at),
        resend_at: now + RESEND_DELAY,
      }
      this.db
        .prepare(
          `UPDATE email_verifications SET version=?,code_hash=?,code_expires_at=?,resend_at=?,status='sending'
        WHERE challenge_hash=?`,
        )
        .run(
          row.version,
          codeDigest(this.codeSecret, challengeHash, row.purpose, row.version, code),
          row.code_expires_at,
          row.resend_at,
          challengeHash,
        )
      return row
    })
    await this.deliver(row, code)
    return this.verificationView(row, token)
  }

  verifyEmail(token, code, ip, now, request, response) {
    this.verificationReady()
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      fail(410, 'Заявка больше не действует.', 'VERIFICATION_INVALID')
    this.rate(`code-ip:${ip}`, 100 * this.proxyLimitFactor(request), now, 3600000)
    const challengeHash = digest(token)
    const before = this.db
      .prepare('SELECT email FROM email_verifications WHERE challenge_hash=?')
      .get(challengeHash)
    if (!before) fail(410, 'Заявка больше не действует.', 'VERIFICATION_INVALID')
    this.rate(`code-email:${digest(before.email)}`, 10, now, 3600000)
    const authenticated = this.transaction(() => {
      const row = this.db
        .prepare('SELECT * FROM email_verifications WHERE challenge_hash=?')
        .get(challengeHash)
      if (!row || row.expires_at <= now || row.code_expires_at <= now || row.status === 'blocked')
        fail(410, 'Срок действия кода истёк. Запросите новый.', 'VERIFICATION_EXPIRED')
      if (row.status !== 'active') fail(410, 'Код пока недоступен.', 'VERIFICATION_INVALID')
      const actual = codeDigest(this.codeSecret, challengeHash, row.purpose, row.version, code)
      if (!timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(row.code_hash, 'hex'))) {
        this.db
          .prepare(
            "UPDATE email_verifications SET attempts=attempts+1,status=CASE WHEN attempts>=4 THEN 'blocked' ELSE status END WHERE challenge_hash=?",
          )
          .run(challengeHash)
        // Persist the failed attempt, then return a typed error after COMMIT.
        return { invalid: true }
      }
      let userId
      if (row.purpose === 'register') {
        if (this.db.prepare('SELECT 1 FROM users WHERE login=?').get(row.email))
          fail(409, 'Такая почта уже зарегистрирована.', 'EMAIL_ALREADY_REGISTERED')
        userId = Number(
          this.db
            .prepare(
              `INSERT INTO users(login,name,password_hash,created_at,email_verified_at)
          VALUES (?,?,?,?,?)`,
            )
            .run(row.email, row.name, row.password_hash, now, now).lastInsertRowid,
        )
      } else {
        const changed = this.db
          .prepare(
            'UPDATE users SET email_verified_at=? WHERE id=? AND login=? AND email_verified_at IS NULL',
          )
          .run(now, row.user_id, row.email)
        if (!changed.changes) fail(410, 'Заявка больше не действует.', 'VERIFICATION_INVALID')
        userId = row.user_id
      }
      this.db.prepare('DELETE FROM email_verifications WHERE email=?').run(row.email)
      return {
        userId,
        token: this.sessionRecord(userId, now, request),
        created: row.purpose === 'register',
      }
    })
    if (authenticated.invalid) fail(400, 'Неверный код подтверждения.', 'INVALID_CODE')
    this.setSessionCookie(response, authenticated.token)
    const account = this.db.prepare('SELECT * FROM users WHERE id=?').get(authenticated.userId)
    return {
      status: authenticated.created ? 201 : 200,
      data: {
        status: 'authenticated',
        user: this.userView(account),
        wallet: this.wallet(account.id, now),
      },
    }
  }

  settle(userId, now) {
    const current = monthKey(now)
    this.transaction(() => {
      const pending = this.db
        .prepare(
          `SELECT f.month,sum(f.points) AS points FROM forum_rewards f
        LEFT JOIN month_settlements s ON s.user_id=f.user_id AND s.month=f.month
        WHERE f.user_id=? AND f.month<? AND s.month IS NULL GROUP BY f.month`,
        )
        .all(userId, current)
      for (const row of pending) {
        const tickets = Math.floor(row.points / 50)
        this.db
          .prepare('INSERT INTO month_settlements VALUES (?,?,?,?,?)')
          .run(userId, row.month, row.points, tickets, now)
        this.db.prepare('UPDATE users SET tickets=tickets+? WHERE id=?').run(tickets, userId)
      }
    })
  }

  wallet(userId, now) {
    this.settle(userId, now)
    const user = this.db.prepare('SELECT balance,earned,tickets FROM users WHERE id=?').get(userId)
    const floor = FLOORS.filter((x) => user.earned >= x).length
    const forumPoints = this.db
      .prepare(
        'SELECT COALESCE(sum(points),0) AS points FROM forum_rewards WHERE user_id=? AND month=?',
      )
      .get(userId, monthKey(now)).points
    const gameAvailable = !this.db
      .prepare("SELECT 1 FROM activities WHERE user_id=? AND kind='game' AND period=?")
      .get(userId, dayKey(now))
    const activity = this.db
      .prepare(
        'SELECT label,points,created_at FROM activities WHERE user_id=? ORDER BY id DESC LIMIT 25',
      )
      .all(userId)
      .map((x) => ({ label: x.label, points: x.points, createdAt: iso(x.created_at) }))
    return {
      ...user,
      floor,
      forumPoints,
      nextFloorAt: FLOORS[floor] ?? null,
      gameAvailable,
      activity,
    }
  }

  award(userId, kind, key, period, points, label, now) {
    const result = this.db
      .prepare(
        'INSERT OR IGNORE INTO activities(user_id,kind,activity_key,period,points,label,created_at) VALUES (?,?,?,?,?,?,?)',
      )
      .run(userId, kind, key, period, points, label, now)
    if (result.changes)
      this.db
        .prepare('UPDATE users SET balance=balance+?,earned=earned+? WHERE id=?')
        .run(points, points, userId)
    return Boolean(result.changes)
  }

  knownNews(key) {
    if (this.options.newsIds) return this.options.newsIds.includes(key)
    for (const filename of this.options.newsFiles) {
      try {
        const data = JSON.parse(readFileSync(filename, 'utf8'))
        if (data.news?.some((item) => item.id === key)) return true
      } catch {
        /* Use the next real catalog, never trust client IDs. */
      }
    }
    return false
  }

  routeKey(value) {
    const match = /^([^>:]{1,80})>([^>:]{1,80}):(inside|outside)$/.exec(value)
    if (!match) fail(400, 'Некорректный ключ маршрута')
    const from = parsePlace(match[1]),
      to = parsePlace(match[2])
    if (!from || !to || from.id === to.id) fail(400, 'Маршрут не подтверждён схемой кампуса')
    const route = planRoute(from.id, to.id, match[3] === 'outside')
    if (!route.ok || !route.edges.length)
      fail(400, 'Для награды нужен маршрут по переходам схемы кампуса')
    return 'graph:' + digest(JSON.stringify(route.edges.map((edge) => [edge.from, edge.to])))
  }

  topic(id, viewerId = null) {
    return this.forum.topic(id, viewerId)
  }
  reply(id, viewerId = null) {
    return this.forum.reply(id, viewerId)
  }
  forumCap(userId, kind, cap, now) {
    const count = this.db
      .prepare('SELECT count(*) AS count FROM forum_rewards WHERE user_id=? AND kind=? AND day=?')
      .get(userId, kind, dayKey(now)).count
    return count < cap
  }

  async body(request) {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers['content-type'] ?? ''))
      fail(415, 'Отправьте application/json')
    if (Number(request.headers['content-length'] ?? 0) > 32768) {
      request.resume()
      fail(413, 'Запрос слишком большой')
    }
    let length = 0
    const chunks = []
    for await (const chunk of request) {
      length += chunk.length
      if (length > 32768) fail(413, 'Запрос слишком большой')
      chunks.push(chunk)
    }
    let data
    try {
      data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    } catch {
      fail(400, 'Некорректный JSON')
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Ожидается объект JSON')
    return data
  }

  checkOrigin(request) {
    if (request.headers['sec-fetch-site'] === 'cross-site')
      fail(403, 'Запрос с другого сайта запрещён')
    const expected =
      this.options.publicOrigin ??
      `${this.options.secureCookies ? 'https' : 'http'}://${request.headers.host}`
    const origin = request.headers.origin
    if (origin && origin !== expected) fail(403, 'Запрос с другого сайта запрещён')
  }

  middleware() {
    return (
      request,
      response,
      next = () => {
        response.writeHead(404)
        response.end()
      },
    ) => {
      let pathname
      try {
        pathname = new URL(request.url, 'http://localhost').pathname
      } catch {
        response.writeHead(400, {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        })
        response.end(JSON.stringify({ error: 'Некорректный адрес запроса' }))
        return
      }
      if (pathname !== '/api/campus' && !pathname.startsWith('/api/campus/')) {
        next()
        return
      }
      response.setHeader('Content-Type', 'application/json; charset=utf-8')
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('X-Content-Type-Options', 'nosniff')
      this.handle(request, response, pathname.slice('/api/campus'.length))
        .then(({ status = 200, data }) => {
          response.writeHead(status)
          response.end(JSON.stringify(data))
        })
        .catch((error) => {
          if (response.destroyed) return
          const status = error instanceof HttpError ? error.status : 500
          if (status === 429)
            response.setHeader('Retry-After', String(error.retryAfterSeconds ?? 900))
          if (status === 500) console.error('Campus API:', error)
          response.writeHead(status)
          response.end(
            JSON.stringify({
              error: status === 500 ? 'Внутренняя ошибка сервера' : error.message,
              ...(error.code ? { code: error.code } : {}),
              ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
            }),
          )
        })
    }
  }

  async handle(request, response, path) {
    const now = this.now()
    this.prune(now)
    const method = request.method
    if (!['GET', 'POST'].includes(method)) fail(405, 'Метод не поддерживается')
    if (method === 'POST') this.checkOrigin(request)
    const user = this.session(request, now)
    const result = (data) => ({ data })
    if (method === 'GET' && path === '/auth/config')
      return result({
        emailDomains: this.options.emailDomains,
        registrationEnabled: this.options.registrationEnabled,
        testEmailCode: this.options.testEmailCode ?? null,
        passwordMinLength: 15,
        passwordMaxLength: 128,
        nameMaxLength: 80,
      })
    if (method === 'GET' && path === '/me')
      return result(
        user
          ? { user: this.userView(user), wallet: this.wallet(user.id, now) }
          : { user: null, wallet: null },
      )
    if (method === 'GET' && path === '/leaderboard') {
      const users = this.db
        .prepare('SELECT id,name,earned FROM users ORDER BY earned DESC,id ASC LIMIT 100')
        .all()
        .map((x) => ({ ...x, floor: FLOORS.filter((n) => x.earned >= n).length }))
      return result({ users, total: this.db.prepare('SELECT count(*) AS n FROM users').get().n })
    }
    if (method === 'GET' && path === '/forum/topics')
      return result(
        this.forum.list(
          new URL(request.url, 'http://localhost').searchParams,
          pageOptions(request, 'beforeId'),
          user?.id ?? null,
          CATEGORIES,
        ),
      )
    const topicMatch = /^\/forum\/topics\/([1-9]\d{0,14})$/.exec(path)
    if (method === 'GET' && topicMatch)
      return result(
        this.forum.detail(
          Number(topicMatch[1]),
          pageOptions(request, 'beforeReplyId'),
          user?.id ?? null,
        ),
      )
    if (method !== 'POST') fail(404, 'Не найдено')
    if (path === '/auth/register' && !this.options.registrationEnabled)
      fail(403, 'Регистрация временно закрыта. Войдите в выданный тестовый аккаунт.')
    // Limit costly password derivations before body parsing; persist limits across restarts.
    const ip = digest(request.socket.remoteAddress ?? 'unknown')
    const proxyFactor = this.proxyLimitFactor(request)
    if (path === '/auth/login' || path === '/auth/register')
      this.rate(`auth-ip:${ip}`, 30 * proxyFactor, now)
    const body = await this.body(request)
    if (path === '/auth/verify-email') {
      const token = field(body.challengeId, 'Заявка', 43, 43)
      const code = field(body.code, 'Код', 6, 6, false)
      if (!/^[0-9]{6}$/.test(code)) fail(400, 'Введите шесть цифр кода.', 'VALIDATION_ERROR')
      return this.verifyEmail(token, code, ip, now, request, response)
    }
    if (path === '/auth/resend-code') {
      const token = field(body.challengeId, 'Заявка', 43, 43)
      return result(await this.resendVerification(token, ip, now, proxyFactor))
    }
    if (path === '/auth/register' || path === '/auth/login') {
      const login = this.loginValue(body.login)
      const password = field(
        body.password,
        'Пароль',
        path === '/auth/register' ? 15 : 1,
        128,
        false,
      )
      if (path === '/auth/register') {
        this.rate(`register-ip:${ip}`, 8 * proxyFactor, now, 3600000)
        const name = field(body.name ?? login.split('@')[0], 'Имя', 2, 80)
        if (this.db.prepare('SELECT 1 FROM users WHERE login=?').get(login))
          fail(409, 'Такая почта уже зарегистрирована', 'EMAIL_ALREADY_REGISTERED')
        this.verificationReady()
        const hash = await passwordHash(password)
        return {
          status: 202,
          data: await this.beginVerification(
            { email: login, purpose: 'register', name, hash },
            ip,
            now,
            proxyFactor,
          ),
        }
      }
      this.rate(`login:${digest(login)}`, 10, now)
      const account = this.db.prepare('SELECT * FROM users WHERE login=?').get(login)
      // A fixed salt/hash performs the same expensive derivation for unknown accounts.
      const stored = account?.password_hash ?? `scrypt$32768$${'0'.repeat(32)}$${'0'.repeat(128)}`
      const valid = await passwordMatches(password, stored)
      if (!account || !valid) fail(401, 'Неверная почта или пароль')
      if (account.email_verified_at === null) {
        const pending = await this.beginVerification(
          { email: login, purpose: 'existing', userId: account.id },
          ip,
          now,
          proxyFactor,
        )
        return { status: 202, data: pending }
      }
      if (account.password_hash.startsWith('scrypt$32768$'))
        this.db
          .prepare('UPDATE users SET password_hash=? WHERE id=?')
          .run(await passwordHash(password), account.id)
      this.sessionCookie(response, account.id, now, request)
      return result({
        status: 'authenticated',
        user: this.userView(account),
        wallet: this.wallet(account.id, now),
      })
    }
    if (path === '/auth/logout') {
      const token = /(?:^|;\s*)campus_session=([A-Za-z0-9_-]{43})(?:;|$)/.exec(
        request.headers.cookie ?? '',
      )?.[1]
      if (token) this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(digest(token))
      response.setHeader(
        'Set-Cookie',
        `campus_session=; Path=/api/campus; HttpOnly; SameSite=Lax; Max-Age=0${this.options.secureCookies ? '; Secure' : ''}`,
      )
      return result({ ok: true })
    }
    if (!user) fail(401, 'Войдите с университетской почтой')
    this.rate(`writes:${user.id}`, 120, now, 60000)
    const forumAction = /^\/forum\/(topics|replies)\/([1-9]\d{0,14})\/(like|bookmark|delete)$/.exec(
      path,
    )
    if (forumAction)
      return result(
        this.transaction(() =>
          this.forum.interact(
            forumAction[1],
            Number(forumAction[2]),
            forumAction[3],
            body,
            user.id,
            now,
          ),
        ),
      )
    if (path === '/reward') {
      const kind = field(body.kind, 'Тип действия', 1, 20),
        key = field(body.key, 'Ключ действия', 1, 200)
      let activityKey = key,
        period = '',
        points,
        label
      if (kind === 'news-read' || kind === 'news-save') {
        if (!this.knownNews(key)) fail(400, 'Новость не найдена в ленте')
        points = kind === 'news-read' ? 3 : 1
        label = kind === 'news-read' ? 'Прочитана новость' : 'Сохранена новость'
      } else if (kind === 'route') {
        activityKey = this.routeKey(key)
        period = dayKey(now)
        points = 2
        label = 'Построен маршрут'
      } else fail(400, 'Неизвестное действие')
      const added = this.transaction(() =>
        this.award(user.id, kind, activityKey, period, points, label, now),
      )
      return result({
        added,
        message: added ? `Начислено +${points}` : 'За это действие баллы уже начислены',
        wallet: this.wallet(user.id, now),
      })
    }
    if (path === '/game/start') {
      if (!this.wallet(user.id, now).gameAvailable)
        fail(409, 'Сегодня награда за игру уже получена')
      const challengeId = randomToken()
      this.transaction(() => {
        this.db.prepare('DELETE FROM game_challenges WHERE user_id=? AND consumed=0').run(user.id)
        this.db
          .prepare(
            'INSERT INTO game_challenges(token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)',
          )
          .run(digest(challengeId), user.id, now, now + 15 * 60000)
      })
      return result({ challengeId, clicksRequired: 40 })
    }
    if (path === '/game/finish') {
      const id = field(body.challengeId, 'Игра', 43, 43)
      if (!Number.isInteger(body.clicks) || body.clicks < 40 || body.clicks > 10000)
        fail(400, 'Нужно собрать 40 кликов')
      const added = this.transaction(() => {
        const challenge = this.db
          .prepare('SELECT * FROM game_challenges WHERE token_hash=? AND user_id=?')
          .get(digest(id), user.id)
        if (!challenge || challenge.expires_at <= now || now - challenge.created_at < 5000)
          fail(400, 'Игра недействительна, истекла или завершена слишком быстро')
        if (challenge.consumed) return false
        this.db.prepare('UPDATE game_challenges SET consumed=1 WHERE token_hash=?').run(digest(id))
        return this.award(user.id, 'game', 'daily', dayKey(now), 25, 'Игра: собраны 40 кликов', now)
      })
      return result({
        added,
        message: added ? 'Начислено +25' : 'Награда уже получена',
        wallet: this.wallet(user.id, now),
      })
    }
    if (path === '/redeem') {
      if (body.item !== 'hoodie') fail(400, 'Неизвестный товар')
      this.transaction(() => {
        const changed = this.db
          .prepare('UPDATE users SET balance=balance-500 WHERE id=? AND balance>=500')
          .run(user.id)
        if (!changed.changes) fail(409, 'Недостаточно баллов: нужно 500')
        const id = Number(
          this.db
            .prepare(
              "INSERT INTO redemptions(user_id,item,cost,created_at) VALUES (?,'hoodie',500,?)",
            )
            .run(user.id, now).lastInsertRowid,
        )
        this.db
          .prepare(
            "INSERT INTO activities(user_id,kind,activity_key,period,points,label,created_at) VALUES (?,'redeem',?,'',-500,'Демо-заявка: худи',?)",
          )
          .run(user.id, String(id), now)
      })
      return result({
        message:
          'Демо-заявка на худи создана: списано 500 баллов. Реальная выдача мерча не подключена.',
        wallet: this.wallet(user.id, now),
      })
    }
    if (path === '/forum/topics') {
      const category = field(body.category, 'Категория', 1, 20),
        title = field(body.title, 'Заголовок', 5, 120),
        text = field(body.body, 'Текст', 10, 4000)
      if (!CATEGORIES.has(category)) fail(400, 'Неизвестная категория')
      const dayStart = Date.parse(`${dayKey(now)}T00:00:00+05:00`)
      let forumPointsAdded = 0
      const id = this.transaction(() => {
        if (
          this.db
            .prepare(
              'SELECT 1 FROM forum_topics WHERE user_id=? AND title=? AND body=? AND created_at>=?',
            )
            .get(user.id, title, text, dayStart)
        )
          fail(409, 'Такая тема уже опубликована сегодня')
        forumPointsAdded = this.forumCap(user.id, 'topic', 3, now) ? 5 : 0
        const id = Number(
          this.db
            .prepare(
              'INSERT INTO forum_topics(user_id,category,title,body,created_at) VALUES (?,?,?,?,?)',
            )
            .run(user.id, category, title, text, now).lastInsertRowid,
        )
        if (forumPointsAdded)
          this.db
            .prepare(
              "INSERT INTO forum_rewards(user_id,kind,content_id,month,day,points) VALUES (?,'topic',?,?,?,5)",
            )
            .run(user.id, id, monthKey(now), dayKey(now))
        return id
      })
      return {
        status: 201,
        data: {
          topic: this.topic(id, user.id),
          forumPointsAdded,
          wallet: this.wallet(user.id, now),
        },
      }
    }
    const repliesMatch = /^\/forum\/topics\/([1-9]\d{0,14})\/replies$/.exec(path)
    if (repliesMatch) {
      const topicId = Number(repliesMatch[1]),
        text = field(body.body, 'Ответ', 3, 3000)
      const parentId = body.parentId ?? null
      const dayStart = Date.parse(`${dayKey(now)}T00:00:00+05:00`)
      let forumPointsAdded = 0
      const id = this.transaction(() => {
        if (!this.topic(topicId)) fail(404, 'Тема не найдена')
        if (parentId !== null) {
          if (!Number.isSafeInteger(parentId) || parentId < 1)
            fail(400, 'Некорректный адресат ответа')
          const parent = this.reply(parentId)
          if (!parent || parent.topicId !== topicId)
            fail(400, 'Ответ, на который вы ссылаетесь, удалён или относится к другой теме')
        }
        if (
          this.db
            .prepare(
              'SELECT 1 FROM forum_replies WHERE user_id=? AND topic_id=? AND body=? AND created_at>=?',
            )
            .get(user.id, topicId, text, dayStart)
        )
          fail(409, 'Такой ответ уже опубликован сегодня')
        forumPointsAdded = this.forumCap(user.id, 'reply', 10, now) ? 2 : 0
        const id = Number(
          this.db
            .prepare(
              'INSERT INTO forum_replies(topic_id,user_id,body,created_at,parent_id) VALUES (?,?,?,?,?)',
            )
            .run(topicId, user.id, text, now, parentId).lastInsertRowid,
        )
        if (forumPointsAdded)
          this.db
            .prepare(
              "INSERT INTO forum_rewards(user_id,kind,content_id,month,day,points) VALUES (?,'reply',?,?,?,2)",
            )
            .run(user.id, id, monthKey(now), dayKey(now))
        return id
      })
      return {
        status: 201,
        data: {
          reply: this.reply(id, user.id),
          topic: this.topic(topicId, user.id),
          forumPointsAdded,
          wallet: this.wallet(user.id, now),
        },
      }
    }
    fail(404, 'Не найдено')
  }
}
