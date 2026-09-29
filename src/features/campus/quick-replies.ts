import type { AppSection } from '../../shared/sections'

interface Reply {
  answer: string
  sources: { id: string; title: string; sourceName: string; section: AppSection }[]
  mode: 'grounded'
}

const reply = (answer: string, section?: AppSection, id = 'quick-reply'): Reply => ({
  answer, mode: 'grounded',
  sources: section ? [{ id, title: section === 'navigation' ? 'Аудитории' : section === 'points' ? 'Баллы' : 'Студенческая жизнь',
    sourceName: 'PocketUUST', section }] : [],
})

const preset: Record<string, Reply> = {
  'как найти аудиторию': reply('Открой «Аудитории», укажи начальную точку и номер нужной аудитории, например 1-203. Сайт построит маршрут по доступной схеме корпусов.', 'navigation'),
  'где искать стажировку': reply('Открой «Студенческую жизнь» → «Стажировки». Там собраны проверенные варианты и советы, как проверить предложение.', 'student-life', 'life-career-shortcut'),
  'где посмотреть скидки': reply('Открой «Студенческую жизнь» → «Материалы» и введи «скидка» в поиске. Перед покупкой проверь условия и срок действия предложения.', 'student-life', 'life-resource-shortcut'),
  'как получить баллы': reply('Открой «Баллы» и войди в аккаунт. За первое открытие новости дают 3 КБ, за первое сохранение — 1 КБ, за новый маршрут — 2 КБ раз в день для этого пути, за мини-игру — 25 КБ раз в день.', 'points'),
}

const hello = reply('Привет! Я Карман, помощник PocketUUST. Подскажу, где найти нужное на сайте, и покажу расписание по группе и дате.')
const wellbeing = reply('Спасибо, всё хорошо! Готов помочь с расписанием, навигацией по сайту и студенческими вопросами.')
const identity = reply('Я Карман — помощник PocketUUST. Помогаю искать материалы и разделы сайта, а расписание беру из общего сервиса по группе и дате.')
const greetingWords = new Set('привет приветик приветствую здравствуй здравствуйте здрасьте салют хай hello hi здорово добрый доброе добрая доброго день вечер утро карман'.split(' '))
const politeWords = new Set('а ну ты вы мне меня пожалуйста скажи подскажи ответь можешь могли бы и или вообще просто слушай эй'.split(' '))
const identityWords = new Set('кто что ты вы тебя вас такой такая такое это как зовут имя твое твоя ваше ваш представься расскажи рассказать о себе бот человек помощник чем умеешь можешь помогаешь помочь делаешь занимаешься зачем здесь тут нужен нужна для чего создан создана работаешь'.split(' '))
const wellbeingWords = new Set('как у тебя ваши твои вас дела настроение жизнь поживаешь живешь ты поживаете все нормально хорошо'.split(' '))

function only(words: string[], ...sets: Set<string>[]) {
  return words.every((word) => sets.some((set) => set.has(word)))
}

export function quickReply(question: string): Reply | null {
  const clean = question.toLocaleLowerCase('ru').replace(/ё/g, 'е')
    .match(/[a-zа-я0-9]+/g)?.join(' ') ?? ''
  if (preset[clean]) return preset[clean]
  const words = clean.split(' ')
  if (!clean || words.length > 12) return null
  const has = (word: string) => words.includes(word)
  const who = has('кто') && (has('ты') || has('вы') || has('это') || has('бот'))
  const named = has('зовут') && (has('тебя') || has('вас') || has('ты'))
  const self = has('себе') && (has('расскажи') || has('рассказать'))
  const abilities = (has('умеешь') || has('можешь') || has('помогаешь')) && (has('что') || has('чем'))
  const nature = (has('бот') && has('человек')) || (has('что') && has('ты') && has('такое'))
  const purpose = has('зачем') && (has('ты') || has('вы')) && (has('здесь') || has('тут'))
  if ((who || named || self || abilities || nature || purpose || has('представься'))
      && only(words, greetingWords, politeWords, identityWords)) return identity
  const how = has('как') && (has('дела') || has('поживаешь') || has('поживаете') || has('настроение') || (has('ты') && words.length <= 3))
  if (how && only(words, greetingWords, politeWords, wellbeingWords)) return wellbeing
  if (words.some((word) => greetingWords.has(word)) && only(words, greetingWords, politeWords)) return hello
  return null
}
