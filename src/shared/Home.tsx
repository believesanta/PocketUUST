import { t, localize, getLocale } from './i18n/index.ts'
import { useNews } from '../features/student-life/useNews'
import { imageUrl, content } from '../features/student-life/data'
import { awardActivity, openCampus, useCampus } from '../features/campus/client'
import type { AppSection } from './sections'
import type { LifeDestination } from './QuickAccess'
import logo from '../assets/pocket-uust-symbol.png'
const shortcuts = [
  {
    id: 'navigation',
    number: '01',
    title: 'Дойти до пары',
    text: 'Маршруты между корпусами и этажами.',
    symbol: '↗',
    color: 'purple',
  },
  {
    id: 'schedule',
    number: '02',
    title: 'Не пропустить своё',
    text: 'Расписание группы, пары и перерывы.',
    symbol: '▦',
    color: 'lime',
  },
  {
    id: 'community',
    number: '03',
    title: 'Найти своих',
    text: 'Объявления, мемы и отзывы о событиях.',
    symbol: '↔',
    color: 'peach',
  },
] as const
export function Home({
  onGo,
  onLife,
}: {
  onGo: (section: AppSection) => void
  onLife: (destination: LifeDestination) => void
}) {
  const { news, updatedAt } = useNews(),
    { user, wallet } = useCampus()
  return (
    <section className="home" aria-labelledby="home-title">
      <div className="home-hero">
        <div className="hero-copy">
          <span className="mono-label">
            <i />{t(" УУНиТ / студенческий кампус ")}</span>
          <h2 id="home-title">{t("Твой кампус. ")}<br />
            <span>{t("Твой ритм.")}</span>
          </h2>
          <p>{t("От первой пары до своих людей. ")}<br />{t("Всё, что нужно студенту, — в кармане. ")}</p>
          <div className="hero-actions">
            <button className="action-primary" type="button" onClick={() => onGo('navigation')}>{t("Найти аудиторию ")}<span>↗</span>
            </button>
            <button className="action-text" type="button" onClick={() => onGo('schedule')}>{t("Моё расписание → ")}</button>
          </div>
          <span className="hero-caption">{t("Уфа. Университет. Ты.")}</span>
        </div>
        <div className="hero-art" aria-label={t("Университет в кармане")}>
          <span className="art-corner">campus.run()</span>
          <div className="art-orbit" aria-hidden="true" />
          <div className="art-pocket">
            <img src={logo} alt={t("Фиолетовый символ УУНиТ в кармане")} width="310" height="310" />
          </div>
          <span className="art-sticker sticker-lime">{t("Пара ↗")}</span>
          <span className="art-sticker sticker-white">{t("Свои люди <3")}</span>
          <span className="art-coordinate">{t("Уфа / Карла Маркса, 12")}</span>
        </div>
      </div>
      <div className="home-shortcuts">
        {shortcuts.map((item) => (
          <button
            className={`home-shortcut tile-${item.color}`}
            key={item.id}
            type="button"
            onClick={() => onGo(item.id)}
          >
            <span className="tile-top">
              <small>{localize(item.number)}{t(" / каждый день")}</small>
              <i aria-hidden="true">{localize(item.symbol)}</i>
            </span>
            <strong>{localize(item.title)}</strong>
            <p>{localize(item.text)}</p>
            <span className="tile-link">{t("Открыть раздел →")}</span>
          </button>
        ))}
      </div>
      <div className="home-heading">
        <div>
          <span className="mono-label">{t("За пределами пар")}</span>
          <h3>{t("Больше, чем учёба.")}</h3>
        </div>
        <button className="action-text" type="button" onClick={() => onGo('student-life')}>{t("Студенческая жизнь ↗ ")}</button>
      </div>
      <div className="discovery-grid">
        <button
          className="discovery-clubs"
          type="button"
          onClick={() => onLife({ category: 'clubs', target: 'category' })}
        >
          <span className="mono-label">{t("Найди своё сообщество")}</span>
          <strong>{t("Есть интерес? ")}<br />{t("Есть свои. ")}</strong>
          <div className="orbit-tags" aria-hidden="true">
            <span>{t("код")}</span>
            <span>{t("танцы")}</span>
            <span>{t("спорт")}</span>
            <span>{t("наука")}</span>
          </div>
          <p>{localize(content.clubs.length)}{t(" сообществ. Выбирай по интересам.")}</p>
          <span className="tile-link">{t("Посмотреть клубы ↗")}</span>
        </button>
        <div className="discovery-stack">
          <button type="button" onClick={() => onGo('services')}>
            <span>₽</span>
            <div>
              <strong>{t("Стипендия, без загадок")}</strong>
              <p>{t("Предварительный расчёт и официальные правила.")}</p>
            </div>
            <i>↗</i>
          </button>
          <button type="button" onClick={() => onLife({ category: 'career', target: 'category' })}>
            <span>&lt;/&gt;</span>
            <div>
              <strong>{t("Первый шаг в карьеру")}</strong>
              <p>{t("Стажировки, курсы и соревнования.")}</p>
            </div>
            <i>↗</i>
          </button>
          <button
            type="button"
            onClick={() => onLife({ category: 'resources', target: 'category' })}
          >
            <span>☆</span>
            <div>
              <strong>{t("Студенческий открывает двери")}</strong>
              <p>{t("Скидки, возможности и полезные инструкции.")}</p>
            </div>
            <i>↗</i>
          </button>
        </div>
      </div>
      <div className="home-heading">
        <div>
          <span className="mono-label">{t("На связи с университетом")}</span>
          <h3>{t("Что нового?")}</h3>
        </div>
        <button
          className="action-text"
          type="button"
          onClick={() => onLife({ category: 'news', target: 'category' })}
        >{t("Все новости → ")}</button>
      </div>
      <div className="home-news">
        {news.slice(0, 3).map((item) => (
          <a
            href={item.sourceUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            key={item.id}
            onClick={() => {
              void awardActivity('news-read', item.id)
            }}
          >
            <div>
              {imageUrl(item.image) ? (
                <img
                  src={imageUrl(item.image)}
                  alt=""
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.visibility = 'hidden'
                  }}
                />
              ) : (
                <span aria-hidden="true">{t("УУ")}</span>
              )}
            </div>
            <small>{localize(item.sourceName)}</small>
            <h4>{item.title}</h4>
            <span>{t("Читать ↗")}</span>
          </a>
        ))}
      </div>
      <p className="home-feed-date">{t("Лента обновлена")}{' '}
        {localize(new Intl.DateTimeFormat(getLocale(), {
          day: 'numeric',
          month: 'long',
          timeZone: 'Asia/Yekaterinburg',
        }).format(new Date(updatedAt)))}{t(". Ссылки ведут к публикациям источников. ")}</p>
      <div className="home-forum">
        <div>
          <span className="mono-label">{t("Свои отвечают")}</span>
          <h3>{t("Есть вопрос? ")}<br />{t("Есть форум. ")}</h3>
          <p>{t("Спроси про зачёт, найди соседа по общежитию или собери команду на хакатон.")}</p>
          <button className="action-primary" type="button" onClick={() => onGo('forum')}>{t("Зайти на форум ↗ ")}</button>
        </div>
        <div className="forum-mini" aria-hidden="true">
          <span>community.ts</span>
          <p>
            <b>const</b> campus = &#123;
          </p>
          <p>{t(" люди: ")}<em>{t("\"свои\"")}</em>,
          </p>
          <p>{t(" вопросы: ")}<em>{t("\"любые\"")}</em>,
          </p>
          <p>{t(" помощь: ")}<em>true</em>
          </p>
          <p>&#125;</p>
        </div>
      </div>
      <div className="home-status">
        <p>
          <span className="status-dot" />
          {localize(user
            ? `${user.name}, у тебя ${wallet?.balance ?? 0} КБ. Продолжим?`
            : 'Собирай кампус-баллы за полезные действия.')}
        </p>
        <button type="button" onClick={() => openCampus(user ? 'points' : 'account')}>
          {localize(user ? 'Мой прогресс →' : 'Создать аккаунт →')}
        </button>
      </div>
    </section>
  )
}
