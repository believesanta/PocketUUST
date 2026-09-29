import { localize, t } from '../../shared/i18n/index.ts'
import { useState, type FormEvent } from 'react'
import { pastEvents } from './events'
import { summarizeReviews, validReview, type Review } from './model'
import { useLocal } from './useLocal'
import s from './Community.module.css'

function EventCard({
  event,
  reviews,
  onSave,
}: {
  event: (typeof pastEvents)[number]
  reviews: Review[]
  onSave: (review: Review) => boolean
}) {
  const previous = reviews.find((review) => review.eventId === event.id)
  const [open, setOpen] = useState(false)
  const [stars, setStars] = useState(previous?.stars ?? 0)
  const [comment, setComment] = useState(previous?.comment ?? '')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const summary = summarizeReviews(reviews.filter((review) => review.eventId === event.id))
  function submit(formEvent: FormEvent) {
    formEvent.preventDefault()
    setError('')
    setStatus('')
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      setError('Выберите оценку от 1 до 5 звёзд.')
      return
    }
    if (comment.trim().length > 600) {
      setError('Комментарий должен содержать не более 600 символов.')
      return
    }
    const review = {
      id: previous?.id || crypto.randomUUID(),
      eventId: event.id,
      stars,
      comment: comment.trim(),
      createdAt: new Date().toISOString(),
    }
    if (onSave(review)) {
      setOpen(false)
      setStatus('Ваша оценка сохранена в этом браузере.')
    }
  }
  return (
    <article className={s.eventCard}>
      <div className={s.eventArt} aria-hidden="true">
        <span>{localize(event.glyph)}</span>
        <i>{t("УУНиТ")}</i>
      </div>
      <div className={s.eventBody}>
        <div className={s.cardTop}>
          <span className={s.pill}>{localize(event.tag)}</span>
          <span className={s.small}>{t("Прошедшее")}</span>
        </div>
        <p className={s.eventDate}>{localize(event.date)}</p>
        <h3>{localize(event.title)}</h3>
        <p className={s.small}>{localize(event.place)}</p>
        <p>{localize(event.summary)}</p>
        <div className={s.source}>
          <a href={event.source} target="_blank" rel="noreferrer">
            {localize(event.sourceLabel)}
          </a>
          {'dateSource' in event && (
            <a href={event.dateSource} target="_blank" rel="noreferrer">{t("Источник даты · PDF ")}</a>
          )}
          <span>{localize(event.dateEvidence)}</span>
        </div>
        <div className={s.ratingSummary}>
          <span
            aria-label={
              localize(summary.average === null
                ? 'Пока без оценок'
                : `Средняя оценка ${summary.average.toFixed(1)} из 5`)
            }
          >
            {localize(summary.average === null ? '☆ Пока без оценок' : `★ ${summary.average.toFixed(1)} / 5`)}
          </span>
          <small>
            {localize(summary.count ? `${summary.count} оценка в этом браузере` : 'Станьте первым здесь')}
          </small>
        </div>
        {previous && (
          <div className={s.savedReview}>
            <strong>{t("Ваш отзыв · локально")}</strong>
            {previous.comment && <p className={s.prewrap}>{previous.comment}</p>}
          </div>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(!open)
            setStars(previous?.stars ?? 0)
            setComment(previous?.comment ?? '')
            setError('')
          }}
        >
          {localize(open ? 'Закрыть форму' : previous ? 'Изменить свою оценку' : 'Я был(а) · оценить')}
        </button>
        <div role="status" aria-live="polite" className={status ? s.notice : undefined}>
          {localize(status)}
        </div>
        {open && (
          <form className={s.reviewForm} onSubmit={submit}>
            <fieldset>
              <legend>{t("Как вам событие?")}</legend>
              <div className={s.stars}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <label key={value} title={localize(`${value} из 5`)}>
                    <input
                      required
                      type="radio"
                      name={`rating-${event.id}`}
                      value={value}
                      checked={stars === value}
                      onChange={() => setStars(value)}
                    />
                    <span aria-hidden="true">{localize(value <= stars ? '★' : '☆')}</span>
                    <span className={s.srOnly}>{localize(value)}{t(" из 5 звёзд")}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>{t("Что запомнилось? ")}<span className={s.small}>{t("(необязательно)")}</span>
              <textarea
                rows={3}
                maxLength={600}
                value={comment}
                onChange={(change) => setComment(change.target.value)}
                placeholder={t("Поделитесь своим впечатлением")}
              />
            </label>
            {error && (
              <p role="alert" className={s.error}>
                {localize(error)}
              </p>
            )}
            <button className={s.primary} type="submit">{t("Сохранить оценку ")}</button>
          </form>
        )}
      </div>
    </article>
  )
}

export function PastEvents() {
  const {
    items: reviews,
    save,
    storageError,
  } = useLocal<Review>('pocketuust-community-reviews-v1', validReview)
  const events = pastEvents.filter((event) => event.endDate < new Date().toISOString().slice(0, 10))
  return (
    <section className={s.events} aria-labelledby="past-events-heading">
      <div className={s.sectionIntro}>
        <div>
          <h2 id="past-events-heading">{t("После аплодисментов")}</h2>
          <p>{t("События закончились. Впечатления остаются.")}</p>
        </div>
      </div>
      <p className={s.localNote}>{t("Даты и описание — из официальных источников. Оценки и комментарии сохраняются только в этом браузере: это ваши впечатления, а не общий рейтинг университета. Одна оценка на событие, её можно изменить. ")}</p>
      {storageError && (
        <p className={s.error} role="alert">
          {localize(storageError)}
        </p>
      )}
      <div className={s.eventGrid}>
        {events.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            reviews={reviews}
            onSave={(review) =>
              save([review, ...reviews.filter((item) => item.eventId !== review.eventId)])
            }
          />
        ))}
      </div>
      <p className={s.small}>{t("Источники проверены 27 сентября 2026. Карточки иллюстрированы авторской типографикой, без фотографий с других мероприятий. ")}</p>
    </section>
  )
}
