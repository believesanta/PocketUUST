import { createHash } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SERVICE_ROOT = dirname(fileURLToPath(import.meta.url))
export const PREFIX = '/api/schedule/v1'
export const SCHEDULE_KINDS = new Set(['group', 'teacher', 'room'])

export function settingsFromEnv(env = process.env, overrides = {}) {
  const settings = {
    database: resolve(env.SCHEDULE_DATABASE || resolve(SERVICE_ROOT, '../../.runtime/schedule/schedule.sqlite3')),
    upstreamUrl: env.UUST_API_BASE || 'https://dev.uust-time.ru/api/v/852972',
    python: env.SCHEDULE_PYTHON || (process.platform === 'win32' ? 'python' : 'python3'),
    periodId: Number(env.SCHEDULE_PERIOD_ID || 241),
    periodLabel: env.SCHEDULE_PERIOD_LABEL || '2026/2027',
    firstMonday: env.SCHEDULE_FIRST_MONDAY || '2026-08-31',
    timezone: env.SCHEDULE_TIMEZONE || 'Asia/Yekaterinburg',
    scheduleTtl: Number(env.SCHEDULE_TTL || 86400),
    catalogTtl: Number(env.SCHEDULE_CATALOG_TTL || 86400),
    retryDelay: Number(env.SCHEDULE_RETRY_DELAY || 60),
    pollInterval: Number(env.SCHEDULE_POLL_INTERVAL || 30),
    upstreamTimeout: Number(env.SCHEDULE_UPSTREAM_TIMEOUT || 30),
    offline: env.SCHEDULE_OFFLINE === '1',
    ...overrides,
  }
  const monday = new Date(`${settings.firstMonday}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(settings.firstMonday)
      || !Number.isFinite(monday.getTime()) || monday.getUTCDay() !== 1
      || monday.toISOString().slice(0, 10) !== settings.firstMonday) {
    throw new Error('SCHEDULE_FIRST_MONDAY должен быть датой понедельника YYYY-MM-DD.')
  }
  for (const key of ['periodId', 'scheduleTtl', 'catalogTtl', 'retryDelay', 'pollInterval', 'upstreamTimeout']) {
    if (!Number.isSafeInteger(settings[key]) || settings[key] <= 0) throw new Error(`Некорректная настройка: ${key}`)
  }
  new Intl.DateTimeFormat('en', { timeZone: settings.timezone }).format()
  settings.namespace = createHash('sha256').update(settings.upstreamUrl.replace(/\/$/, '')).digest('hex').slice(0, 16)
  return settings
}

export function calendar(settings, now = Date.now()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: settings.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(now)).map((part) => [part.type, part.value]))
  const today = `${parts.year}-${parts.month}-${parts.day}`
  const week = Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${settings.firstMonday}T00:00:00Z`)) / 604800000) + 1
  const currentWeek = Math.max(1, Math.min(53, week))
  const lastWeek = Math.min(53, currentWeek + 4)
  return {
    period_id: settings.periodId, period_label: settings.periodLabel,
    first_week_monday: settings.firstMonday, current_week: currentWeek,
    window_start_week: currentWeek, window_end_week: lastWeek,
    window_start_date: weekDays(settings, currentWeek)[0].date,
    window_end_date: weekDays(settings, lastWeek)[6].date,
    today, timezone: settings.timezone,
  }
}

export function weekDays(settings, week) {
  if (week === null) return []
  const start = Date.parse(`${settings.firstMonday}T00:00:00Z`) + (week - 1) * 604800000
  return Array.from({ length: 7 }, (_, day) => ({
    weekday: day + 1, date: new Date(start + day * 86400000).toISOString().slice(0, 10),
  }))
}
