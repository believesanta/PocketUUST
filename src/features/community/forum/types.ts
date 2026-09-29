import { getLocale } from '../../../shared/i18n/index.ts'
export interface Topic {
  id: number
  category: string
  title: string
  body: string
  author: string
  authorId: number
  createdAt: string
  replies: number
  likes: number
  liked: boolean
  saved: boolean
  canDelete: boolean
}
export interface Reply {
  id: number
  topicId: number
  body: string
  author: string
  authorId: number
  createdAt: string
  likes: number
  liked: boolean
  canDelete: boolean
  parent: { id: number; author: string | null; body: string | null; deleted: boolean } | null
}
export interface TopicPage {
  topics: Topic[]
  total: number
  hasMore: boolean
  nextBeforeId: number | null
  nextBeforeLikes: number | null
  categories: Record<string, number>
  stats: { topics: number; replies: number; authors: number }
}
export interface Detail {
  topic: Topic
  replies: Reply[]
  totalReplies: number
  hasMore: boolean
  nextBeforeReplyId: number | null
}
export const problem = (error: unknown) =>
  error instanceof Error ? error.message : 'Не удалось связаться с форумом. Попробуйте ещё раз.'
export const dateLabel = (date: string) =>
  new Date(date).toLocaleString(getLocale(), {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
