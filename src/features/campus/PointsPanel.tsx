import { t, localize } from '../../shared/i18n/index.ts'
import { useEffect, useState } from 'react'
import { api, useCampus, openCampus } from './client'
import styles from './CampusDock.module.css'
interface Ranking {
  users: Array<{ id: number; name: string; earned: number; floor: number }>
  total: number
}
const floors = [0, 30, 80, 150, 250]
export function PointsPanel() {
  const { user, wallet, refresh } = useCampus(),
    [ranking, setRanking] = useState<Ranking | null>(null),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    const load = () => {
      void api<Ranking>('/api/campus/leaderboard')
        .then((result) => {
          if (active) setRanking(result)
        })
        .catch((error) => {
          if (active) setMessage(error.message)
        })
    }
    load()
    const timer = setInterval(load, 30000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [wallet?.earned])
  async function redeem() {
    setBusy(true)
    setMessage('')
    try {
      const result = await api<{ message: string }>('/api/campus/redeem', {
        method: 'POST',
        body: { item: 'hoodie' },
      })
      await refresh()
      setMessage(result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Обмен не выполнен.')
    } finally {
      setBusy(false)
    }
  }
  const floor = wallet?.floor ?? 1,
    earned = wallet?.earned ?? 0,
    start = floors[floor - 1],
    end = floors[floor] ?? 250
  return (
    <div className={styles.panel}>
      <div className={styles.wallet}>
        <span className={styles.kicker}>{t("Кампус-баллы")}</span>
        <strong>
          {localize(user ? (wallet?.balance ?? 0) : '—')}
          <span>{localize(user ? 'КБ' : 'гость')}</span>
        </strong>
        <p>{localize(user ? `${user.name} · ${floor} этаж` : 'Войди, чтобы копить баллы')}</p>
      </div>
      <div className={styles.floorStrip} aria-label={localize(user ? `Уровень: ${floor} этаж из пяти` : 'Этажи и пороги баллов')}>
        {floors.map((threshold, index) => (
          <div key={threshold} data-complete={Boolean(user && index < floor)}>
            <span>{localize(index + 1)}</span>
            <small>{localize(threshold)}{t(" КБ")}</small>
          </div>
        ))}
      </div>
      {user && (
        <progress
          max={Math.max(1, end - start)}
          value={floor === 5 ? 1 : Math.min(end - start, earned - start)}
          aria-label={t("Прогресс до следующего этажа")}
        />
      )}
      <p className={styles.note}>
        {localize(!user
          ? 'После входа здесь появится твой прогресс.'
          : floor === 5
          ? 'Пятый этаж! Продолжай копить на мерч.'
          : `До ${floor + 1} этажа — ещё ${end - earned} баллов.`)}{' '}{t("Этаж сохраняется после трат. ")}</p>
      {!user && (
        <button className={styles.primary} type="button" onClick={() => openCampus('account')}>{t("Войти и начать → ")}</button>
      )}
      <details className={styles.rules}>
        <summary>{t("За что начисляются баллы?")}</summary>
        <dl>
          <div>
            <dt>{t("Прочитать новость")}</dt>
            <dd>+3</dd>
          </div>
          <div>
            <dt>{t("Сохранить новость")}</dt>
            <dd>+1</dd>
          </div>
          <div>
            <dt>{t("Построить новый маршрут")}</dt>
            <dd>+2</dd>
          </div>
          <div>
            <dt>{t("Пройти мини-игру")}</dt>
            <dd>+25</dd>
          </div>
        </dl>
        <p>{t("Новости учитываются один раз. Разные маршруты — раз в день. Награда за игру — один раз в день по времени Уфы. ")}</p>
      </details>
      <div className={styles.ticket}>
        <span className={styles.kicker}>{t("Форум → билеты")}</span>
        <h4>
          {localize(user ? (wallet?.tickets ?? 0) + ' билетов' : 'Билеты за активность')}{' '}
          <span>{t("· демонстрация")}</span>
        </h4>
        <p>
          {localize(user ? `${wallet?.forumPoints ?? 0} форумных баллов за месяц. ` : '')}{t("Тема +5, ответ +2. Каждые 50 баллов превращаются в билет после завершения месяца. ")}</p>
        {user && (
          <progress
            max={50}
            value={(wallet?.forumPoints ?? 0) % 50}
            aria-label={t("Баллы до следующего билета")}
          />
        )}
        <small>{t("До 3 тем и 10 ответов в день. Реальный розыгрыш не подключён.")}</small>
      </div>
      <div className={styles.merch}>
        <div className={styles.hoodie} aria-hidden="true">{t("УУ")}<span>{t("НИТ")}</span>
        </div>
        <div>
          <span className={styles.kicker}>{t("Мерч кампуса")}</span>
          <h4>{t("Худи за 500 КБ")}</h4>
          <p>{t("Попробуй обмен баллов. Это демонстрация, реальная выдача не подключена.")}</p>
          <button
            type="button"
            disabled={busy || !user || (wallet?.balance ?? 0) < 500}
            onClick={() => void redeem()}
          >
            {localize(busy ? 'Обмен…' : 'Обменять 500 КБ')}
          </button>
        </div>
      </div>
      <h4 className={styles.listTitle}>{t("Активные студенты ")}<span>{t("общий рейтинг")}</span>
      </h4>
      {ranking?.users.length ? (
        <ol className={styles.ranking}>
          {ranking.users.slice(0, 10).map((person) => (
            <li key={person.id} data-you={user?.id === person.id}>
              <span>
                {person.name}
                {localize(user?.id === person.id ? ' · ты' : '')}
              </span>
              <strong>{localize(person.earned)}{t(" КБ")}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className={styles.note}>
          {localize(ranking ? 'Пока никого. Стань первым.' : 'Загружаем рейтинг…')}
        </p>
      )}
      {wallet?.activity.length ? (
        <details className={styles.rules}>
          <summary>{t("Последние начисления")}</summary>
          <ul className={styles.activity}>
            {wallet.activity.slice(0, 10).map((item, index) => (
              <li key={`${item.createdAt}-${index}`}>
                <span>{localize(item.label)}</span>
                <strong>
                  {localize(item.points > 0 ? '+' : '')}
                  {localize(item.points)}
                </strong>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {message && (
        <p role="status" className={styles.notice}>
          {localize(message)}
        </p>
      )}
    </div>
  )
}
