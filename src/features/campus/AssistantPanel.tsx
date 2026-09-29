import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AppSection } from '../../shared/sections'
import { sections } from '../../shared/sections'
import { savedSelection } from '../schedule/data'
import type { CategoryId } from '../student-life/model'
import styles from './CampusDock.module.css'
import { quickReply } from './quick-replies'

interface Source {
  id: string
  title: string
  sourceName: string
  sourceUrl?: string
  section?: AppSection
}
interface Answer {
  answer: string
  sources: Source[]
  mode: 'generated' | 'grounded' | 'search' | 'no-match'
  excerpts?: string[]
}
interface Message {
  id: number
  question: string
  result?: Answer
  error?: string
}
const suggestions = [
  'Как найти аудиторию?', 'Где искать стажировку?',
  'Где посмотреть скидки?', 'Как получить баллы?',
]
function sectionLabel(source: Source) {
  if (source.id.startsWith('event-')) return 'Мероприятия'
  if (source.id.startsWith('news-')) return 'Новости'
  if (source.id.startsWith('life-club-')) return 'Клубы'
  if (source.id.startsWith('life-career-')) return 'Стажировки'
  if (source.id.startsWith('life-')) return 'Материалы'
  return sections.find((section) => section.id === source.section)?.label ?? 'Раздел'
}
function categoryForSource(source: Source): CategoryId | null {
  if (source.id.startsWith('event-')) return 'events'
  if (source.id.startsWith('news-')) return 'news'
  if (source.id.startsWith('life-club-')) return 'clubs'
  if (source.id.startsWith('life-career-')) return 'career'
  if (source.id.startsWith('life-')) return 'resources'
  return null
}

export function AssistantPanel() {
  const [query, setQuery] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [pending, setPending] = useState(false)
  const end = useRef<HTMLDivElement>(null)
  const sequence = useRef(0)
  const active = useRef<AbortController | null>(null)

  useEffect(() => () => active.current?.abort(), [])
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [messages])

  async function ask(question: string) {
    const text = question.trim().slice(0, 300)
    if (!text || active.current) return
    const id = ++sequence.current
    const instant = quickReply(text)
    if (instant) {
      setMessages((previous) => [...previous.slice(-9), { id, question: text, result: instant }])
      setQuery('')
      return
    }
    const controller = new AbortController()
    active.current = controller
    setMessages((previous) => [...previous.slice(-9), { id, question: text }])
    setQuery('')
    setPending(true)
    try {
      const response = await fetch('/api/assistant/ask', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text, preferredGroupId: savedSelection()?.id ?? null }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Помощник недоступен.')
      setMessages((previous) => previous.map((message) => message.id === id
        ? { ...message, result: data as Answer } : message))
    } catch (error) {
      if (!controller.signal.aborted) setMessages((previous) => previous.map((message) => message.id === id
        ? { ...message, error: error instanceof Error ? error.message : 'Нет связи с сервером.' } : message))
    } finally {
      if (!controller.signal.aborted) setPending(false)
      active.current = null
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void ask(query)
  }
  function go(section: AppSection, category: CategoryId | null = null) {
    window.dispatchEvent(new CustomEvent('assistant-navigate', {
      detail: category && section === 'student-life' ? { section, category } : section,
    }))
  }

  return (
    <div className={styles.panel}>
      <span className={styles.kicker}>Кампус на связи</span>
      <h3>Привет, я Карман.</h3>
      <p className={styles.note}>Помогу найти ответ в проверенных материалах и перейти в нужный раздел.</p>
      <div className={styles.suggestions}>
        {suggestions.map((question) => (
          <button key={question} type="button" disabled={pending} onClick={() => void ask(question)}>
            {question} ↗
          </button>
        ))}
      </div>
      <div className={styles.conversation} role="log" aria-label="Переписка с помощником" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id}>
            <p className={styles.question}>{message.question}</p>
            <div className={styles.answer}>
              {!message.result && !message.error && <p>Ищу в материалах…</p>}
              {message.error && <p role="alert">{message.error}</p>}
              {message.result && <>
                <span>{message.result.mode === 'generated' || message.result.mode === 'grounded' ? 'Ответ по материалам' :
                  message.result.mode === 'search' ? 'Найденные материалы' : 'Ответ не найден'}</span>
                <p className={styles.assistantText}>{message.result.answer}</p>
                {message.result.excerpts?.map((excerpt, index) => (
                  <p key={message.result?.sources[index]?.id ?? index}>{excerpt}</p>
                ))}
                {message.result.sources.length > 0 && <div className={styles.assistantSources}>
                  <strong>Источники и разделы</strong>
                  {message.result.sources.map((source) => <div key={source.id}>
                    {source.sourceUrl && <a href={source.sourceUrl} target="_blank" rel="noreferrer">
                      {source.title} · {source.sourceName} ↗
                    </a>}
                    {!source.sourceUrl && <span>{source.title}</span>}
                    {source.section && <button type="button" onClick={() => go(source.section!, categoryForSource(source))}>
                      {sectionLabel(source)} ↗
                    </button>}
                  </div>)}
                </div>}
              </>}
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form className={styles.askForm} onSubmit={submit}>
        <label className={styles.srOnly} htmlFor="campus-question">Вопрос помощнику</label>
        <input id="campus-question" maxLength={300} value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Спроси о студенческой жизни…" autoComplete="off" />
        <button className={styles.primary} disabled={!query.trim() || pending} type="submit"
          aria-label="Отправить вопрос">↑</button>
      </form>
      <small className={styles.note}>Ответы могут содержать ошибки — проверяй источники. Не отправляй пароли и личные данные.</small>
    </div>
  )
}
