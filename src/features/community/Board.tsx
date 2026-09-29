import { t, localize, getLocale } from '../../shared/i18n/index.ts'
import { useState, type FormEvent } from 'react'
import { validateAd, validAd, type Ad, type AdDraft } from './model'
import { useLocal } from './useLocal'
import s from './Community.module.css'

const kinds = [
  { id: 'sell', label: 'Продам' },
  { id: 'buy', label: 'Куплю' },
  { id: 'give', label: 'Отдам' },
]
const examples: Ad[] = [
  {
    id: 'demo-book',
    kind: 'sell',
    title: 'Матан без паники',
    description:
      'Пример объявления: учебник по математическому анализу. Состояние и наличие не подтверждены.',
    price: '350',
    pickup: 'dorm',
    location: 'Общежитие · пример',
    createdAt: '',
    demo: true,
  },
  {
    id: 'demo-lamp',
    kind: 'give',
    title: 'Свет для ночных дедлайнов',
    description:
      'Пример объявления: настольная лампа. Показываем, как может выглядеть вещь, которую отдают бесплатно.',
    price: '0',
    pickup: 'dorm',
    location: 'Общежитие · пример',
    createdAt: '',
    demo: true,
  },
  {
    id: 'demo-coat',
    kind: 'buy',
    title: 'Ищу лабораторный халат',
    description:
      'Пример запроса: халат для лабораторных занятий, размер M. Это образец, а не настоящая заявка.',
    price: '500',
    pickup: 'address',
    location: 'Самовывоз по адресу · пример',
    createdAt: '',
    demo: true,
  },
]
const initial: AdDraft = {
  kind: 'sell',
  title: '',
  description: '',
  price: '',
  pickup: 'dorm',
  location: '',
}

export function Board() {
  const { items, save, storageError } = useLocal<Ad>('pocketuust-community-ads-v1', validAd)
  const [kind, setKind] = useState('all')
  const [pickup, setPickup] = useState('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<AdDraft>(initial)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [contact, setContact] = useState<string | null>(null)
  const update = (key: keyof AdDraft, value: string) =>
    setDraft((old) => ({ ...old, [key]: value }))
  function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setStatus('')
    const cleaned = {
      ...draft,
      title: draft.title.trim(),
      description: draft.description.trim(),
      location: draft.location.trim(),
      price: draft.kind === 'give' ? '0' : draft.price.trim(),
    }
    const issue = validateAd(cleaned)
    if (issue) {
      setError(issue)
      return
    }
    if (
      save([{ ...cleaned, id: crypto.randomUUID(), createdAt: new Date().toISOString() }, ...items])
    ) {
      setDraft(initial)
      setOpen(false)
      setStatus('Объявление сохранено в этом браузере. Другие студенты его пока не видят.')
    }
  }
  const shown = [...items, ...examples].filter(
    (ad) =>
      (kind === 'all' || ad.kind === kind) &&
      (pickup === 'all' || ad.pickup === pickup) &&
      `${ad.title} ${ad.description} ${ad.location}`
        .toLocaleLowerCase('ru')
        .includes(query.trim().toLocaleLowerCase('ru')),
  )
  return (
    <div>
      <div className={s.sectionIntro}>
        <div>
          <h3>{t("Вещи получают второй курс")}</h3>
          <p>{t("Книги, лампы и всё для жизни между парами.")}</p>
        </div>
        <button
          className={s.primary}
          type="button"
          onClick={() => {
            setOpen(!open)
            setError('')
          }}
        >
          {localize(open ? 'Закрыть форму' : 'Добавить объявление')}
        </button>
      </div>
      <p className={s.localNote}>{t("Локальная доска: ваши объявления хранятся только в этом браузере. Карточки с отметкой «Пример» показывают возможности сервиса. ")}</p>
      <div role="status" aria-live="polite" className={status ? s.notice : undefined}>
        {localize(status)}
      </div>
      {storageError && (
        <p role="alert" className={s.error}>
          {localize(storageError)}
        </p>
      )}
      {open && (
        <form className={s.formPanel} onSubmit={submit}>
          <h3>{t("Ваше объявление")}</h3>
          <div className={s.formColumns}>
            <label>{t("Что хотите сделать? ")}<select value={draft.kind} onChange={(event) => update('kind', event.target.value)}>
                {kinds.map((item) => (
                  <option value={item.id} key={item.id}>
                    {localize(item.label)}
                  </option>
                ))}
              </select>
            </label>
            <label>{t("Цена, ₽ ")}<input
                type="number"
                min={1}
                max={1000000}
                step="any"
                required={draft.kind !== 'give'}
                disabled={draft.kind === 'give'}
                value={draft.kind === 'give' ? '0' : draft.price}
                onChange={(event) => update('price', event.target.value)}
              />
            </label>
          </div>
          <label>{t("Название ")}<input
              required
              minLength={3}
              maxLength={80}
              value={draft.title}
              onChange={(event) => update('title', event.target.value)}
              placeholder={t("Например, учебник по физике")}
            />
          </label>
          <label>{t("Описание ")}<textarea
              required
              minLength={10}
              maxLength={700}
              rows={4}
              value={draft.description}
              onChange={(event) => update('description', event.target.value)}
              placeholder={t("Состояние вещи, размер, детали")}
            />
          </label>
          <div className={s.formColumns}>
            <label>{t("Самовывоз ")}<select
                value={draft.pickup}
                onChange={(event) => update('pickup', event.target.value)}
              >
                <option value="dorm">{t("Из общежития")}</option>
                <option value="address">{t("По адресу")}</option>
              </select>
            </label>
            <label>
              {localize(draft.pickup === 'dorm' ? 'Номер или название общежития' : 'Адрес встречи')}
              <input
                required
                minLength={3}
                maxLength={120}
                value={draft.location}
                onChange={(event) => update('location', event.target.value)}
                placeholder={localize(draft.pickup === 'dorm' ? 'Общежитие №…' : 'Улица и номер дома')}
              />
            </label>
          </div>
          <p className={s.small}>{t("Не указывайте номер комнаты и другие личные данные. Контакты и общая публикация объявлений пока не подключены. ")}</p>
          {error && (
            <p role="alert" className={s.error}>
              {localize(error)}
            </p>
          )}
          <button type="submit" className={s.primary}>{t("Сохранить в браузере ")}</button>
        </form>
      )}
      <div className={s.filters}>
        <label>{t("Найти вещь ")}<input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("Учебник, халат, лампа…")}
          />
        </label>
        <label>{t("Самовывоз ")}<select value={pickup} onChange={(event) => setPickup(event.target.value)}>
            <option value="all">{t("Все места")}</option>
            <option value="dorm">{t("Из общежития")}</option>
            <option value="address">{t("По адресу")}</option>
          </select>
        </label>
      </div>
      <div className={s.chips} aria-label={t("Тип объявления")}>
        <button type="button" aria-pressed={kind === 'all'} onClick={() => setKind('all')}>{t("Всё ")}</button>
        {kinds.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={kind === item.id}
            onClick={() => setKind(item.id)}
          >
            {localize(item.label)}
          </button>
        ))}
      </div>
      <p className={s.small}>{t("Найдено: ")}{localize(shown.length)}</p>
      {shown.length === 0 && (
        <p className={s.empty}>{t("Подходящих вещей пока нет. Попробуйте другой запрос или добавьте своё объявление. ")}</p>
      )}
      <div className={s.adGrid}>
        {shown.map((ad) => (
          <article key={ad.id} className={`${s.adCard} ${ad.kind === 'give' ? s.gift : ''}`}>
            <div className={s.cardTop}>
              <span className={s.pill}>{localize(kinds.find((item) => item.id === ad.kind)?.label)}</span>
              <span className={s.small}>{localize(ad.demo ? 'Пример · демо' : 'Ваше · локально')}</span>
            </div>
            <h4>{ad.title}</h4>
            <p className={s.price}>
              {localize(ad.kind === 'give' ? 'Бесплатно' : `${Number(ad.price).toLocaleString(getLocale())} ₽`)}
            </p>
            <p className={s.prewrap}>{ad.description}</p>
            <p className={s.location}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"
                  stroke="currentColor"
                  strokeWidth="1.6"
                />
                <circle cx="12" cy="10" r="2.3" stroke="currentColor" strokeWidth="1.6" />
              </svg>
              {localize(ad.location)}
            </p>
            {ad.demo ? (
              <>
                <button
                  type="button"
                  onClick={() => setContact(contact === ad.id ? null : ad.id)}
                  aria-expanded={contact === ad.id}
                >{t("Контакт в примере ")}</button>
                {contact === ad.id && (
                  <p className={s.localNote}>{t("Демо-контакт не задан. Эта вещь не продаётся через сервис. ")}</p>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (save(items.filter((item) => item.id !== ad.id)))
                    setStatus('Локальное объявление удалено.')
                }}
              >{t("Удалить моё объявление ")}</button>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
