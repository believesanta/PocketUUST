import { t, localize } from '../../shared/i18n/index.ts'
import { useEffect, useState } from 'react'
import { api, useCampus, openCampus } from './client'
import styles from './CampusDock.module.css'
export function GamePanel() {
  const { user, wallet, refresh } = useCampus(),
    [challenge, setChallenge] = useState<string | null>(null),
    [clicks, setClicks] = useState(0),
    [started, setStarted] = useState<number | null>(null),
    [elapsed, setElapsed] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [complete, setComplete] = useState(false),
    [practice, setPractice] = useState(false)
  useEffect(() => {
    if (started === null) return
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 250)
    return () => clearInterval(timer)
  }, [started])
  async function start() {
    setBusy(true)
    setMessage('')
    try {
      const training = !user || wallet?.gameAvailable === false
      setPractice(training)
      setChallenge(null)
      if (!training) {
        const data = await api<{ challengeId: string }>('/api/campus/game/start', {
          method: 'POST',
        })
        setChallenge(data.challengeId)
      }
      setStarted(Date.now())
      setClicks(0)
      setComplete(false)
      setElapsed(0)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось начать.')
    } finally {
      setBusy(false)
    }
  }
  async function finish() {
    if (practice) {
      setComplete(true)
      setMessage(
        user
          ? 'Пять этажей пройдены! Сегодняшняя награда уже получена.'
          : 'Пять этажей пройдены! Войди, чтобы получать награды за следующие игры.',
      )
      return
    }
    setBusy(true)
    try {
      const result = await api<{ message: string }>('/api/campus/game/finish', {
        method: 'POST',
        body: { challengeId: challenge, clicks },
      })
      await refresh()
      setComplete(true)
      setMessage(result.message)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Награда пока не получена.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className={styles.panel}>
      <span className={styles.kicker}>{t("Перерыв между парами")}</span>
      <h3>{t("Пять этажей")}</h3>
      <p className={styles.note}>{t("Собери 40 шагов и поднимись на крышу кампуса. Один клик — один шаг. Можно играть мышью, Enter или пробелом. ")}</p>
      <div className={styles.gameScene}>
        <div className={styles.gameSky} aria-hidden="true">
          ✦<span>✧</span>✦
        </div>
        <div className={styles.gameBuilding} aria-hidden="true">
          {[5, 4, 3, 2, 1].map((floor) => (
            <div key={floor} data-on={clicks >= (floor - 1) * 8 + 1}>
              <span>{localize(floor)}</span>
              {[0, 1, 2, 3].map((window) => (
                <i key={window} />
              ))}
            </div>
          ))}
        </div>
        <div className={styles.gameGround} />
        <strong>{localize(complete ? 'Крыша кампуса!' : `${clicks} / 40 шагов`)}</strong>
      </div>
      <progress max={40} value={clicks} aria-label={t("Шаги мини-игры")} />
      {started === null ? (
        <button
          className={styles.primary}
          type="button"
          disabled={busy}
          onClick={() => void start()}
        >
          {localize(busy ? 'Готовим кампус…' : 'Начать подъём →')}
        </button>
      ) : clicks < 40 ? (
        <button
          className={`${styles.primary} ${styles.clicker}`}
          type="button"
          onClick={() => setClicks((value) => Math.min(40, value + 1))}
        >{t("Шаг вверх ↑ ")}<small>{localize(Math.min(5, Math.floor(clicks / 8) + 1))}{t(" этаж")}</small>
        </button>
      ) : complete ? (
        <button type="button" disabled={busy} onClick={() => void start()}>{t("Сыграть ещё раз ")}</button>
      ) : (
        <button
          className={styles.primary}
          type="button"
          disabled={busy || (!practice && elapsed < 5)}
          onClick={() => void finish()}
        >
          {localize(busy
            ? 'Проверяем…'
            : !practice && elapsed < 5
              ? `Ещё ${Math.ceil(5 - elapsed)} сек…`
              : !practice
                ? 'Завершить · награда +25'
                : 'Завершить игру')}
        </button>
      )}
      <p className={styles.note}>
        {localize(!user
          ? 'Играй без входа. Баллы начисляются только в аккаунте.'
          : wallet?.gameAvailable
            ? 'За первое прохождение сегодня — +25 КБ.'
            : 'Сегодня награда уже получена. Можно играть для отдыха.')}
      </p>
      {!user && (
        <button type="button" onClick={() => openCampus('account')}>{t("Войти в аккаунт ")}</button>
      )}
      {message && (
        <p className={styles.notice} role="status">
          {localize(message)}
        </p>
      )}
    </div>
  )
}
