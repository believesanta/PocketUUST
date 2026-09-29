export type AdKind = 'buy' | 'sell' | 'give'
export interface AdDraft {
  kind: string
  title: string
  description: string
  price: string
  pickup: string
  location: string
}
export interface Ad extends AdDraft {
  id: string
  createdAt: string
  demo?: boolean
}
export interface Review {
  id: string
  eventId: string
  stars: number
  comment: string
  createdAt: string
}
export interface MemeProposal {
  id: string
  text: string
  createdAt: string
}
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))
const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max
export function parseLocal<T>(raw: string | null, valid: (value: unknown) => boolean): T[] {
  try {
    const data: unknown = JSON.parse(raw || 'null')
    return record(data) && data.version === 1 && Array.isArray(data.items)
      ? (data.items.filter(valid).slice(0, 200) as T[])
      : []
  } catch {
    return []
  }
}
export function validateAd(ad: AdDraft): string {
  if (!['buy', 'sell', 'give'].includes(ad.kind)) return 'Выберите тип объявления.'
  if (ad.title.trim().length < 3 || ad.title.length > 80)
    return 'Название должно содержать от 3 до 80 символов.'
  if (ad.description.trim().length < 10 || ad.description.length > 700)
    return 'Добавьте описание от 10 до 700 символов.'
  if (
    !['dorm', 'address'].includes(ad.pickup) ||
    ad.location.trim().length < 3 ||
    ad.location.length > 120
  )
    return 'Укажите общежитие или адрес для самовывоза.'
  const amount = Number(ad.price)
  if (
    ad.kind !== 'give' &&
    (!ad.price.trim() || !Number.isFinite(amount) || amount < 1 || amount > 1000000)
  )
    return 'Укажите цену от 1 до 1 000 000 ₽.'
  return ''
}
export function validAd(value: unknown): boolean {
  return (
    record(value) &&
    text(value.id, 100) &&
    text(value.createdAt, 50) &&
    ['kind', 'title', 'description', 'price', 'pickup', 'location'].every(
      (key) => typeof value[key] === 'string',
    ) &&
    !validateAd(value as unknown as AdDraft)
  )
}
export function moderateText(value: string): string {
  const normalized = value.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е')
  if (normalized.length < 5 || normalized.length > 240) return 'Добавьте от 5 до 240 символов.'
  if (/(?:^|[^а-яa-z])(?:бля(?:д|т)|хуй|хуе|пизд|еба|ебл|сука|идиот|дебил|мразь)/u.test(normalized))
    return 'Уберите грубые слова и личные оскорбления.'
  return ''
}
export function validProposal(value: unknown): boolean {
  return (
    record(value) &&
    text(value.id, 100) &&
    text(value.createdAt, 50) &&
    typeof value.text === 'string' &&
    !moderateText(value.text)
  )
}
export function validReview(value: unknown): boolean {
  return (
    record(value) &&
    text(value.id, 100) &&
    text(value.eventId, 100) &&
    text(value.createdAt, 50) &&
    text(value.comment, 600) &&
    typeof value.stars === 'number' &&
    Number.isInteger(value.stars) &&
    value.stars >= 1 &&
    value.stars <= 5
  )
}
export function summarizeReviews(reviews: Array<{ stars: number }>): {
  count: number
  average: number | null
} {
  const valid = reviews.filter(
    (review) => Number.isInteger(review.stars) && review.stars >= 1 && review.stars <= 5,
  )
  return {
    count: valid.length,
    average: valid.length
      ? valid.reduce((total, review) => total + review.stars, 0) / valid.length
      : null,
  }
}
export const categories = [
  { id: 'study', label: 'Учёба' },
  { id: 'freshmen', label: 'Первокурсникам' },
  { id: 'dorms', label: 'Общежития' },
  { id: 'clubs', label: 'Кружки' },
  { id: 'career', label: 'Карьера' },
  { id: 'market', label: 'Барахолка' },
  { id: 'memes', label: 'Мемы' },
  { id: 'ideas', label: 'Идеи для вуза' },
]
