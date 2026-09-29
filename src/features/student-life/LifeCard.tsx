import { t, localize, getLocale } from '../../shared/i18n/index.ts'
import { useState } from 'react'
import { imageUrl } from './data'
import type { CategoryId, LifeItem } from './model'
import styles from './StudentLife.module.css'
import { awardActivity } from '../campus/client'
const date = (value: string) =>
  new Intl.DateTimeFormat(getLocale(), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Yekaterinburg',
  }).format(new Date(value))
function eventLabel(item: LifeItem) {
  if (!item.eventDate) return 'Следите за анонсами'
  let label = date(item.eventDate)
  if (item.eventDate.includes('T'))
    label +=
      ', ' +
      new Intl.DateTimeFormat(getLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Asia/Yekaterinburg',
      }).format(new Date(item.eventDate))
  if (item.eventEndDate && item.eventEndDate.slice(0, 10) !== item.eventDate.slice(0, 10))
    label += ' — ' + date(item.eventEndDate)
  return label
}
export function LifeCard({
  item,
  category,
  saved,
  onSave,
  imageRevision = '',
}: {
  item: LifeItem
  category: CategoryId
  saved: boolean
  onSave: (id: string) => void
  imageRevision?: string
}) {
  const [failedImageKey, setFailedImageKey] = useState<string>()
  const image = imageUrl(item.image)
  const imageKey = `${image}:${imageRevision}`
  const failedImage = failedImageKey === imageKey
  const href = category === 'clubs' ? item.socialUrl || item.sourceUrl : item.sourceUrl
  return (
    <article className={`${styles.card} ${category === 'news' ? styles.newsCard : ''}`}>
      {(category === 'clubs' || category === 'news' || image) && (
        <div className={styles.media}>
          {image && !failedImage ? (
            <img
              src={image}
              alt={item.imageAlt || item.title}
              loading="lazy"
              onError={() => setFailedImageKey(imageKey)}
            />
          ) : (
            <div className={styles.placeholder} aria-label={t("Изображение не опубликовано")}>
              <span aria-hidden="true">
                {category === 'news'
                  ? 'УУ'
                  : item.title.replace(/[«»]/g, '').slice(0, 2).toUpperCase()}
              </span>
              <small>{t("Без изображения")}</small>
            </div>
          )}
          {image && !failedImage && item.imageKind && (
            <span className={styles.imageLabel}>{localize(item.imageKind)}</span>
          )}
        </div>
      )}
      <div className={styles.cardBody}>
        <div className={styles.cardTop}>
          <span className={styles.eyebrow}>
            {localize(item.group)}
            {localize(item.readMinutes ? ` · ${item.readMinutes} мин` : '')}
          </span>
          <button
            className={styles.save}
            type="button"
            aria-pressed={saved}
            aria-label={`${saved ? 'Убрать из сохранённого' : 'Сохранить'}: ${item.title}`}
            onClick={() => onSave(item.id)}
          >
            {localize(saved ? '★ Сохранено' : '☆ Сохранить')}
          </button>
        </div>
        <h4>
          {href ? (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              onClick={() => {
                if (category === 'news') void awardActivity('news-read', item.id)
              }}
            >
              {item.title}
            </a>
          ) : (
            item.title
          )}
        </h4>
        {category === 'news' && item.publishedAt && (
          <p className={styles.date}>{localize(date(item.publishedAt))}</p>
        )}
        {category === 'events' && <p className={styles.date}>{localize(eventLabel(item))}</p>}
        <p>{item.summary}</p>
        {category === 'news' && href && (
          <a
            className={styles.readNews}
            href={href}
            target="_blank"
            rel="noreferrer"
            onClick={() => {
              void awardActivity('news-read', item.id)
            }}
          >{t("Читать публикацию ↗ ")}<span>{t("+3 КБ за первое открытие")}</span>
          </a>
        )}
        {item.location && <p className={styles.detail}>{t("Где: ")}{item.location}</p>}
        {item.dateNote && <p className={styles.detail}>{localize(item.dateNote)}</p>}
        {item.conditions && (
          <p className={styles.condition}>
            <strong>{t("Условия: ")}</strong>
            {localize(item.conditions)}
          </p>
        )}
        {item.document && (
          <p className={styles.detail}>
            <strong>{t("Что взять: ")}</strong>
            {localize(item.document)}
          </p>
        )}
        <div className={styles.tags}>
          {item.tags.map((tag) => (
            <span key={tag}>{localize(tag)}</span>
          ))}
        </div>
        {!!item.steps?.length && (
          <details className={styles.steps}>
            <summary>{localize(item.editorial ? 'Открыть гайд' : 'Как начать')}</summary>
            <ol>
              {item.steps.map((step) => (
                <li key={step}>{localize(step)}</li>
              ))}
            </ol>
          </details>
        )}
        {!!item.links?.length && (
          <div className={styles.links}>
            {item.links.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noreferrer">
                {localize(link.label)} ↗
              </a>
            ))}
          </div>
        )}
        <div className={styles.source}>
          {item.sourceUrl ? (
            <a href={item.sourceUrl} target="_blank" rel="noreferrer">{t("Источник: ")}{localize(item.sourceName)} ↗
            </a>
          ) : (
            <span>{t("Авторский материал PocketUUST")}</span>
          )}
          {category === 'clubs' && !item.socialUrl && (
            <span>{t("Ссылка на сообщество не указана в каталоге; контакты — на странице УУНиТ.")}</span>
          )}
          <span>
            {localize(item.checkedAt
              ? `Сведения проверены ${date(item.checkedAt)}`
              : item.editorial
                ? 'Практические советы команды'
                : 'Не проверено редакцией')}
          </span>
        </div>
      </div>
    </article>
  )
}
