import { getLocale } from '../../shared/i18n/index.ts'
import data from './student-life.json'
import type { CategoryId, LifeItem } from './model'
export const content: Record<CategoryId, LifeItem[]> = { news: data.news, events: data.events, clubs: data.clubs, career: data.career, resources: data.resources }
const images = import.meta.glob<string>('./assets/*', { eager: true, query: '?url', import: 'default' })
export function imageUrl(path: string | null) {
  if(path && /^\/news-assets\/news-[a-f0-9]{16}\.(jpg|png|webp)$/.test(path))return path
  return path ? images[path] : undefined
}
export const interests = [...new Set(Object.values(content).flatMap(items => items.flatMap(item => item.tags)))].sort((a,b)=>a.localeCompare(b,'ru'))
export const catalogCheckedAt = () => new Intl.DateTimeFormat(getLocale(),{day:'numeric',month:'long',year:'numeric',timeZone:'Asia/Yekaterinburg'}).format(new Date(data.contentCheckedAt))
export const bundledNewsUpdatedAt = data.newsFetchedAt
