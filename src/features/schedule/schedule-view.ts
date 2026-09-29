import { getLanguage, t } from '../../shared/i18n/index.ts'
import type { Configuration, Group, Lesson, Selection } from './data'

export function groupOptionLabel(group: Group) {
  return `${group.group_title}${group.filial_title ? ` · ${group.filial_title}` : ''} · ID ${group.group_id}`
}
export function resolveGroup(input: string, groups: Group[]): { selection?: Selection; error?: string } {
  const query = input.trim().toLocaleLowerCase('ru')
  if (!query) return { error: 'Введите название группы или её ID.' }
  const option = groups.find(group => groupOptionLabel(group).toLocaleLowerCase('ru') === query)
  const id = /^(?:id\s*)?(\d+)$/i.exec(query) ?? /(?:^|[·\s])id\s*(\d+)\s*$/i.exec(query)
  if (option) return { selection: { id: option.group_id, title: option.group_title } }
  if (id && Number.isSafeInteger(Number(id[1])) && Number(id[1]) > 0) {
    const known = groups.find(group => group.group_id === Number(id[1]))
    return { selection: { id: Number(id[1]), title: known?.group_title ?? `Группа № ${id[1]}` } }
  }
  const exact = groups.filter(group => group.group_title.toLocaleLowerCase('ru') === query)
  const matches = exact.length ? exact : groups.filter(group => group.group_title.toLocaleLowerCase('ru').includes(query))
  if (matches.length === 1) return { selection: { id: matches[0].group_id, title: matches[0].group_title } }
  return { error: matches.length > 1 ? 'Найдено несколько групп. Выберите свою в списке ниже.'
    : 'Группа не найдена. Уточните название или введите ID с сайта расписания.' }
}
export function weekDates(config: Pick<Configuration, 'first_week_monday'>, week: number) {
  const start = Date.parse(`${config.first_week_monday}T00:00:00Z`) + (week - 1) * 604800000
  return Array.from({ length: 7 }, (_, day) => ({ weekday: day + 1,
    date: new Date(start + day * 86400000).toISOString().slice(0, 10) }))
}
export function roomDestination(room: Pick<Lesson['room'], 'map_id' | 'title' | 'short_title' | 'building_title' | 'building_short_title'>): string | null {
  if (room.map_id) return /^[1-46-9]-[1-9]\d{2}$/.test(room.map_id) ? room.map_id : null
  // Other branches reuse building numbers; match the campus address as well.
  const address = room.building_title?.toLocaleLowerCase('ru') ?? ''
  if (!/уфа/.test(address) || !/(?:карла|к\.)\s*маркса\s*,?\s*12(?:\b|\/)/.test(address)) return null
  const building = /^корпус\s*([1-46-9])$/i.exec(room.building_short_title?.trim() ?? '')
  const number = (room.short_title ?? room.title)?.trim() ?? ''
  if (!building) return null
  const full = /^([1-46-9])-([1-9]\d{2})$/.exec(number)
  if (full) return full[1] === building[1] ? number : null
  return /^[1-9]\d{2}$/.test(number) ? `${building[1]}-${number}` : null
}
export function lessonPhase(lesson: Pick<Lesson, 'date' | 'time'>, timezone: string, now = Date.now()): 'current' | 'upcoming' | 'past' | null {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(now)).map(part => [part.type, part.value]))
  if (lesson.date !== `${parts.year}-${parts.month}-${parts.day}` || !lesson.time.start || !lesson.time.end) return null
  const time = `${parts.hour}:${parts.minute}`
  return time < lesson.time.start ? 'upcoming' : time < lesson.time.end ? 'current' : 'past'
}
export function timeMinutes(time: string | null) {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

export function countWord(count: number, forms: readonly [string, string, string]) {
  if (getLanguage() === 'en') return t(count === 1 ? forms[0] : forms[2])
  const remainder = count % 100
  return remainder >= 11 && remainder <= 14 ? forms[2] : count % 10 === 1 ? forms[0]
    : count % 10 >= 2 && count % 10 <= 4 ? forms[1] : forms[2]
}
