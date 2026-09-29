import { localize, t, searchable } from '../../shared/i18n/index.ts'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { RoomId } from '../../shared/types'
import { getRoom } from './data'
import { CampusMap } from './CampusMap'
import { RouteSteps } from './RouteSteps'
import { DormRoutes } from './DormRoutes'
import { dormitories, parsePlace, planRoute, usefulPlaces, type Route } from './routing'
import sourceMap from './assets/campus-source.png'
import styles from './Navigation.module.css'
import { awardActivity } from '../campus/client'

interface SavedRoute {
  from: string
  to: string
  outdoors: boolean
}
const SAVED_KEY = 'pocketuust.navigation.saved.v1'
function readSaved(): SavedRoute[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY)
    if (!raw || raw.length > 10000) return []
    const items: unknown = JSON.parse(raw)
    if (!Array.isArray(items)) return []
    return items
      .filter(
        (item): item is SavedRoute =>
          typeof item === 'object' &&
          item !== null &&
          typeof item.from === 'string' &&
          typeof item.to === 'string' &&
          item.from.length < 100 &&
          item.to.length < 100 &&
          typeof item.outdoors === 'boolean' &&
          Boolean(parsePlace(item.from) && parsePlace(item.to)),
      )
      .slice(0, 5)
  } catch {
    return []
  }
}
function PointField({
  id,
  label,
  value,
  onChange,
  error,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  error: boolean
}) {
  const place = parsePlace(value)
  return (
    <div className={styles.pointField}>
      <label htmlFor={id}>{localize(label)}</label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list="navigation-places"
        placeholder={localize(id === 'route-from' ? 'Например, 1-203' : 'Например, 6-401')}
        autoComplete="off"
        maxLength={90}
        aria-invalid={error}
        aria-describedby={`${id}-hint`}
      />
      <span id={`${id}-hint`} className={error ? styles.invalidHint : styles.fieldHint}>
        {localize(error
          ? 'Нужен номер вида 1-203 или место из списка'
          : place?.building
            ? `Корпус ${place.building}${place.floor ? ` · ${place.floor} этаж` : ''}`
            : (place?.label ?? 'Корпус — номер аудитории'))}
      </span>
    </div>
  )
}

export function Navigation({ requestedRoomId }: { requestedRoomId: RoomId | null }) {
  const legacyRoom = requestedRoomId ? getRoom(requestedRoomId) : undefined
  const requested = requestedRoomId ? parsePlace(requestedRoomId) : null
  const [from, setFrom] = useState('1-203')
  const [to, setTo] = useState(requested?.id ?? '6-401')
  const [outdoors, setOutdoors] = useState(false)
  const [route, setRoute] = useState<Route | null>(() =>
    requestedRoomId && !requested ? null : planRoute('1-203', requested?.id ?? '6-401', false),
  )
  const [activeStep, setActiveStep] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState<'campus' | 'dorm'>('campus')
  const [dormId, setDormId] = useState(1)
  const [saved, setSaved] = useState(readSaved)
  const [status, setStatus] = useState('')
  const [placesQuery, setPlacesQuery] = useState('')
  const [errors, setErrors] = useState({ from: false, to: false })
  const changeStep = useCallback((step: number) => {
    setPlaying(false)
    setActiveStep(step)
  }, [])
  const dorm = dormitories.find((item) => item.id === dormId)!
  const success = route?.ok ? route : null
  useEffect(() => {
    if (!playing || !success || mode !== 'campus') return
    const timer = window.setTimeout(() => {
      if (activeStep >= success.steps.length - 1) setPlaying(false)
      else setActiveStep(activeStep + 1)
    }, 2600)
    return () => window.clearTimeout(timer)
  }, [playing, success, activeStep, mode])
  function togglePlayback() {
    if (!success || success.steps.length < 2) return
    if (!playing && activeStep >= success.steps.length - 1) setActiveStep(0)
    setPlaying((value) => !value)
  }
  const filteredPlaces = usefulPlaces.filter((place) =>
    `${searchable(place.label)} ${searchable(place.detail)}`
      .includes(placesQuery.toLocaleLowerCase('ru')),
  )
  function clearRoute() {
    setRoute(null)
    setPlaying(false)
    setActiveStep(0)
    setStatus('')
    setErrors({ from: false, to: false })
  }
  function build(a = from, b = to, out = outdoors) {
    setErrors({ from: !parsePlace(a), to: !parsePlace(b) })
    const next = planRoute(a, b, out)
    setRoute(next)
    setPlaying(false)
    setActiveStep(0)
    setStatus('')
    setMode('campus')
    if (next.ok && next.from.id !== next.to.id)
      void awardActivity('route', `${next.from.id}>${next.to.id}:${out ? 'outside' : 'inside'}`)
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    build()
  }
  function preset(a: string, b: string, out = false) {
    setFrom(parsePlace(a)?.label ?? a)
    setTo(parsePlace(b)?.label ?? b)
    setOutdoors(out)
    build(a, b, out)
  }
  function selectPlace(id: string) {
    const place = parsePlace(id)
    if (place) {
      const out = id === 'mig' || id.startsWith('stop-') || place.building === 7 ? true : outdoors
      preset(from, place.label.startsWith('Вход в корпус') ? id : place.label, out)
    }
  }
  function saveRoute() {
    if (!success) return
    const entry = { from: success.from.id, to: success.to.id, outdoors }
    const next = [
      entry,
      ...saved.filter(
        (item) =>
          item.from !== entry.from || item.to !== entry.to || item.outdoors !== entry.outdoors,
      ),
    ].slice(0, 5)
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next))
      setSaved(next)
      setStatus('Маршрут сохранён в этом браузере.')
    } catch {
      setStatus('Браузер не разрешил сохранение маршрута.')
    }
  }
  function removeSaved(index: number) {
    const next = saved.filter((_, i) => i !== index)
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next))
      setSaved(next)
      setStatus('Сохранённый маршрут удалён.')
    } catch {
      setStatus('Браузер не разрешил изменить сохранённое.')
    }
  }
  async function copyRoute() {
    if (!success) return
    const text = [
      `${success.from.label} → ${success.to.label}`,
      ...success.steps.map((s, i) => `${i + 1}. ${s.title}. ${s.detail}`),
      'По схеме кампуса. Точные положения лестниц и дверей неизвестны.',
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setStatus('Шаги маршрута скопированы.')
    } catch {
      setStatus('Не удалось скопировать. Можно выделить текст шагов и скопировать вручную.')
    }
  }
  return (
    <section className={styles.navigation} data-mode={mode} aria-labelledby="navigation-title">
      <header className={styles.hero}>
        <div>
          <h2 id="navigation-title">
            {localize(mode === 'campus' ? 'Следующая пара. Путь понятен.' : 'От общежития до кампуса.')}
          </h2>
          <p>
            {localize(mode === 'campus'
              ? 'Два номера аудитории — и маршрут по корпусам и этажам.'
              : 'Выберите общежитие и удобный способ добраться.')}
          </p>
        </div>
      </header>
      {requestedRoomId && !requested && (
        <aside className={styles.scheduleNotice}>
          <strong>
            {localize(legacyRoom
              ? `Аудитория ${legacyRoom.number} из расписания — учебный пример.`
              : 'Для аудитории из расписания пока нет координат.')}
          </strong>
          <p>{t("Реальное расположение не известно. Для маршрута введите настоящий номер вида 1-203.")}</p>
        </aside>
      )}
      <div className={styles.modeTabs} aria-label={t("Вариант маршрута")}>
        <button
          type="button"
          aria-pressed={mode === 'campus'}
          onClick={() => {
            setPlaying(false)
            setMode('campus')
          }}
        >{t("Между аудиториями ")}</button>
        <button
          type="button"
          aria-pressed={mode === 'dorm'}
          onClick={() => {
            setPlaying(false)
            setMode('dorm')
          }}
        >{t("Из общежития ")}</button>
      </div>
      {mode === 'campus' ? (
        <>
          <form className={styles.routeForm} onSubmit={submit} noValidate>
            <div className={styles.routeEntry}>
              <div className={styles.fields}>
                <PointField
                  id="route-from"
                  label={t("Откуда")}
                  value={from}
                  error={errors.from}
                  onChange={(value) => {
                    setFrom(value)
                    clearRoute()
                  }}
                />
                <button
                  type="button"
                  className={styles.swap}
                  aria-label={t("Поменять начало и конец маршрута")}
                  onClick={() => {
                    setFrom(to)
                    setTo(from)
                    clearRoute()
                  }}
                >
                  ⇄
                </button>
                <PointField
                  id="route-to"
                  label={t("Куда")}
                  value={to}
                  error={errors.to}
                  onChange={(value) => {
                    setTo(value)
                    clearRoute()
                  }}
                />
              </div>
              <button className={styles.primary} type="submit">{t("Построить маршрут ")}<span aria-hidden="true">→</span>
              </button>
            </div>
            <datalist id="navigation-places">
              {usefulPlaces.map((place) => (
                <option key={place.id} value={place.label}>
                  {localize(place.detail)}
                </option>
              ))}
            </datalist>
            <details className={styles.routeOptions}>
              <summary>
                {localize(outdoors ? 'Можно через двор' : 'Только переходы')}
                <span>{t("Настройки и примеры")}</span>
              </summary>
              <div className={styles.formBottom}>
                <label className={styles.switchLabel}>
                  <input
                    type="checkbox"
                    checked={outdoors}
                    onChange={(event) => {
                      const next = event.target.checked
                      setOutdoors(next)
                      build(from, to, next)
                    }}
                  />
                  <span className={styles.switchTrack} aria-hidden="true" />
                  <span>{t("Можно через двор")}<small>{t("Без отметки — только подтверждённые переходы")}</small>
                  </span>
                </label>
              </div>
              <p className={styles.formatHint}>
                <b>1</b>–<b>2</b>{t("03 = корпус 1, этаж 2, аудитория 203. Этаж определяется по номеру. ")}</p>
              <div className={styles.quickRoutes}>
                <span>{t("Попробовать:")}</span>
                <button type="button" onClick={() => preset('1-203', '6-401')}>
                  1-203 → 6-401
                </button>
                <button type="button" onClick={() => preset('3-201', '4-101')}>
                  3-201 → 4-101
                </button>
                <button type="button" onClick={() => preset('main-entry', 'mfso', true)}>{t("Вход → МФСО ")}</button>
              </div>
            </details>
          </form>
          {route && !route.ok && (
            <div className={styles.error} role="alert">
              <p>{localize(route.message)}</p>
              {route.canUseCourtyard && (
                <button
                  type="button"
                  onClick={() => {
                    setOutdoors(true)
                    build(from, to, true)
                  }}
                >{t("Разрешить выход во двор ")}</button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className={styles.dormForm}>
          <div>
            <label htmlFor="dorm-select">{t("Ваше общежитие")}</label>
            <select
              id="dorm-select"
              value={dormId}
              onChange={(event) => setDormId(Number(event.target.value))}
            >
              {dormitories.map((item) => (
                <option key={item.id} value={item.id}>
                  № {localize(item.id)} · {localize(item.address.replace('Уфа, улица ', ''))}
                </option>
              ))}
            </select>
            <p className={styles.fieldHint}>{t("Адреса 15 общежитий из")}{' '}
              <a href="https://uust.ru/campus/" target="_blank" rel="noreferrer">{t("справочника УУНиТ ↗ ")}</a>
            </p>
          </div>
          <div className={styles.dormDestination}>
            <span className={styles.eyebrow}>{t("КУДА ПРИХОДИМ")}</span>
            <strong>{t("Главный вход")}</strong>
            <span>{t("Проходной пункт между корпусами 6 и 7")}</span>
          </div>
        </div>
      )}
      <div className={styles.workspace}>
        {mode === 'dorm' ? (
          <DormRoutes
            key={dorm.id}
            dorm={dorm}
            onContinue={() => preset('main-entry', '6-401', true)}
          />
        ) : (
          <>
            {success && (
              <RouteSteps
                key={`steps-${success.from.id}-${success.to.id}-${outdoors}`}
                route={success}
                active={activeStep}
                onChange={changeStep}
              />
            )}
            <CampusMap
              key={`map-${success?.from.id ?? ''}-${success?.to.id ?? ''}-${outdoors}`}
              route={success}
              activeStep={activeStep}
              playing={playing}
              onChangeStep={changeStep}
              onTogglePlayback={togglePlayback}
              onSelect={(id) => selectPlace(id)}
            />
            {!success && (
              <aside className={styles.emptyCard}>
                <div className={styles.emptyIcon}>↗</div>
                <h3>{t("Откуда начнём?")}</h3>
                <p>{t("Введите два номера или выберите место ниже. Появятся шаги маршрута и переходы на карте. ")}</p>
                <button
                  type="button"
                  className={styles.secondary}
                  onClick={() => preset('1-203', '6-401')}
                >{t("Показать пример ")}</button>
              </aside>
            )}
          </>
        )}
      </div>
      {mode === 'campus' && success && (
        <div className={styles.routeActions}>
          <button type="button" onClick={saveRoute}>{t("♡ Сохранить маршрут ")}</button>
          <button type="button" onClick={() => void copyRoute()}>{t("▤ Скопировать шаги ")}</button>
          <span>{t("Сохранённое останется в этом браузере")}</span>
        </div>
      )}
      <p className={styles.status} role="status">
        {localize(status)}
      </p>
      {saved.length > 0 && (
        <div className={styles.saved}>
          <h3>{t("Ваши маршруты ")}<span>{localize(saved.length)}/5</span>
          </h3>
          <div>
            {saved.map((item, index) => (
              <div className={styles.savedRoute} key={`${item.from}-${item.to}-${item.outdoors}`}>
                <button type="button" onClick={() => preset(item.from, item.to, item.outdoors)}>
                  {localize(parsePlace(item.from)?.label)} → {localize(parsePlace(item.to)?.label)}
                  <small>{localize(item.outdoors ? 'Можно через двор' : 'Через переходы')}</small>
                </button>
                <button
                  type="button"
                  aria-label={localize(`Удалить маршрут ${parsePlace(item.from)?.label} → ${parsePlace(item.to)?.label}`)}
                  onClick={() => removeSaved(index)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <section className={styles.places} aria-labelledby="campus-places-title">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>{t("НЕ ТОЛЬКО АУДИТОРИИ")}</span>
            <h3 id="campus-places-title">{t("Места, которые пригодятся")}</h3>
            <p>{t("Выберите место — оно станет пунктом назначения.")}</p>
          </div>
          <div>
            <label className={styles.srOnly} htmlFor="campus-place-search">{t("Найти место в кампусе ")}</label>
            <input
              id="campus-place-search"
              type="search"
              placeholder={t("МФСО, буфет, медпункт…")}
              value={placesQuery}
              onChange={(event) => setPlacesQuery(event.target.value)}
            />
          </div>
        </div>
        <div className={styles.placesGrid}>
          {filteredPlaces.map((place) => (
            <article key={place.id} className={styles.placeCard}>
              <button type="button" onClick={() => selectPlace(place.id)}>
                <span className={styles.placeIcon} aria-hidden="true">
                  {localize(place.icon)}
                </span>
                <span>
                  <strong>{localize(place.label)}</strong>
                  <small>{localize(place.detail)}</small>
                </span>
                <span aria-hidden="true">↗</span>
              </button>
              {place.sourceUrl && (
                <a href={place.sourceUrl} target="_blank" rel="noreferrer">{t("Адрес подтверждён УУНиТ ↗ ")}</a>
              )}
            </article>
          ))}
        </div>
        {filteredPlaces.length === 0 && (
          <p role="status">{t("Не нашли такое место. Попробуйте «буфет» или «МФСО».")}</p>
        )}
      </section>
      <section className={styles.faq} aria-labelledby="campus-faq-title">
        <h3 id="campus-faq-title">{t("Чтобы не потеряться")}</h3>
        <details>
          <summary>{t("Как читать номер 6-401?")}</summary>
          <p>{t("6 — корпус, 4 — предполагаемый этаж, 401 — номер аудитории. Введите номер целиком с дефисом. Корпуса этой схемы относятся к кампусу на Карла Маркса, 12. ")}</p>
        </details>
        <details>
          <summary>{t("Почему маршрут заканчивается на этаже?")}</summary>
          <p>{t("У нас нет планов этажей, поэтому мы не придумываем расположение кабинетов и лестниц. На нужном этаже найдите номер на двери или спросите у сотрудников. Не каждый введённый номер означает существующую аудиторию. ")}</p>
        </details>
        <details>
          <summary>{t("Можно пройти, не выходя на улицу?")}</summary>
          <p>{t("Да, там, где на схеме указаны этажи переходов. Оставьте «Можно через двор» выключенным. Если подтверждённого пути нет, приложение предложит разрешить выход наружу. ")}</p>
        </details>
        <details>
          <summary>{t("Почему нет маршрута в корпус 5 или перехода 7–8?")}</summary>
          <p>{t("У корпуса 5 на схеме не подписан вход и этаж перехода. Между 7 и 8 подписаны разные этажи с двух сторон; их соответствие нужно уточнить. Мы показываем эти корпуса, но не строим путь по непроверенным переходам. ")}</p>
        </details>
        <details>
          <summary>{t("Это навигация с GPS? Здесь есть маршрут без лестниц?")}</summary>
          <p>{t("Это схема с пошаговой инструкцией. Движущаяся точка показывает выбранный шаг, а не ваше положение. Сведений о лифтах и доступных маршрутах пока нет, поэтому путь без лестниц обещать не можем. ")}</p>
        </details>
      </section>
      <details className={styles.sources}>
        <summary>{t("Исходная схема и источники")}</summary>
        <p>{t("Геометрия и этажи переходов перенесены с предоставленного изображения; дата его составления неизвестна. Проходной пункт 6–7 выбран главным входом по вашему уточнению. Лестницы и линии внутри корпусов условные. ")}</p>
        <p>{t("Адреса общежитий:")}{' '}
          <a href="https://uust.ru/campus/" target="_blank" rel="noreferrer">{t("Студенческий городок ")}</a>{t(". Кабинеты служб:")}{' '}
          <a href="https://uust.ru/mfso/office_contacts/" target="_blank" rel="noreferrer">{t("МФСО ")}</a>
          ,{' '}
          <a
            href="https://uust.ru/departments/mobilization-service/"
            target="_blank"
            rel="noreferrer"
          >{t("отдел мобилизационной подготовки ")}</a>{t(". Проверено 27 сентября 2026. Медпункт, профком и буфеты — по предоставленной схеме. ")}</p>
        <a href={sourceMap} target="_blank" rel="noreferrer">{t("Открыть исходную схему целиком ↗ ")}</a>
        <img
          src={sourceMap}
          alt={t("Исходная схема корпусов кампуса УУНиТ с подписями переходов и важными местами")}
          loading="lazy"
        />
      </details>
    </section>
  )
}
