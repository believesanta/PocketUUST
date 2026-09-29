import { t, localize } from '../../../shared/i18n/index.ts'
import { useState, type FormEvent } from 'react'
import { api } from '../../campus/client'
import { categories } from '../model'
import { ForumIcon } from './ForumIcon'
import { problem, type Topic } from './types'
import s from './Forum.module.css'
export function Composer({
  initialCategory,
  onCreated,
  onClose,
}: {
  initialCategory: string
  onCreated: (topic: Topic) => void
  onClose: () => void
}) {
  const [title, setTitle] = useState(''),
    [body, setBody] = useState('')
  const [category, setCategory] = useState(initialCategory === 'all' ? 'study' : initialCategory)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const data = await api<{ topic: Topic }>('/api/campus/forum/topics', {
        method: 'POST',
        body: { title, body, category },
      })
      onCreated(data.topic)
    } catch (error) {
      setError(problem(error))
      setBusy(false)
    }
  }
  return (
    <section className={s.composer} aria-labelledby="compose-heading">
      <div className={s.panelHeading}>
        <div>
          <span className={s.eyebrow}>{t("ЕСТЬ ЧТО ОБСУДИТЬ?")}</span>
          <h2 id="compose-heading">{t("Новое обсуждение")}</h2>
        </div>
        <button
          className={s.iconButton}
          aria-label={t("Закрыть форму публикации")}
          disabled={busy}
          onClick={onClose}
        >
          <ForumIcon name="close" />
        </button>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="forum-category">{t("Тема разговора")}</label>
        <select
          id="forum-category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          disabled={busy}
        >
          {categories.map((x) => (
            <option key={x.id} value={x.id}>
              {localize(x.label)}
            </option>
          ))}
        </select>
        <label htmlFor="forum-title">{t("Заголовок")}</label>
        <input
          autoFocus
          id="forum-title"
          placeholder={t("С чего начнём?")}
          minLength={5}
          maxLength={120}
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          disabled={busy}
        />
        <label htmlFor="forum-body">{t("Подробности")}</label>
        <textarea
          id="forum-body"
          rows={6}
          placeholder={t("Задайте вопрос, поделитесь идеей или расскажите, что случилось…")}
          minLength={10}
          maxLength={4000}
          required
          value={body}
          onChange={(event) => setBody(event.target.value)}
          disabled={busy}
        />
        <div className={s.formFooter}>
          <span>{localize(body.length)}{t(" / 4000 · простой текст")}</span>
          <button
            className={s.primary}
            disabled={busy || title.trim().length < 5 || body.trim().length < 10}
          >
            {localize(busy ? 'Публикуем…' : 'Опубликовать')}
          </button>
        </div>
        {error && (
          <p className={s.error} role="alert">
            {localize(error)}
          </p>
        )}
      </form>
    </section>
  )
}
