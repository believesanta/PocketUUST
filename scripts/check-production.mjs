#!/usr/bin/env node
import { access, stat } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { createTransport } from 'nodemailer'
import { DatabaseSync } from 'node:sqlite'
import { campusSettings } from '../services/campus/service.mjs'
import { settingsFromEnv } from '../services/schedule/settings.mjs'

const errors = []
const warn = (message) => console.warn(`Внимание: ${message}`)
const requireSetting = (condition, message) => {
  if (!condition) errors.push(message)
}

try {
  process.loadEnvFile()
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
const env = process.env
const campus = campusSettings(env)
const schedule = settingsFromEnv(env)
const major = Number(process.versions.node.split('.')[0])
requireSetting(major === 24, 'Нужен Node.js 24.x.')
requireSetting(env.NODE_ENV === 'production', 'Установите NODE_ENV=production.')
requireSetting(env.HOST === '127.0.0.1', 'Для Funnel установите HOST=127.0.0.1 (локальный адрес).')
requireSetting(!env.PORT || env.PORT === '3000', 'Инструкция Funnel рассчитана на PORT=3000.')
requireSetting(!schedule.offline, 'Уберите SCHEDULE_OFFLINE=1, иначе расписание не обновится.')
let publicUrl
try {
  publicUrl = new URL(env.CAMPUS_PUBLIC_ORIGIN)
  requireSetting(
    publicUrl.protocol === 'https:' &&
      !publicUrl.username &&
      !publicUrl.password &&
      publicUrl.pathname === '/' &&
      !publicUrl.search &&
      !publicUrl.hash &&
      publicUrl.hostname.includes('.') &&
      publicUrl.port === '',
    'CAMPUS_PUBLIC_ORIGIN должен быть точным HTTPS-адресом сайта без пути и порта.',
  )
} catch {
  errors.push('Укажите CAMPUS_PUBLIC_ORIGIN=https://<адрес из tailscale funnel>.')
}
if (campus.registrationEnabled) {
  requireSetting(
    /^[0-9a-f]{64}$/i.test(env.CAMPUS_EMAIL_CODE_SECRET ?? ''),
    'Укажите CAMPUS_EMAIL_CODE_SECRET из 64 hex-символов для подтверждения почты.',
  )
  requireSetting(
    Boolean(
      campus.smtpHost && campus.smtpPort && campus.smtpUser && campus.smtpPassword && campus.mailFrom,
    ),
    'Для регистрации нужны CAMPUS_SMTP_HOST/PORT/USER/PASSWORD/MAIL_FROM.',
  )
  if (campus.smtpPort === 465 && !campus.smtpSecure)
    errors.push('Для порта 465 установите CAMPUS_SMTP_SECURE=true.')
  if (campus.smtpPort === 587 && campus.smtpSecure)
    errors.push('Для порта 587 установите CAMPUS_SMTP_SECURE=false.')
} else {
  requireSetting(
    campus.emailDomains.length === 1 && campus.emailDomains[0] === 'stud.uust.ru',
    'Для тестовых аккаунтов установите CAMPUS_EMAIL_DOMAINS=stud.uust.ru.',
  )
  try {
    const db = new DatabaseSync(campus.databasePath, { readOnly: true })
    try {
      const { count } = db.prepare("SELECT count(*) AS count FROM users WHERE email_verified_at IS NOT NULL AND login LIKE '%@stud.uust.ru'").get()
      requireSetting(count >= 128, `Найдено ${count} подтверждённых студенческих аккаунтов; нужно 128. Восстановите .runtime или импортируйте приватный test-accounts.txt.`)
    } finally {
      db.close()
    }
  } catch {
    errors.push('Не удалось прочитать базу аккаунтов. Восстановите .runtime/campus/campus.sqlite до публикации.')
  }
}
try {
  await access(new URL('../dist/index.html', import.meta.url))
} catch {
  errors.push('Отсутствует сборка: выполните npm run build.')
}
const python = spawnSync(schedule.python, ['--version'], { encoding: 'utf8', timeout: 5000 })
const match = /^Python (\d+)\.(\d+)/.exec(python.stdout || python.stderr || '')
requireSetting(
  python.status === 0 &&
    match &&
    (Number(match[1]) > 3 || (Number(match[1]) === 3 && Number(match[2]) >= 12)),
  'Для расписания нужен Python 3.12+ (или настройте SCHEDULE_PYTHON).',
)
for (const [name, url] of [
  ['.env', new URL('../.env', import.meta.url)],
  ['.runtime', new URL('../.runtime', import.meta.url)],
]) {
  try {
    const mode = (await stat(url)).mode
    if (process.platform !== 'win32' && mode & 0o077)
      warn(`${name} читается другими пользователями системы; ограничьте права через chmod.`)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}
if (env.CAMPUS_TEST_EMAIL_CODE) warn('CAMPUS_TEST_EMAIL_CODE в production отключён.')
if (campus.emailDomains.includes('*') && campus.registrationEnabled)
  warn('Сейчас зарегистрироваться можно с любой почтой (CAMPUS_EMAIL_DOMAINS=*).')
if (errors.length) {
  for (const message of errors) console.error(`Ошибка: ${message}`)
  process.exitCode = 1
} else {
  console.log('Конфигурация сайта и окружения проверена.')
  if (!campus.registrationEnabled) {
    console.log('Новая регистрация отключена; выданные подтверждённые аккаунты могут войти без SMTP.')
    process.exit(0)
  }
  console.log('Проверяю подключение к SMTP…')
  const transport = createTransport({
    host: campus.smtpHost,
    port: campus.smtpPort,
    secure: campus.smtpSecure,
    requireTLS: !campus.smtpSecure,
    auth: { user: campus.smtpUser, pass: campus.smtpPassword },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
    tls: { rejectUnauthorized: true },
  })
  try {
    await transport.verify()
    console.log(
      'SMTP подключился. Проверка не отправляет письмо; проверьте регистрацию после публикации.',
    )
  } catch {
    console.error('Ошибка: SMTP не подтвердил подключение/вход. Проверьте настройки и доступ сети.')
    process.exitCode = 1
  } finally {
    transport.close()
  }
}
