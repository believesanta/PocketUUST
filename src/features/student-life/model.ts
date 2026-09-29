export type CategoryId = 'news' | 'events' | 'clubs' | 'career' | 'resources'
export interface LifeItem {
  id: string
  title: string
  summary: string
  group: string
  tags: string[]
  sourceUrl: string | null
  sourceName: string
  checkedAt: string | null
  image: string | null
  imageAlt?: string
  imageKind?: string
  imageSourceUrl?: string | null
  socialUrl?: string | null
  publishedAt?: string | null
  eventDate?: string | null
  eventEndDate?: string | null
  location?: string
  dateNote?: string
  steps?: string[]
  links?: { label: string; url: string }[]
  conditions?: string
  document?: string
  readMinutes?: number
  editorial?: boolean
}
export interface Proposal { id: string; title: string; url: string; description: string; kind: string }
export const categories: { id: CategoryId; title: string; note: string }[] = [
  { id: 'news', title: 'Новости университета', note: 'Публикации УУНиТ и лента Google News. Импортированные заголовки требуют проверки редакцией.' },
  { id: 'events', title: 'Мероприятия', note: 'Лекции, конференции и конкурсы. В карточках различаем дату события и срок подачи заявки.' },
  { id: 'clubs', title: 'Клубы, сообщества', note: 'Найдите своих: творчество, спорт, наука и команды. Название ведёт в сообщество или на официальную страницу.' },
  { id: 'career', title: 'Карьера и возможности', note: 'Стажировки, олимпиады, хакатоны и обучение. Условия и ближайшие наборы — на сайтах организаторов.' },
  { id: 'resources', title: 'Полезные материалы', note: 'Практические инструкции, программы и льготы в Уфе. Скидки зависят от условий организации; подборка не исчерпывающая.' },
]
