import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { faqItems } from '../../src/features/student-life/faq-data.ts'
import { serviceKnowledge } from '../../src/features/services/knowledge.ts'
import { usefulPlaces, dormitories } from '../../src/features/navigation/routing.ts'
import { parseNewsPayload } from '../../src/features/student-life/news-client.ts'

const studentLifePath = fileURLToPath(new URL('../../src/features/student-life/student-life.json', import.meta.url))
const rootPath = fileURLToPath(new URL('../../', import.meta.url))

function latestNews(seed) {
  const file = resolve(process.env.NEWS_DATA_DIR ?? resolve(rootPath, '.runtime/news'), 'student-life.json')
  try {
    const payload = parseNewsPayload(JSON.parse(readFileSync(file, 'utf8')))
    if (payload && Date.parse(payload.newsFetchedAt) >= Date.parse(seed.newsFetchedAt)) return payload
  } catch { /* The bundled news remains available while the feed is being refreshed. */ }
  return { news: seed.news, newsFetchedAt: seed.newsFetchedAt }
}

// Only reviewed material enters the index. Forum posts and private account data are excluded.
const siteGuide = [
  {
    id: 'site-sections', title: 'Что есть на сайте PocketUUST?', section: 'home',
    text: 'Главная показывает разделы: Аудитории, Расписание, Студенческая жизнь, Сообщество, Сервисы, Форум и Баллы. Помощник Карман находится в нижнем правом углу.',
    keywords: ['сайт', 'разделы', 'главная', 'помощник', 'найти', 'как пользоваться'],
  },
  {
    id: 'site-navigation', title: 'Как найти аудиторию и построить маршрут?', section: 'navigation',
    text: 'Откройте «Аудитории» и введите начальную и конечную точки, например 1-203 и 6-401. Маршрут по корпусам Карла Маркса, 12 строит отдельный алгоритм; точное расположение дверей и лестниц без проверенных планов этажей неизвестно.',
    keywords: ['аудитория', 'кабинет', 'корпус', 'маршрут', 'навигатор', 'карта', 'дойти', 'пройти', 'добраться', 'попасть', 'идти'],
  },
  {
    id: 'site-schedule', title: 'Где посмотреть расписание?', section: 'schedule',
    text: 'Откройте «Расписание», выберите группу по названию или ID, затем нужный день или неделю. Помощник может запросить занятия по группе и дате из того же сервиса расписания УУНиТ.',
    keywords: ['расписание', 'пары', 'группа', 'занятия', 'сегодня', 'завтра'],
  },
  {
    id: 'site-life', title: 'Где найти студенческие материалы?', section: 'student-life',
    text: 'В «Студенческой жизни» есть новости, события, клубы, стажировки, полезные материалы и ответы на частые вопросы.',
    keywords: ['новости', 'события', 'клубы', 'стажировки', 'материалы', 'студенческая жизнь'],
  },
  {
    id: 'site-services', title: 'Где стипендия и контакты?', section: 'services',
    text: 'В «Сервисах» доступны справочные тарифы стипендии, контакты подразделений и поиск преподавателей. Результат калькулятора не является подтверждением назначенной выплаты.',
    keywords: ['сервисы', 'стипендия', 'контакты', 'преподаватели', 'калькулятор'],
  },
  {
    id: 'site-forum', title: 'Где задать вопрос студентам?', section: 'forum',
    text: 'Откройте «Форум», чтобы читать темы и обсуждать вопросы со студентами. Публикации участников не считаются проверенным источником ответов помощника.',
    keywords: ['форум', 'вопрос', 'обсуждение', 'тема', 'ответы', 'студенты'],
  },
  {
    id: 'site-community', title: 'Где объявления и отзывы?', section: 'community',
    text: 'Откройте «Сообщество», чтобы посмотреть студенческие объявления, отзывы о событиях и мемы. Часть материалов хранится только в текущем браузере.',
    keywords: ['сообщество', 'объявления', 'отзывы', 'мемы'],
  },
  {
    id: 'site-rewards', title: 'Как получить кампус-баллы и билеты?', section: 'points',
    text: 'В разделе «Баллы» показаны прогресс и рейтинг. Для кампус-баллов нужно войти в аккаунт PocketUUST. Первое открытие новости даёт +3 КБ, первое сохранение новости +1 КБ, новый маршрут +2 КБ (один раз за этот путь в день), завершение мини-игры +25 КБ (раз в день). Тема форума даёт 5 форумных баллов, ответ 2; после окончания месяца каждые 50 форумных баллов превращаются в билет. Выдача мерча и розыгрыш пока демонстрационные.',
    keywords: ['баллы', 'кампус', 'билеты', 'мерч', 'рейтинг', 'игра', 'награда', 'как получить'],
  },
]

export function knowledgeDocuments() {
  const content = JSON.parse(readFileSync(studentLifePath, 'utf8'))
  const feed = latestNews(content)
  return [
    ...siteGuide.map((entry) => ({ ...entry, sourceName: 'PocketUUST · раздел сайта' })),
    ...faqItems.map((entry) => ({
      id: `faq-${entry.id}`, title: entry.question, text: entry.answer,
      keywords: (entry.keywords ?? '').split(/\s+/).concat(entry.topic),
      sourceUrl: entry.source?.url,
      sourceName: entry.source?.label ?? 'PocketUUST · FAQ',
      section: 'student-life',
    })),
    ...[...content.resources, ...content.career, ...content.clubs].map((entry) => ({
      id: `life-${entry.id}`, title: entry.title,
      text: [entry.summary, ...(entry.steps ?? [])].filter(Boolean).join(' '),
      keywords: [entry.group, ...(entry.tags ?? [])],
      sourceUrl: entry.sourceUrl ?? undefined,
      sourceName: entry.sourceName ?? 'PocketUUST · студенческая жизнь',
      section: 'student-life',
    })),
    ...usefulPlaces.map((entry) => ({
      id: `place-${entry.id}`, title: entry.label,
      text: `${entry.detail}${entry.building ? `. Корпус ${entry.building}` : ''}${entry.floor ? `, этаж ${entry.floor}` : ''}.`,
      keywords: ['где', 'аудитории', 'помещение', 'навигация', entry.label],
      sourceUrl: entry.sourceUrl, sourceName: 'PocketUUST · аудитории', section: 'navigation',
    })),
    ...dormitories.map((entry) => ({
      id: `dorm-${entry.id}`, title: `Общежитие: ${entry.address}`,
      text: `Адрес общежития УУНиТ: ${entry.address}. Построить маршрут можно в разделе «Аудитории».`,
      keywords: ['общежитие', 'общага', 'адрес', 'маршрут', entry.address],
      sourceUrl: entry.sourceUrl, sourceName: 'PocketUUST · общежития', section: 'navigation',
    })),
    ...feed.news.filter((entry) => entry.publishedAt && entry.sourceUrl).map((entry) => ({
      id: `news-${entry.id}`, kind: 'news', title: entry.title,
      text: `Опубликовано: ${entry.publishedAt}. ${entry.summary}`,
      date: entry.publishedAt, fetchedAt: feed.newsFetchedAt,
      keywords: ['новости', 'события', 'последние новости', 'УУНиТ', entry.group, ...(entry.tags ?? [])],
      sourceUrl: entry.sourceUrl, sourceName: entry.sourceName, section: 'student-life',
    })),
    ...content.events.filter((entry) => entry.eventDate && entry.sourceUrl).map((entry) => ({
      id: `event-${entry.id}`, kind: 'event', title: entry.title,
      text: `Дата события: ${entry.eventDate}${entry.eventEndDate ? ` — ${entry.eventEndDate}` : ''}. ` +
        [entry.summary, entry.location, entry.dateNote].filter(Boolean).join(' '),
      date: entry.eventDate, endDate: entry.eventEndDate,
      keywords: ['события', 'мероприятия', 'ближайшие', 'афиша', 'УУНиТ', entry.group, ...(entry.tags ?? [])],
      sourceUrl: entry.sourceUrl, sourceName: entry.sourceName, section: 'student-life',
    })),
    ...serviceKnowledge.map((entry) => ({
      ...entry, id: `service-${entry.id}`, section: 'services',
    })),
  ]
}
