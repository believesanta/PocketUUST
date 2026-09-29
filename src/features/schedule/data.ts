import { getLocale } from '../../shared/i18n/index.ts'
import type { RoomId } from '../../shared/types'

const API = '/api/schedule/v1'
const STORAGE = 'pocketuust:schedule:v1:'

export interface Configuration {
  period_id: number
  period_label: string
  first_week_monday: string
  current_week: number
  window_start_week: number
  window_end_week: number
  window_start_date: string
  window_end_date: string
  today: string
  timezone: string
}

export interface Group {
  group_id: number
  group_title: string
  course: number | null
  faculty: string | null
  filial_id: number | null
  filial_title: string | null
}

interface Metadata {
  source_url: string
  fetched_at: string
  expires_at: string
  stale: boolean
  refreshing: boolean
  refresh_error: string | null
  offline: boolean
}

export interface AvailableGroups {
  groups: Group[]
  total: number
  catalog_loaded: boolean
  fetched_at: string | null
  refreshing: boolean
  refresh_error: string | null
  import: { total: number; downloaded: number; fresh: number; waiting_retry: number }
}

export interface Lesson {
  id: string
  schedule_id: number | string
  subject: string
  lesson_type: string | null
  weekday: number
  weeks: number[]
  date: string | null
  time: { slot: number | null; text: string; start: string | null; end: string | null }
  teacher: { id: number | null; name: string | null }
  room: {
    id: number | null
    title: string | null
    short_title: string | null
    building_title: string | null
    building_short_title: string | null
    map_id: RoomId | null
  }
  comment: string | null
}

export interface ScheduleData extends Metadata {
  schema_version: number
  entity: { type: string; id: number }
  semester_id: number
  week: number
  week_start: string
  week_end: string
  days: { weekday: number; date: string }[]
  lessons: Lesson[]
  undated_count: number
  undated: { subject: string | null; teacher: string | null; comment: string | null; weeks: (string | number)[] | null }[]
}

export interface Selection { id: number; title: string }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value
const timestamp = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value))
const optionalText = (value: unknown) => value === null || typeof value === 'string'
const textFields = (value: unknown, keys: string[]) => record(value) && keys.every(key=>optionalText(value[key]))
const clock = (value: unknown) => value === null || typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

function isSchedule(value: unknown): value is ScheduleData {
  if (!record(value) || value.schema_version !== 1 || !record(value.entity)) return false
  if (!timestamp(value.fetched_at) || !timestamp(value.expires_at) || !positive(value.semester_id)) return false
  if (!positive(value.entity.id) || !positive(value.week) || value.week > 53) return false
  if (!date(value.week_start) || !date(value.week_end) || typeof value.source_url !== 'string'
    || !['stale','refreshing','offline'].every(key=>typeof value[key]==='boolean') || !optionalText(value.refresh_error)) return false
  if (!Array.isArray(value.lessons) || !Array.isArray(value.days)
    || !Number.isInteger(value.undated_count) || !Array.isArray(value.undated)
    || value.undated_count !== value.undated.length || value.days.length !== 7) return false
  return value.lessons.every((lesson: unknown) => record(lesson)
    && typeof lesson.id === 'string' && typeof lesson.subject === 'string'
    && positive(lesson.weekday) && lesson.weekday <= 7 && date(lesson.date)
    && optionalText(lesson.lesson_type) && optionalText(lesson.comment)
    && record(lesson.time) && clock(lesson.time.start) && clock(lesson.time.end)
    && textFields(lesson.room, ['title','short_title','building_title','building_short_title','map_id'])
    && record(lesson.teacher) && optionalText(lesson.teacher.name))
    && value.days.every((day: unknown, index: number) => record(day)
      && day.weekday === index + 1 && date(day.date))
    && value.undated.every((entry: unknown)=>record(entry)
      && ['subject','teacher','comment'].every(key=>optionalText(entry[key]))
      && (entry.weeks===null || Array.isArray(entry.weeks) && entry.weeks.every(week=>typeof week==='number'||typeof week==='string')))
}

function readLocal(key: string): unknown {
  try {
    const value = localStorage.getItem(STORAGE + key)
    return value ? JSON.parse(value) : null
  } catch { return null }
}

function writeLocal(key: string, value: unknown) {
  try { localStorage.setItem(STORAGE + key, JSON.stringify(value)) } catch {
    // A full/disabled browser cache must not break an online response.
  }
}

async function request(path: string, signal: AbortSignal): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(API + path, { signal, headers: { Accept: 'application/json' } })
  } catch (error) {
    if (signal.aborted) throw error
    throw new Error('Не удалось связаться с сервисом расписания. Проверьте соединение и повторите попытку.')
  }
  let value: unknown
  try { value = await response.json() } catch {
    throw new Error('Сервис расписания недоступен. Повторите попытку позже.')
  }
  if (!response.ok) {
    if (response.status === 503) {
      const detail = record(value) && typeof value.detail === 'string' ? ` Причина: ${value.detail}` : ''
      throw new Error(`Расписание ещё не удалось загрузить; сервер повторит попытку.${detail}`)
    }
    const detail = record(value) && typeof value.detail === 'string' ? value.detail : 'Не удалось получить расписание.'
    throw new Error(detail)
  }
  return value
}

function isConfiguration(value: unknown): value is Configuration {
  if (!record(value) || !positive(value.period_id) || typeof value.period_label !== 'string'
    || !positive(value.current_week) || value.current_week > 53
    || !positive(value.window_start_week) || !positive(value.window_end_week)
    || !date(value.window_start_date) || !date(value.window_end_date)
    || !date(value.first_week_monday) || !date(value.today) || typeof value.timezone !== 'string') return false
  try { new Intl.DateTimeFormat('en',{timeZone:value.timezone}).format() } catch { return false }
  return new Date(value.first_week_monday).getUTCDay() === 1
}

export function savedConfiguration(): Configuration | null {
  const value = readLocal('config')
  return isConfiguration(value) ? value : null
}

export async function loadConfiguration(signal: AbortSignal): Promise<Configuration> {
  const value = await request('/config', signal)
  if (!isConfiguration(value)) throw new Error('Сервис вернул неизвестный учебный период.')
  writeLocal('config', value)
  return value
}

export async function loadAvailableGroups(signal: AbortSignal): Promise<AvailableGroups> {
  const value = await request('/groups/available', signal)
  if (!record(value) || !Array.isArray(value.groups) || !Number.isInteger(value.total)
    || typeof value.catalog_loaded !== 'boolean' || typeof value.refreshing !== 'boolean'
    || !record(value.import) || !Number.isInteger(value.import.total)
    || !Number.isInteger(value.import.downloaded)
    || !value.groups.every((group: unknown) => record(group)
      && Number.isSafeInteger(group.group_id) && typeof group.group_title === 'string')) {
    throw new Error('Сервис вернул неизвестный формат списка групп.')
  }
  return value as unknown as AvailableGroups
}

export function savedSelection(): Selection | null {
  const value = readLocal('selection')
  return record(value) && positive(value.id) && typeof value.title === 'string'
    && value.title.length > 0 && value.title.length <= 150 ? { id: value.id, title: value.title } : null
}

export function saveSelection(selection: Selection) {
  writeLocal('selection', selection)
}

function snapshotKey(group: number, period: number, week: number) {
  return `snapshot:${group}:${period}:${week}`
}

export function savedSchedule(group: number, period: number, week: number): ScheduleData | null {
  const value = readLocal(snapshotKey(group, period, week))
  return isSchedule(value) && value.entity.type === 'group'
    && value.entity.id === group && value.semester_id === period && value.week === week
    ? value : null
}

export async function loadSchedule(
  group: number, period: number, week: number, signal: AbortSignal, refresh = false,
): Promise<ScheduleData> {
  const value = await request(`/schedules/group/${group}?semester=${period}&week=${week}${refresh ? '&refresh=true' : ''}`, signal)
  if (!isSchedule(value) || value.entity.type !== 'group' || value.entity.id !== group
    || value.semester_id !== period || value.week !== week) {
    throw new Error('Ответ сервиса не совпадает с выбранной группой или неделей.')
  }
  const key = snapshotKey(group, period, week)
  const index = readLocal('snapshots')
  const previous = Array.isArray(index) ? index.filter((item): item is string => typeof item === 'string' && item.startsWith('snapshot:')) : []
  const keys = [key, ...previous.filter((item) => item !== key)]
  try {
    for (const old of keys.slice(8)) localStorage.removeItem(STORAGE + old)
  } catch { /* Optional local cache. */ }
  writeLocal('snapshots', keys.slice(0, 8))
  writeLocal(key, value)
  return value
}

export function getLessons(schedule: ScheduleData, weekday: number) {
  return schedule.lessons.filter((lesson) => lesson.weekday === weekday)
    .toSorted((a, b) => (a.time.start ?? '99:99').localeCompare(b.time.start ?? '99:99'))
}

export function dayLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(getLocale(), {
    weekday: 'long', day: 'numeric', month: 'long',
  })
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Не удалось получить данные.'
}
