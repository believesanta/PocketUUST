import { t, localize, getLocale } from '../../shared/i18n/index.ts'
import { useEffect, useState, type FormEvent } from 'react'
import {
  api,
  changeAccount,
  verifyAccount,
  useCampus,
  type AuthConfig,
  type VerificationRequired,
} from './client'
import styles from './CampusDock.module.css'

export function AccountPanel({ initialMode = 'login' }: { initialMode?: 'login' | 'register' }) {
  const { user } = useCampus()
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>(initialMode)
  const [verifyFrom, setVerifyFrom] = useState<'login' | 'register'>(initialMode)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [challenge, setChallenge] = useState<VerificationRequired | null>(null)
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [clock, setClock] = useState(Date.now())

  useEffect(() => {
    let active = true
    void api<AuthConfig>('/api/campus/auth/config')
      .then((value) => {
        if (active) {
          setConfig(value)
          if (value.registrationEnabled === false) setMode((current) => current === 'register' ? 'login' : current)
        }
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    if (!challenge) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [challenge])

  function switchMode(next: 'login' | 'register') {
    setMode(next)
    setChallenge(null)
    setPassword('')
    setConfirmPassword('')
    setCode('')
    setMessage('')
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (mode === 'verify') return
    if (mode === 'register' && password !== confirmPassword) {
      setMessage('Пароли не совпадают.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      const result = await changeAccount(mode, {
        login: email.trim().toLowerCase(),
        password,
        ...(mode === 'register' ? { name: name.trim() } : {}),
      })
      setPassword('')
      setConfirmPassword('')
      if (result) {
        setVerifyFrom(mode)
        setChallenge(result)
        setClock(Date.now())
        setCode('')
        setMode('verify')
        setMessage(
          config?.testEmailCode
            ? `Тестовый код: ${config.testEmailCode}. Письмо не отправляется.`
            : `Код отправлен на ${result.email}.`,
        )
      } else setMessage('Вы вошли. Баллы синхронизированы.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось выполнить запрос.')
    } finally {
      setBusy(false)
    }
  }

  async function verify(event: FormEvent) {
    event.preventDefault()
    if (!challenge) return
    setBusy(true)
    setMessage('')
    try {
      await verifyAccount(challenge.challengeId, code)
      setChallenge(null)
      setCode('')
      setMessage('Почта подтверждена. Добро пожаловать!')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось подтвердить почту.')
    } finally {
      setBusy(false)
    }
  }

  async function resend() {
    if (!challenge) return
    setBusy(true)
    setMessage('')
    try {
      const result = await api<VerificationRequired>('/api/campus/auth/resend-code', {
        method: 'POST',
        body: { challengeId: challenge.challengeId },
      })
      setChallenge(result)
      setClock(Date.now())
      setCode('')
      setMessage(
        config?.testEmailCode
          ? `Тестовый код: ${config.testEmailCode}.`
          : 'Новый код отправлен. Прежний код больше не действует.',
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось отправить код.')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    try {
      await changeAccount('logout')
      switchMode('login')
      setMessage('Вы вышли из аккаунта.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Не удалось выйти.')
    } finally {
      setBusy(false)
    }
  }

  const wait = challenge
    ? Math.max(0, Math.ceil((Date.parse(challenge.resendAvailableAt) - clock) / 1000))
    : 0
  const anyEmail = config?.emailDomains.includes('*') ?? false
  const domains = anyEmail
    ? 'Можно использовать любую почту'
    : (config?.emailDomains.map((domain) => `@${domain}`).join(', ') ?? 'загрузка…')
  return (
    <div className={styles.panel}>
      {user ? (
        <>
          <span className={styles.kicker}>{t("Личный профиль")}</span>
          <h3>{user.name}</h3>
          <p className={styles.email}>{user.login}</p>
          <p className={styles.note}>{t("Почта подтверждена. Баллы и сообщения форума сохраняются в этом аккаунте. ")}</p>
          <button type="button" disabled={busy} onClick={() => void logout()}>{t("Выйти из аккаунта ")}</button>
        </>
      ) : mode === 'verify' && challenge ? (
        <>
          <span className={styles.kicker}>{t("Подтверждение почты")}</span>
          <h3>{t("Введите код")}</h3>
          <p className={styles.note}>
            {localize(config?.testEmailCode
              ? `Тестовый режим: введи ${config.testEmailCode}. Письмо не отправляется.`
              : `Мы отправили письмо на ${challenge.email}.`)}{' '}{t("Код действует до")}{' '}
            {localize(new Date(challenge.expiresAt).toLocaleTimeString(getLocale(), {
              hour: '2-digit',
              minute: '2-digit',
            }))}
            .
          </p>
          <form className={styles.form} onSubmit={(event) => void verify(event)}>
            <div>
              <label htmlFor="campus-code">
                {localize(config?.testEmailCode ? 'Тестовый код' : 'Шесть цифр из письма')}
              </label>
              <input
                id="campus-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <button
              className={styles.primary}
              type="submit"
              disabled={busy || Date.parse(challenge.expiresAt) <= clock}
            >
              {localize(busy ? 'Подождите…' : 'Подтвердить почту →')}
            </button>
          </form>
          <button type="button" disabled={busy || wait > 0} onClick={() => void resend()}>
            {localize(wait ? `Отправить повторно через ${wait} с` : 'Отправить код повторно')}
          </button>{' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              switchMode(verifyFrom)
              setEmail('')
            }}
          >{t("Изменить почту ")}</button>
        </>
      ) : (
        <>
          <span className={styles.kicker}>{t("Свой человек в кампусе")}</span>
          <h3>{localize(mode === 'register' ? 'Присоединяйся' : 'С возвращением')}</h3>
          <p className={styles.note}>
            {localize(anyEmail ? 'Почта' : 'Студенческая почта')}{t(" и отдельный пароль PocketUUST. Никогда не вводи пароль от ИСУ. ")}</p>
          <div className={styles.segment}>
            <button
              type="button"
              aria-pressed={mode === 'login'}
              onClick={() => switchMode('login')}
            >{t("Вход ")}</button>
            {config?.registrationEnabled !== false && (
              <button
                type="button"
                aria-pressed={mode === 'register'}
                onClick={() => switchMode('register')}
              >{t("Регистрация ")}</button>
            )}
          </div>
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            {mode === 'register' && (
              <div>
                <label htmlFor="campus-name">{t("Имя в рейтинге и на форуме")}</label>
                <input
                  id="campus-name"
                  autoComplete="nickname"
                  required
                  minLength={2}
                  maxLength={config?.nameMaxLength ?? 80}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("Как тебя называть?")}
                />
              </div>
            )}
            <div>
              <label htmlFor="campus-email">{localize(anyEmail ? 'Электронная почта' : 'Студенческая почта')}</label>
              <input
                id="campus-email"
                type="email"
                autoComplete="username"
                required
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={
                  localize(anyEmail
                    ? 'name@example.com'
                    : config?.emailDomains[0]
                      ? `login@${config.emailDomains[0]}`
                      : 'Студенческая почта')
                }
                aria-describedby="campus-email-hint"
              />
              <small id="campus-email-hint">{localize(anyEmail ? domains : `Доступные домены: ${domains}`)}</small>
            </div>
            <div>
              <label htmlFor="campus-password">{t("Пароль PocketUUST")}</label>
              <input
                id="campus-password"
                type="password"
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'register' ? (config?.passwordMinLength ?? 15) : 1}
                maxLength={config?.passwordMaxLength ?? 128}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {mode === 'register' && (
                <small>{t("Не меньше ")}{localize(config?.passwordMinLength ?? 15)}{t(" символов.")}</small>
              )}
            </div>
            {mode === 'register' && (
              <div>
                <label htmlFor="campus-password-confirm">{t("Повторите пароль")}</label>
                <input
                  id="campus-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>
            )}
            <button className={styles.primary} disabled={busy} type="submit">
              {localize(busy ? 'Подождите…' : mode === 'register' ? 'Получить код →' : 'Войти →')}
            </button>
          </form>
          <p className={styles.notice}>{t("Подтверждение кода проверяет доступ к почтовому ящику. PocketUUST не является официальной системой авторизации УУНиТ. ")}</p>
        </>
      )}
      {message && (
        <p role="status" className={styles.notice}>
          {localize(message)}
        </p>
      )}
    </div>
  )
}
