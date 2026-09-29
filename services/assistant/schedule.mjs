import { calendar } from '../schedule/settings.mjs'

const scheduleSource = [{ id: 'schedule-live', title: 'Расписание группы', section: 'schedule', sourceName: 'Сервис расписания УУНиТ', sourceUrl: 'https://schedule.uust.ru/' }]
const normalized = (value) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^a-zа-я0-9]/g, '')
const dayNames = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

export function wantsSchedule(question) {
  return /расписани|(?<![\p{L}])пар[аыуе]?(?![\p{L}])|заняти[яйе]?|какие предметы|во сколько.*(пар|заняти)/iu.test(question)
}

function requestedDate(question, today) {
  const lower = question.toLocaleLowerCase('ru').replace(/ё/g, 'е')
  const date = new Date(`${today}T12:00:00Z`)
  if (/послезавтра/.test(lower)) date.setUTCDate(date.getUTCDate() + 2)
  else if (/завтра/.test(lower)) date.setUTCDate(date.getUTCDate() + 1)
  else {
    const explicit = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(lower)
    if (explicit) {
      const value = `${explicit[1]}-${explicit[2]}-${explicit[3]}`
      if (!Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value) return value
    }
    const weekday = dayNames.findIndex((name, index) => index > 0 && lower.includes(name.slice(0, -2)))
    if (weekday > 0) {
      const offset = (weekday - date.getUTCDay() + 7) % 7
      date.setUTCDate(date.getUTCDate() + offset)
    }
  }
  return date.toISOString().slice(0, 10)
}

const result = (answer) => ({ answer, sources: scheduleSource, mode: 'grounded' })

export async function scheduleAnswer(question, scheduleService, preferredGroupId) {
  if (!scheduleService) return result('Сервис расписания пока недоступен. Попробуйте открыть раздел «Расписание».')
  const config = calendar(scheduleService.settings, scheduleService.now())
  const lower = question.toLocaleLowerCase('ru').replace(/ё/g, 'е')
  const isWeek = /недел|расписани/.test(lower)
    && !/сегодня|завтра|послезавтра|\d{4}-\d{2}-\d{2}|понедельн|вторник|сред|четверг|пятниц|суббот|воскресен/.test(lower)
  const date = requestedDate(question, config.today)
  const targetDate = isWeek && /следующ[^\s]*\s+недел/.test(lower)
    ? new Date(Date.parse(`${date}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10) : date
  const number = /(?:(?<![\p{L}])(?:id|ид)\s*[:№#-]?\s*|№\s*)(\d{2,8})(?!\d)/iu.exec(question)
  const standalone = !/\d{4}-\d{2}-\d{2}/.test(question) && /(?<!\d)\d{4,8}(?!\d)/.exec(question)
  const explicitId = number ? Number(number[1]) : standalone ? Number(standalone[0]) : null
  let groups = scheduleService.availableGroups().groups
  if (!groups.length) {
    await scheduleService.snapshot({ kind: 'groups' }, { priority: true })
    groups = scheduleService.availableGroups().groups
  }
  const key = normalized(question)
  const named = groups.filter((group) => {
    const title = normalized(group.group_title)
    return title.length >= 5 && key.includes(title)
  })
  const candidates = explicitId ? groups.filter((group) => group.group_id === explicitId) : named
  if (candidates.length > 1) return result(`Нашлось несколько групп: ${candidates.slice(0, 5).map((group) => `${group.group_title} (ID ${group.group_id})`).join(', ')}. Уточните ID группы.`)
  const preferred = Number.isSafeInteger(preferredGroupId) && preferredGroupId > 0
    ? groups.find((group) => group.group_id === preferredGroupId) : null
  const groupMention = /[а-яa-z]{2,}[-\s]*\d{2,}[-\s]*[а-яa-z]?/iu.test(question)
  const group = candidates[0] ?? (!explicitId && !groupMention ? preferred : null)
  if (!group) return result(explicitId ? `Группа с ID ${explicitId} не найдена в каталоге. Проверьте номер в разделе «Расписание».`
    : 'Укажите название или ID группы, например «пары завтра у ТОП-107Б», либо выберите свою группу в разделе «Расписание».')
  const start = Date.parse(`${config.first_week_monday}T00:00:00Z`)
  const week = Math.floor((Date.parse(`${targetDate}T00:00:00Z`) - start) / 604800000) + 1
  if (week < 1 || week > 53) return result('Эта дата вне настроенного учебного периода. Выберите дату в разделе «Расписание».')
  const data = await scheduleService.schedule('group', group.group_id, config.period_id, week)
  const lessons = data.lessons.filter((lesson) => isWeek || lesson.date === date)
    .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '') || (a.time?.start ?? '99:99').localeCompare(b.time?.start ?? '99:99'))
  const heading = isWeek ? `${group.group_title} · ${data.week_start} — ${data.week_end}`
    : `${group.group_title} · ${new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { timeZone: config.timezone, weekday: 'long', day: 'numeric', month: 'long' })}`
  const lines = lessons.map((lesson) => {
    const time = [lesson.time?.start, lesson.time?.end].filter(Boolean).join('–')
    return `• ${isWeek ? `${lesson.date} · ` : ''}${time ? `${time} · ` : ''}${lesson.subject}${lesson.lesson_type ? ` (${lesson.lesson_type})` : ''}${lesson.room?.title ? ` · ауд. ${lesson.room.title}` : ''}${lesson.teacher?.name ? ` · ${lesson.teacher.name}` : ''}`
  })
  const fresh = data.stale || data.offline || data.refresh_error ? `\nПоказана сохранённая копия от ${data.fetched_at ?? 'неизвестной даты'}; проверьте обновления.` : ''
  const unknown = data.undated_count ? '\nЕсть занятия без указанной даты — проверьте их в разделе «Расписание».' : ''
  return result(`${heading}:\n${lines.length ? lines.join('\n') : isWeek ? 'На эту неделю пар в загруженном расписании нет.' : 'На этот день пар в загруженном расписании нет.'}${fresh}${unknown}`)
}
