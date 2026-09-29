import { t, localize } from '../../../shared/i18n/index.ts'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, openCampus, type User } from '../../campus/client'
import { mergePage } from '../pagination'
import { ForumIcon } from './ForumIcon'
import { Avatar, categoryLabel, TopicActions } from './TopicCard'
import { ConfirmDelete } from './ConfirmDelete'
import { dateLabel, problem, type Detail, type Reply, type Topic } from './types'
import s from './Forum.module.css'
export function Thread({
  id,
  user,
  onBack,
  onChanged,
  onDeleted,
  onReward,
}: {
  id: number
  user: User | null
  onBack: () => void
  onChanged: (topic: Topic) => void
  onDeleted: () => void
  onReward: () => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null),
    [loading, setLoading] = useState(true)
  const [error, setError] = useState(''),
    [actionError, setActionError] = useState('')
  const [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [more, setMore] = useState(false)
  const [text, setText] = useState(''),
    [target, setTarget] = useState<Reply | null>(null)
  const [deleting, setDeleting] = useState<'topic' | Reply | null>(null)
  const input = useRef<HTMLTextAreaElement>(null),
    heading = useRef<HTMLHeadingElement>(null)
  const alive = useRef(true),
    generation = useRef(0),
    locked = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    const version = ++generation.current
    setLoading(true)
    setError('')
    api<Detail>(`/api/campus/forum/topics/${id}`)
      .then((data) => {
        if (alive.current && version === generation.current) {
          setDetail(data)
          requestAnimationFrame(() => heading.current?.focus())
        }
      })
      .catch((error) => {
        if (alive.current && version === generation.current) setError(problem(error))
      })
      .finally(() => {
        if (alive.current && version === generation.current) setLoading(false)
      })
    return () => {
      generation.current++
    }
  }, [id, revision])
  function changed(topic: Topic) {
    setDetail((current) => (current ? { ...current, topic, totalReplies: topic.replies } : current))
    onChanged(topic)
  }
  function requireUser() {
    if (!user) {
      openCampus('account')
      return false
    }
    return true
  }
  async function action(operation: () => Promise<void>) {
    if (!requireUser() || locked.current) return
    locked.current = true
    setBusy(true)
    setActionError('')
    try {
      await operation()
    } catch (error) {
      if (alive.current) setActionError(problem(error))
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
    }
  }
  async function topicAction(kind: 'like' | 'bookmark') {
    if (!detail) return
    const topic = detail.topic
    await action(async () => {
      const data = await api<{ topic: Topic }>(`/api/campus/forum/topics/${id}/${kind}`, {
        method: 'POST',
        body: kind === 'like' ? { liked: !topic.liked } : { saved: !topic.saved },
      })
      if (alive.current) changed(data.topic)
    })
  }
  async function replyLike(reply: Reply) {
    await action(async () => {
      const data = await api<{ reply: Reply }>(`/api/campus/forum/replies/${reply.id}/like`, {
        method: 'POST',
        body: { liked: !reply.liked },
      })
      if (alive.current)
        setDetail((current) =>
          current
            ? {
                ...current,
                replies: current.replies.map((item) => (item.id === reply.id ? data.reply : item)),
              }
            : current,
        )
    })
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    await action(async () => {
      const data = await api<{ reply: Reply; topic: Topic }>(
        `/api/campus/forum/topics/${id}/replies`,
        {
          method: 'POST',
          body: { body: text, parentId: target?.id ?? null },
        },
      )
      if (!alive.current) return
      setDetail((current) => {
        if (!current) return current
        return {
          ...current,
          replies: mergePage(current.replies, [data.reply], 'append'),
          topic: data.topic,
          totalReplies: data.topic.replies,
        }
      })
      onChanged(data.topic)
      setText('')
      setTarget(null)
      onReward()
      requestAnimationFrame(() =>
        document
          .getElementById(`reply-${data.reply.id}`)
          ?.scrollIntoView({ block: 'center', behavior: 'smooth' }),
      )
    })
  }
  async function loadEarlier() {
    if (!detail?.hasMore || more) return
    const version = generation.current
    setMore(true)
    setActionError('')
    try {
      const data = await api<Detail>(
        `/api/campus/forum/topics/${id}?beforeReplyId=${detail.nextBeforeReplyId}`,
      )
      if (alive.current && version === generation.current)
        setDetail((current) =>
          current
            ? {
                ...current,
                replies: mergePage(current.replies, data.replies, 'prepend'),
                hasMore: data.hasMore,
                nextBeforeReplyId: data.nextBeforeReplyId,
              }
            : current,
        )
    } catch (error) {
      if (alive.current) setActionError(problem(error))
    } finally {
      if (alive.current) setMore(false)
    }
  }
  async function remove() {
    if (!deleting || !detail) return
    const isTopic = deleting === 'topic',
      itemId = isTopic ? id : deleting.id
    const result = await api<{ topic?: Topic }>(
      `/api/campus/forum/${isTopic ? 'topics' : 'replies'}/${itemId}/delete`,
      {
        method: 'POST',
        body: {},
      },
    )
    if (!alive.current) return
    if (isTopic) {
      onDeleted()
      return
    }
    const topic = result.topic ?? { ...detail.topic, replies: detail.topic.replies - 1 }
    setDetail((current) =>
      current
        ? {
            ...current,
            topic,
            totalReplies: topic.replies,
            replies: current.replies
              .filter((x) => x.id !== itemId)
              .map((x) =>
                x.parent?.id === itemId
                  ? { ...x, parent: { id: itemId, deleted: true, author: null, body: null } }
                  : x,
              ),
          }
        : current,
    )
    if (target?.id === itemId) setTarget(null)
    onChanged(topic)
  }
  return (
    <section className={s.thread} aria-label={t("Обсуждение")}>
      <div className={s.threadNavigation}>
        <button className={s.back} disabled={busy || more} onClick={onBack}>
          <ForumIcon name="arrow" />{t("К обсуждениям ")}</button>
        <button
          className={s.iconButton}
          aria-label={t("Обновить обсуждение")}
          disabled={loading || busy || more}
          onClick={() => setRevision((n) => n + 1)}
        >
          <ForumIcon name="refresh" />
        </button>
      </div>
      {loading ? (
        <div className={s.empty} role="status">{t("Загружаем разговор… ")}</div>
      ) : error ? (
        <div className={s.empty}>
          <p role="alert">{localize(error)}</p>
          <button onClick={() => setRevision((n) => n + 1)}>{t("Попробовать ещё раз")}</button>
        </div>
      ) : (
        detail && (
          <>
            <article className={s.post}>
              <div className={s.meta}>
                <span className={s.category} data-category={detail.topic.category}>
                  {localize(categoryLabel(detail.topic.category))}
                </span>
                <span className={s.topicNumber}>{t("Обсуждение #")}{localize(id)}</span>
              </div>
              <h2 ref={heading} tabIndex={-1}>
                {detail.topic.title}
              </h2>
              <div className={s.author}>
                <Avatar name={detail.topic.author} id={detail.topic.authorId} />
                <div>
                  <strong>
                    {detail.topic.author}
                    {localize(detail.topic.canDelete ? ' · вы' : '')}
                  </strong>
                  <time dateTime={detail.topic.createdAt}>{localize(dateLabel(detail.topic.createdAt))}</time>
                </div>
              </div>
              <p className={s.postBody}>{detail.topic.body}</p>
              <TopicActions
                topic={detail.topic}
                busy={busy || more}
                onLike={() => void topicAction('like')}
                onSave={() => void topicAction('bookmark')}
                onDelete={() => setDeleting('topic')}
              />
            </article>
            <div className={s.replyHeading}>
              <h3>{t("Разговор ")}<span>{localize(detail.totalReplies)}</span>
              </h3>
              <span>{t("По времени публикации")}</span>
            </div>
            {actionError && (
              <p className={s.error} role="alert">
                {localize(actionError)}
              </p>
            )}
            {detail.hasMore && (
              <button
                className={s.loadMore}
                disabled={more || busy}
                onClick={() => void loadEarlier()}
              >
                {localize(more ? 'Загружаем…' : 'Показать предыдущие ответы')}
              </button>
            )}
            <div className={s.replies}>
              {detail.replies.map((reply) => (
                <article
                  id={`reply-${reply.id}`}
                  key={reply.id}
                  className={s.replyCard}
                  aria-label={`Ответ ${reply.author}`}
                >
                  <div className={s.replyTop}>
                    <Avatar name={reply.author} id={reply.authorId} />
                    <strong>{reply.author}</strong>
                    {reply.authorId === detail.topic.authorId && (
                      <span className={s.you}>{t("автор")}</span>
                    )}
                    <time dateTime={reply.createdAt}>{localize(dateLabel(reply.createdAt))}</time>
                  </div>
                  {reply.parent && (
                    <blockquote className={s.quote}>
                      <ForumIcon name="reply" size={15} />
                      <div>
                        {reply.parent.deleted ? (
                          'Исходный ответ удалён'
                        ) : (
                          <>
                            <strong>{localize(reply.parent.author)}</strong>
                            <span>{localize(reply.parent.body)}</span>
                          </>
                        )}
                      </div>
                    </blockquote>
                  )}
                  <p className={s.replyBody}>{reply.body}</p>
                  <div className={s.actions}>
                    <button
                      className={s.action}
                      aria-label={localize(reply.liked ? 'Убрать лайк ответа' : 'Нравится ответ')}
                      aria-pressed={reply.liked}
                      disabled={busy || more}
                      onClick={() => void replyLike(reply)}
                    >
                      <ForumIcon name="heart" size={16} />
                      {localize(reply.likes)}
                    </button>
                    <button
                      className={s.action}
                      disabled={busy || more}
                      onClick={() => {
                        if (!requireUser()) return
                        setTarget(reply)
                        input.current?.focus()
                        input.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                      }}
                    >
                      <ForumIcon name="reply" size={16} />{t("Ответить ")}</button>
                    {reply.canDelete && (
                      <button
                        className={`${s.action} ${s.delete}`}
                        disabled={busy || more}
                        aria-label={t("Удалить свой ответ")}
                        onClick={() => setDeleting(reply)}
                      >
                        <ForumIcon name="trash" size={16} />
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
            {detail.totalReplies === 0 && (
              <div className={s.firstReply}>
                <ForumIcon name="chat" size={26} />
                <p>{t("Пока тихо. Ваш ответ может начать хороший разговор.")}</p>
              </div>
            )}
            <div className={s.replyForm}>
              {user ? (
                <form onSubmit={submit}>
                  <label htmlFor="forum-reply">
                    {localize(target ? `Ответ для ${target.author}` : 'Добавить ответ')}
                  </label>
                  {target && (
                    <div className={s.replyTarget}>
                      <span>{localize(target.body.slice(0, 140))}</span>
                      <button
                        type="button"
                        className={s.iconButton}
                        aria-label={t("Отменить ответ участнику")}
                        disabled={busy}
                        onClick={() => setTarget(null)}
                      >
                        <ForumIcon name="close" size={16} />
                      </button>
                    </div>
                  )}
                  <textarea
                    id="forum-reply"
                    ref={input}
                    rows={4}
                    minLength={3}
                    maxLength={3000}
                    required
                    placeholder={t("Помогите советом или поделитесь своим опытом…")}
                    value={text}
                    onChange={(event) => setText(event.target.value)}
                    disabled={busy}
                  />
                  <div className={s.formFooter}>
                    <span>{localize(text.length)} / 3000</span>
                    <button className={s.primary} disabled={busy || more || text.trim().length < 3}>
                      {localize(busy ? 'Подождите…' : 'Отправить ответ')}
                    </button>
                  </div>
                </form>
              ) : (
                <div className={s.loginPrompt}>
                  <div>
                    <strong>{t("Присоединяйтесь к разговору")}</strong>
                    <p>{t("Войдите, чтобы отвечать, ставить лайки и сохранять обсуждения.")}</p>
                  </div>
                  <button className={s.primary} onClick={() => openCampus('account')}>{t("Войти ")}</button>
                </div>
              )}
            </div>
          </>
        )
      )}
      {deleting && (
        <ConfirmDelete
          reply={deleting !== 'topic'}
          onClose={() => setDeleting(null)}
          onDelete={remove}
        />
      )}
    </section>
  )
}
