import { t, localize } from '../../shared/i18n/index.ts'
import { useEffect, useRef, useState } from 'react'
import { api, openCampus, useCampus, type User, type Wallet } from '../campus/client'
import { categories } from './model'
import { mergePage } from './pagination'
import { ForumIcon, type IconName } from './forum/ForumIcon'
import { TopicCard, Avatar } from './forum/TopicCard'
import { Thread } from './forum/Thread'
import { Composer } from './forum/Composer'
import { ConfirmDelete } from './forum/ConfirmDelete'
import { problem, type Topic, type TopicPage } from './forum/types'
import s from './forum/Forum.module.css'

const scopes: Array<{ id: 'all' | 'mine' | 'saved'; label: string; icon: IconName }> = [
  { id: 'all', label: 'Все обсуждения', icon: 'chat' },
  { id: 'mine', label: 'Мои публикации', icon: 'user' },
  { id: 'saved', label: 'Избранное', icon: 'bookmark' },
]
export function Forum() {
  const { user, wallet, refresh, loading } = useCampus()
  // A changed account gets fresh personal flags and drafts, never the previous user's state.
  if (loading) return <p role="status">{t("Открываем форум…")}</p>
  return (
    <ForumView
      key={user?.id ?? 'guest'}
      user={user}
      wallet={wallet}
      onReward={() => void refresh()}
    />
  )
}
function ForumView({
  user,
  wallet,
  onReward,
}: {
  user: User | null
  wallet: Wallet | null
  onReward: () => void
}) {
  const [scope, setScope] = useState<'all' | 'mine' | 'saved'>('all')
  const [category, setCategory] = useState('all'),
    [sort, setSort] = useState('new')
  const [query, setQuery] = useState(''),
    [search, setSearch] = useState('')
  const [page, setPage] = useState<TopicPage | null>(null),
    [loading, setLoading] = useState(true)
  const [error, setError] = useState(''),
    [actionError, setActionError] = useState(''),
    [notice, setNotice] = useState('')
  const [revision, setRevision] = useState(0),
    [more, setMore] = useState(false),
    [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<number | null>(null),
    [composer, setComposer] = useState(false)
  const [deleting, setDeleting] = useState<Topic | null>(null)
  const generation = useRef(0),
    alive = useRef(true),
    locked = useRef(false),
    listTop = useRef<HTMLDivElement>(null)
  const previousScroll = useRef(0)
  const params = new URLSearchParams({ scope, category, sort, q: search, limit: '20' }).toString()
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])
  useEffect(() => {
    const version = ++generation.current
    setLoading(true)
    setError('')
    setMore(false)
    api<TopicPage>(`/api/campus/forum/topics?${params}`)
      .then((data) => {
        if (alive.current && version === generation.current) setPage(data)
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
  }, [params, revision])
  function requireUser() {
    if (!user) {
      openCampus('account')
      return false
    }
    return true
  }
  function startComposer() {
    if (requireUser()) {
      setSelected(null)
      setComposer(true)
      setNotice('')
      requestAnimationFrame(() =>
        listTop.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }),
      )
    }
  }
  function openTopic(topic: Topic) {
    previousScroll.current = window.scrollY
    setSelected(topic.id)
    setNotice('')
    requestAnimationFrame(() => listTop.current?.scrollIntoView({ block: 'start' }))
  }
  function back() {
    setSelected(null)
    requestAnimationFrame(() => {
      listTop.current?.focus({ preventScroll: true })
      window.scrollTo({ top: previousScroll.current })
    })
  }
  function changed(topic: Topic) {
    // Refill filtered feeds when a thread becomes visible again after an action.
    if (
      (scope === 'saved' && topic.saved && !page?.topics.some((x) => x.id === topic.id)) ||
      sort === 'unanswered'
    )
      setRevision((n) => n + 1)
    setPage((current) => {
      if (!current) return current
      const previous = current.topics.find((x) => x.id === topic.id)
      const removed =
        scope === 'saved' && !topic.saved && current.topics.some((x) => x.id === topic.id)
      return {
        ...current,
        topics: removed
          ? current.topics.filter((x) => x.id !== topic.id)
          : current.topics.map((x) => (x.id === topic.id ? topic : x)),
        total: current.total - (removed ? 1 : 0),
        stats: {
          ...current.stats,
          replies: current.stats.replies + (previous ? topic.replies - previous.replies : 0),
        },
      }
    })
  }
  async function interact(topic: Topic, kind: 'like' | 'bookmark') {
    if (!requireUser() || locked.current) return
    const version = generation.current
    locked.current = true
    setBusy(true)
    setActionError('')
    setNotice('')
    try {
      const data = await api<{ topic: Topic }>(`/api/campus/forum/topics/${topic.id}/${kind}`, {
        method: 'POST',
        body: kind === 'like' ? { liked: !topic.liked } : { saved: !topic.saved },
      })
      if (alive.current) {
        if (version === generation.current) changed(data.topic)
        else setRevision((n) => n + 1)
      }
    } catch (error) {
      if (alive.current) setActionError(problem(error))
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
    }
  }
  async function loadMore() {
    if (!page?.hasMore || more || loading) return
    const version = generation.current
    setMore(true)
    setActionError('')
    const cursor = new URLSearchParams({ beforeId: String(page.nextBeforeId) })
    if (page.nextBeforeLikes !== null) cursor.set('beforeLikes', String(page.nextBeforeLikes))
    try {
      const data = await api<TopicPage>(`/api/campus/forum/topics?${params}&${cursor}`)
      if (alive.current && version === generation.current)
        setPage((current) =>
          current ? { ...data, topics: mergePage(current.topics, data.topics, 'append') } : data,
        )
    } catch (error) {
      if (alive.current && version === generation.current) setActionError(problem(error))
    } finally {
      if (alive.current && version === generation.current) setMore(false)
    }
  }
  function deleted() {
    setSelected(null)
    setRevision((n) => n + 1)
    setNotice('Обсуждение удалено.')
    requestAnimationFrame(() => listTop.current?.focus())
  }
  const filtered = category !== 'all' || search !== '' || sort !== 'new'
  return (
    <div className={s.forum}>
      <header className={s.hero}>
        <div>
          <span className={s.eyebrow}>
            <span className={s.liveDot} />{t(" СООБЩЕСТВО POCKETUUST ")}</span>
          <h1>{t("Свои люди. ")}<br />
            <span>{t("Любые вопросы.")}</span>
          </h1>
          <p>{t("Советы перед сессией, идеи после пар. ")}<br />{t("Место, где студенты помогают студентам. ")}</p>
          <button className={s.primary} onClick={startComposer}>
            <ForumIcon name="plus" />{t("Новое обсуждение ")}</button>
        </div>
        <div className={s.heroAside}>
          <div className={s.chatArt} aria-hidden="true">
            <div className={s.artBubble}>
              <ForumIcon name="chat" size={58} />
              <span>{t("есть вопрос?")}</span>
            </div>
            <div className={s.artAnswer}>
              <ForumIcon name="spark" size={22} />{t(" есть свои. ")}</div>
          </div>
          <div className={s.stats}>
            <div>
              <strong>{localize(page?.stats.topics ?? '—')}</strong>
              <span>{t("обсуждений")}</span>
            </div>
            <div>
              <strong>{localize(page?.stats.replies ?? '—')}</strong>
              <span>{t("ответов")}</span>
            </div>
            <div>
              <strong>{localize(page?.stats.authors ?? '—')}</strong>
              <span>{t("участников")}</span>
            </div>
          </div>
        </div>
      </header>
      <div className={s.layout}>
        <aside className={s.sidebar} aria-label={t("Категории форума")}>
          <h2 className={s.sideLabel}>{t("ТЕМЫ РАЗГОВОРА")}</h2>
          <div className={s.categories}>
            <button
              aria-pressed={category === 'all'}
              onClick={() => {
                setCategory('all')
                setSelected(null)
              }}
            >
              <ForumIcon name="grid" size={17} />
              <span>{t("Все темы")}</span>
              <small>{localize(page?.stats.topics ?? '—')}</small>
            </button>
            {categories.map((item) => (
              <button
                key={item.id}
                aria-pressed={category === item.id}
                onClick={() => {
                  setCategory(item.id)
                  setSelected(null)
                }}
              >
                <span className={s.categoryDot} data-category={item.id} />
                <span>{localize(item.label)}</span>
                <small>{localize(page?.categories[item.id] ?? 0)}</small>
              </button>
            ))}
          </div>
          <div className={s.sideNote}>
            <span className={s.noteIcon}>
              <ForumIcon name="spark" size={21} />
            </span>
            <h3>{t("Хороший разговор ")}<br />{t("начинается с вас ")}</h3>
            <p>{t("Помогайте по делу, уважайте друг друга и не публикуйте чужие личные данные.")}</p>
            <div className={s.noteRule} />
            <strong>{t("Ваш вклад замечают")}</strong>
            <p>{t("До 3 тем по 5 баллов и до 10 ответов по 2 балла в день.")}</p>
            {user && (
              <div className={s.points}>
                <span>{t("За этот месяц")}</span>
                <strong>{localize(wallet?.forumPoints ?? 0)}{t(" баллов")}</strong>
              </div>
            )}
          </div>
          {!user && (
            <button className={s.join} onClick={() => openCampus('account', 'login')}>{t("Войти в сообщество ")}<span>↗</span>
            </button>
          )}
        </aside>
        <div className={s.main} ref={listTop} tabIndex={-1}>
          {selected !== null ? (
            <Thread
              key={selected}
              id={selected}
              user={user}
              onBack={back}
              onChanged={changed}
              onDeleted={deleted}
              onReward={onReward}
            />
          ) : (
            <>
              <nav className={s.tabs} aria-label={t("Ленты форума")}>
                {scopes.map((item) => (
                  <button
                    key={item.id}
                    aria-pressed={scope === item.id}
                    onClick={() => {
                      if (item.id !== 'all' && !requireUser()) return
                      setScope(item.id)
                      setNotice('')
                      setActionError('')
                    }}
                  >
                    <ForumIcon name={item.icon} size={17} />
                    <span>{localize(item.label)}</span>
                  </button>
                ))}
              </nav>
              {composer ? (
                <Composer
                  initialCategory={category}
                  onClose={() => setComposer(false)}
                  onCreated={(topic) => {
                    setComposer(false)
                    setSelected(topic.id)
                    setRevision((n) => n + 1)
                    onReward()
                  }}
                />
              ) : (
                <button className={s.composePrompt} onClick={startComposer}>
                  <Avatar name={user?.name ?? '?'} id={user?.id ?? 0} />
                  <span>
                    {localize(user ? `О чём поговорим, ${user.name}?` : 'Есть вопрос или идея? Поделитесь.')}
                  </span>
                  <span className={s.promptPlus}>
                    <ForumIcon name="plus" />
                  </span>
                </button>
              )}
              <div className={s.toolbar}>
                <label className={s.search}>
                  <ForumIcon name="search" />
                  <input
                    aria-label={t("Поиск по форуму")}
                    placeholder={t("Поиск по обсуждениям…")}
                    maxLength={120}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                  {query && (
                    <button
                      className={s.iconButton}
                      aria-label={t("Очистить поиск")}
                      onClick={() => setQuery('')}
                    >
                      <ForumIcon name="close" size={16} />
                    </button>
                  )}
                </label>
                <select
                  aria-label={t("Порядок обсуждений")}
                  value={sort}
                  onChange={(event) => setSort(event.target.value)}
                >
                  <option value="new">{t("Сначала новые")}</option>
                  <option value="top">{t("Популярные")}</option>
                  <option value="unanswered">{t("Без ответов")}</option>
                </select>
                <button
                  className={s.iconButton}
                  aria-label={t("Обновить ленту")}
                  disabled={loading || busy || more}
                  onClick={() => setRevision((n) => n + 1)}
                >
                  <ForumIcon name="refresh" />
                </button>
              </div>
              <div className={s.feedInfo}>
                <span>
                  {localize(loading || query.trim() !== search
                    ? 'Ищем обсуждения…'
                    : `${page?.total ?? 0} обсуждений`)}
                  {localize(scope === 'saved' && ' · видно только вам')}
                </span>
                {filtered && (
                  <button
                    onClick={() => {
                      setCategory('all')
                      setQuery('')
                      setSearch('')
                      setSort('new')
                    }}
                  >{t("Сбросить фильтры ")}</button>
                )}
              </div>
              {notice && (
                <p className={s.notice} role="status">
                  {localize(notice)}
                </p>
              )}
              {actionError && (
                <p className={s.error} role="alert">
                  {localize(actionError)}
                </p>
              )}
              {loading ? (
                <div className={s.skeletons} role="status" aria-label={t("Загрузка обсуждений")}>
                  {[1, 2, 3].map((n) => (
                    <div className={s.skeleton} key={n}>
                      <i />
                      <i />
                      <i />
                    </div>
                  ))}
                </div>
              ) : error ? (
                <div className={s.empty}>
                  <ForumIcon name="chat" size={32} />
                  <h3>{t("Не удалось загрузить форум")}</h3>
                  <p role="alert">{localize(error)}</p>
                  <button onClick={() => setRevision((n) => n + 1)}>{t("Попробовать ещё раз")}</button>
                </div>
              ) : page?.topics.length ? (
                <div className={s.feed}>
                  {page.topics.map((topic) => (
                    <TopicCard
                      key={topic.id}
                      topic={topic}
                      busy={busy || more}
                      onOpen={() => openTopic(topic)}
                      onLike={() => void interact(topic, 'like')}
                      onSave={() => void interact(topic, 'bookmark')}
                      onDelete={() => setDeleting(topic)}
                    />
                  ))}
                  {page.hasMore && (
                    <button
                      className={s.loadMore}
                      disabled={more || busy}
                      onClick={() => void loadMore()}
                    >
                      {localize(more ? 'Загружаем…' : 'Ещё обсуждения')}
                    </button>
                  )}
                </div>
              ) : (
                <div className={s.empty}>
                  <span className={s.emptyIcon}>
                    <ForumIcon name={scope === 'saved' ? 'bookmark' : 'chat'} size={30} />
                  </span>
                  <h3>
                    {localize(filtered
                      ? 'Пока ничего не нашлось'
                      : scope === 'saved'
                        ? 'Важное будет под рукой'
                        : scope === 'mine'
                          ? 'Ваш первый разговор — впереди'
                          : 'Здесь начинается сообщество')}
                  </h3>
                  <p>
                    {localize(filtered
                      ? 'Попробуйте другой запрос или выберите другую тему.'
                      : scope === 'saved'
                        ? 'Нажмите на закладку у обсуждения — оно появится здесь.'
                        : 'Задайте вопрос или поделитесь находкой. Кто-то скажет вам спасибо.')}
                  </p>
                  {filtered ? (
                    <button
                      onClick={() => {
                        setCategory('all')
                        setQuery('')
                        setSearch('')
                        setSort('new')
                      }}
                    >{t("Сбросить фильтры ")}</button>
                  ) : (
                    scope !== 'saved' && (
                      <button className={s.primary} onClick={startComposer}>
                        <ForumIcon name="plus" />{t("Начать обсуждение ")}</button>
                    )
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {deleting && (
        <ConfirmDelete
          onClose={() => setDeleting(null)}
          onDelete={async () => {
            await api(`/api/campus/forum/topics/${deleting.id}/delete`, {
              method: 'POST',
              body: {},
            })
            if (alive.current) deleted()
          }}
        />
      )}
    </div>
  )
}
