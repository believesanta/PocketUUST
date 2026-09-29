import { localize, t, getLocale } from '../../../shared/i18n/index.ts'
import { categories } from '../model'
import { ForumIcon } from './ForumIcon'
import { dateLabel, type Topic } from './types'
import s from './Forum.module.css'
export const categoryLabel = (id: string) => categories.find((x) => x.id === id)?.label ?? id
export function Avatar({ name, id, small = false }: { name: string; id: number; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`${s.avatar} ${small ? s.avatarSmall : ''}`}
      data-tone={id % 4}
    >
      {localize(name.trim().slice(0, 1).toUpperCase())}
    </span>
  )
}
export function TopicActions({
  topic,
  busy,
  onLike,
  onSave,
  onOpen,
  onDelete,
}: {
  topic: Topic
  busy: boolean
  onLike: () => void
  onSave: () => void
  onOpen?: () => void
  onDelete?: () => void
}) {
  return (
    <div className={s.actions}>
      <button
        type="button"
        className={s.action}
        aria-pressed={topic.liked}
        aria-label={localize(topic.liked ? 'Убрать лайк' : 'Нравится')}
        disabled={busy}
        onClick={onLike}
      >
        <ForumIcon name="heart" />
        <span>{localize(topic.likes)}</span>
      </button>
      {onOpen ? (
        <button type="button" className={s.action} onClick={onOpen} disabled={busy}>
          <ForumIcon name="chat" />
          <span>{t("Ответы · ")}{localize(topic.replies)}</span>
        </button>
      ) : (
        <span className={s.actionCount}>
          <ForumIcon name="chat" />
          {localize(topic.replies)}{t(" ответов ")}</span>
      )}
      <button
        type="button"
        className={`${s.action} ${s.save}`}
        aria-pressed={topic.saved}
        aria-label={localize(topic.saved ? 'Убрать из избранного' : 'В избранное')}
        disabled={busy}
        onClick={onSave}
      >
        <ForumIcon name="bookmark" />
        <span>{localize(topic.saved ? 'Сохранено' : 'Сохранить')}</span>
      </button>
      {topic.canDelete && onDelete && (
        <button
          type="button"
          className={`${s.action} ${s.delete}`}
          aria-label={t("Удалить публикацию")}
          title={t("Удалить свою публикацию")}
          disabled={busy}
          onClick={onDelete}
        >
          <ForumIcon name="trash" />
        </button>
      )}
    </div>
  )
}
export function TopicCard({
  topic,
  busy,
  onOpen,
  onLike,
  onSave,
  onDelete,
}: {
  topic: Topic
  busy: boolean
  onOpen: () => void
  onLike: () => void
  onSave: () => void
  onDelete: () => void
}) {
  return (
    <article className={s.card} aria-label={topic.title}>
      <div className={s.meta}>
        <span className={s.category} data-category={topic.category}>
          {localize(categoryLabel(topic.category))}
        </span>
        <span className={s.topicNumber}>#{localize(topic.id)}</span>
        <time dateTime={topic.createdAt} title={localize(new Date(topic.createdAt).toLocaleString(getLocale()))}>
          {localize(dateLabel(topic.createdAt))}
        </time>
      </div>
      <h3>
        <button type="button" onClick={onOpen} disabled={busy}>
          {topic.title}
        </button>
      </h3>
      <p className={s.preview}>{topic.body}</p>
      <div className={s.author}>
        <Avatar name={topic.author} id={topic.authorId} small />
        <span>{topic.author}</span>
        {topic.canDelete && <span className={s.you}>{t("вы")}</span>}
      </div>
      <TopicActions
        topic={topic}
        busy={busy}
        onLike={onLike}
        onSave={onSave}
        onOpen={onOpen}
        onDelete={onDelete}
      />
    </article>
  )
}
