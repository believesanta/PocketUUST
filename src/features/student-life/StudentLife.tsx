import { t, localize, getLocale, searchable } from '../../shared/i18n/index.ts'
import { useEffect, useRef, useState } from 'react'
import { catalogCheckedAt, content, interests } from './data'
import { categories, type CategoryId } from './model'
import { readStrings, writeLocal } from './storage'
import { LifeCard } from './LifeCard'
import { SuggestMaterial } from './SuggestMaterial'
import { Faq } from './Faq'
import { useNews } from './useNews'
import styles from './StudentLife.module.css'
import { PastEvents } from '../community'
import { awardActivity } from '../campus/client'

export function StudentLife({
  initialCategory = 'news',
  focusTarget,
}: {
  initialCategory?: CategoryId
  focusTarget?: 'category' | 'faq'
}) {
  const newsState = useNews()
  const [selectedId, setSelectedId] = useState<CategoryId>(initialCategory)
  const [pastEvents, setPastEvents] = useState(false)
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('Все')
  const [savedOnly, setSavedOnly] = useState(false)
  const [saved, setSaved] = useState(() => readStrings('saved'))
  const [chosenInterests, setChosenInterests] = useState(() =>
    readStrings('interests').filter((tag) => interests.includes(tag)),
  )
  const [storageMessage, setStorageMessage] = useState('')
  const sectionTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (!focusTarget) return
    const frame = requestAnimationFrame(() => {
      const target =
        focusTarget === 'faq' ? document.getElementById('life-faq-title') : sectionTitle.current
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [focusTarget])
  const category = categories.find((item) => item.id === selectedId)!
  const items = selectedId === 'news' ? newsState.news : content[selectedId]
  const groups = [...new Set(items.map((item) => item.group))]
  const normalized = query.trim().toLocaleLowerCase('ru')
  const filtered = items.filter(
    (item) =>
      (group === 'Все' || item.group === group) &&
      (!savedOnly || saved.includes(item.id)) &&
      (!chosenInterests.length || item.tags.some((tag) => chosenInterests.includes(tag))) &&
      (!normalized ||
        [item.title, item.summary, item.group, ...item.tags, ...(item.steps ?? [])]
          .map(searchable)
          .join(' ')
          .includes(normalized)),
  )
  function save(id: string) {
    if (selectedId === 'news' && !saved.includes(id)) void awardActivity('news-save', id)
    const next = saved.includes(id) ? saved.filter((value) => value !== id) : [...saved, id]
    setSaved(next)
    setStorageMessage(
      writeLocal('saved', next)
        ? ''
        : 'Браузер запретил сохранение: выбор сохранится только до закрытия вкладки.',
    )
  }
  function interest(tag: string) {
    const next = chosenInterests.includes(tag)
      ? chosenInterests.filter((value) => value !== tag)
      : [...chosenInterests, tag]
    setChosenInterests(next)
    setStorageMessage(writeLocal('interests', next) ? '' : 'Браузер запретил сохранение интересов.')
  }
  function reset() {
    setQuery('')
    setGroup('Все')
    setSavedOnly(false)
    setChosenInterests([])
    writeLocal('interests', [])
  }
  function navigate(category: CategoryId, nextGroup = 'Все', nextQuery = '') {
    reset()
    setSelectedId(category)
    setGroup(nextGroup)
    setQuery(nextQuery)
    requestAnimationFrame(() => {
      sectionTitle.current?.focus({ preventScroll: true })
      sectionTitle.current?.scrollIntoView({ block: 'start' })
    })
  }
  return (
    <section aria-labelledby="life-title">
      <header className={styles.hero}>
        <span className={styles.eyebrow}>{t("PocketUUST · за пределами пар")}</span>
        <h2 id="life-title">{t("Студенческая жизнь")}</h2>
        <p>{t("Найдите своё сообщество, первую стажировку и полезные привычки. Всё, с чего удобно начать. ")}</p>
        <div className={styles.stats}>
          <span>
            <strong>{localize(content.clubs.length)}</strong>{t(" сообществ ")}</span>
          <span>
            <strong>{localize(content.resources.length)}</strong>{t(" материалов ")}</span>
          <span>
            <strong>{localize(content.career.length)}</strong>{t(" возможностей ")}</span>
        </div>
        <a className={styles.faqJump} href="#life-faq">{t("Частые вопросы ")}</a>
      </header>
      <nav className={styles.categories} aria-label={t("Разделы студенческой жизни")}>
        {categories.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={selectedId === item.id}
            aria-controls="life-category-content"
            onClick={() => {
              setSelectedId(item.id)
              setGroup('Все')
              setQuery('')
            }}
          >
            {localize(item.title)}
          </button>
        ))}
      </nav>
      <details className={styles.interests} open={chosenInterests.length > 0 || undefined}>
        <summary>{t("Подобрать по интересам ")}{localize(chosenInterests.length ? ` · выбрано ${chosenInterests.length}` : '')}
        </summary>
        <p>{t("Выберите одно или несколько направлений. Покажем карточки, совпадающие хотя бы с одним интересом. ")}</p>
        <div className={styles.chips}>
          {interests.map((tag) => (
            <button
              type="button"
              key={tag}
              aria-pressed={chosenInterests.includes(tag)}
              onClick={() => interest(tag)}
            >
              {localize(tag)}
            </button>
          ))}
        </div>
      </details>
      <div id="life-category-content" className={styles.content}>
        <div className={styles.sectionHeading}>
          <div>
            <h3 ref={sectionTitle} tabIndex={-1}>
              {localize(category.title)}
            </h3>
            <p>{localize(category.note)}</p>
          </div>
          <div className={styles.headingActions}>
            {selectedId === 'news' && (
              <button
                type="button"
                aria-pressed={pastEvents}
                onClick={() => setPastEvents((value) => !value)}
              >{t("Прошедшие события ")}</button>
            )}
            <button type="button" aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}>{t("★ Сохранённое (")}{localize(saved.length)})
            </button>
          </div>
        </div>
        {selectedId === 'news' && pastEvents ? (
          <PastEvents />
        ) : (
          <>
            {selectedId === 'news' && (
              <p className={styles.feedStatus} role="status">{t("Лента обновлена:")}{' '}
                <time dateTime={newsState.updatedAt}>
                  {localize(new Intl.DateTimeFormat(getLocale(), {
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'Asia/Yekaterinburg',
                  }).format(new Date(newsState.updatedAt)))}{' '}{t("(Уфа) ")}</time>
                .{' '}
                {localize(newsState.stale
                  ? 'Показана последняя доступная версия.'
                  : newsState.live
                    ? 'Новые публикации появятся автоматически.'
                    : 'Показана сохранённая лента.')}
              </p>
            )}
            <div className={styles.filters}>
              <div>
                <label htmlFor="life-search">{t("Найти в разделе")}</label>
                <input
                  id="life-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    localize(selectedId === 'resources'
                      ? 'Например, скидки или экзамен'
                      : 'Название, тема или интерес')
                  }
                />
              </div>
              <div>
                <label htmlFor="life-group">{t("Направление")}</label>
                <select id="life-group" value={group} onChange={(e) => setGroup(e.target.value)}>
                  <option value="Все">{t("Все")}</option>
                  {groups.map((value) => (
                    <option key={value} value={value}>{localize(value)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className={styles.results}>
              <p role="status">{t("Найдено ")}{localize(filtered.length)}{t(" из ")}{localize(items.length)}
                {localize(savedOnly ? ' · сохранённое в этом разделе' : '')}
              </p>
              <button type="button" onClick={reset}>{t("Сбросить фильтры ")}</button>
            </div>
            {(normalized || group !== 'Все' || chosenInterests.length > 0 || savedOnly) && (
              <div className={styles.activeFilters} role="group" aria-label={t("Активные фильтры")}>
                {normalized && (
                  <button
                    type="button"
                    aria-label={localize(`Убрать поиск: ${query}`)}
                    onClick={() => setQuery('')}
                  >{t("Поиск: ")}{localize(query)} <span aria-hidden="true">×</span>
                  </button>
                )}
                {group !== 'Все' && (
                  <button
                    type="button"
                    aria-label={localize(`Убрать направление: ${group}`)}
                    onClick={() => setGroup('Все')}
                  >
                    {localize(group)} <span aria-hidden="true">×</span>
                  </button>
                )}
                {chosenInterests.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    aria-label={localize(`Убрать интерес: ${tag}`)}
                    onClick={() => interest(tag)}
                  >
                    {localize(tag)} <span aria-hidden="true">×</span>
                  </button>
                ))}
                {savedOnly && (
                  <button type="button" onClick={() => setSavedOnly(false)}>{t("Только сохранённое ")}<span aria-hidden="true">×</span>
                  </button>
                )}
              </div>
            )}
            {storageMessage && <p role="alert">{localize(storageMessage)}</p>}
            {filtered.length ? (
              <div className={styles.grid}>
                {filtered.map((item) => (
                  <LifeCard
                    key={item.id}
                    item={item}
                    category={selectedId}
                    saved={saved.includes(item.id)}
                    onSave={save}
                    imageRevision={selectedId === 'news' ? newsState.updatedAt : undefined}
                  />
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <h4>{t("Пока ничего не нашлось")}</h4>
                <p>{t("Попробуйте другой запрос, расширьте интересы или сбросьте фильтры.")}</p>
              </div>
            )}
            {selectedId === 'resources' && <SuggestMaterial />}
          </>
        )}
        <p className={styles.catalogNote}>
          {localize(selectedId === 'news'
            ? 'Новости импортированы автоматически; проверка редакцией отмечается в каждой карточке.'
            : `Источники каталога проверены ${catalogCheckedAt()}. Авторские гайды — советы команды.`)}{' '}{t("Актуальные условия и контакты — в источниках каждой карточки. Сохранённое и интересы хранятся в этом браузере. ")}</p>
      </div>
      <Faq onNavigate={navigate} />
    </section>
  )
}
