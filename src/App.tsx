import { t, localize } from './shared/i18n/index.ts'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import type { RoomId } from './shared/types'
import { ThemeSwitcher } from './shared/ThemeSwitcher'
import { QuickAccess, type LifeDestination } from './shared/QuickAccess'
import { applyTheme, readTheme, writeTheme, type Theme } from './shared/theme'
import brandLogo from './assets/pocket-uust-symbol.png'
import { sections, type AppSection } from './shared/sections'
import { categories } from './features/student-life/model'
import { Home } from './shared/Home'
import { CampusDock } from './features/campus/CampusDock'
import { AccountDialog } from './features/campus/AccountDialog'
import { PointsPage } from './features/campus/PointsPage'
import { api, openCampus, useCampus, type AuthConfig } from './features/campus/client'
import './shared/Home.css'
import { LanguageSwitcher } from './shared/LanguageSwitcher'
import { useLanguage } from './shared/i18n/useLanguage.ts'
const Navigation = lazy(() =>
  import('./features/navigation/Navigation').then((module) => ({ default: module.Navigation })),
)
const Schedule = lazy(() =>
  import('./features/schedule/Schedule').then((module) => ({ default: module.Schedule })),
)
const StudentLife = lazy(() =>
  import('./features/student-life/StudentLife').then((module) => ({ default: module.StudentLife })),
)
const CommunityHub = lazy(() =>
  import('./features/community').then((module) => ({ default: module.CommunityHub })),
)
const Forum = lazy(() =>
  import('./features/community').then((module) => ({ default: module.Forum })),
)
const StudentServices = lazy(() =>
  import('./features/services').then((module) => ({ default: module.StudentServices })),
)

export default function App() {
  useLanguage()
  const [section, setSection] = useState<AppSection>('home')
  const { user, loading } = useCampus()
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  useEffect(() => {
    void api<AuthConfig>('/api/campus/auth/config')
      .then((config) => setRegistrationEnabled(config.registrationEnabled !== false))
      .catch(() => {})
  }, [])
  const [account, setAccount] = useState<{
    mode: 'login' | 'register'
    returnFocus: HTMLElement | null
  } | null>(null)
  const [roomId, setRoomId] = useState<RoomId | null>(null)
  const navigationButton = useRef<HTMLButtonElement>(null)
  const [theme, setTheme] = useState(readTheme)
  const [themeMessage, setThemeMessage] = useState('')
  const [lifeEntry, setLifeEntry] = useState<(LifeDestination & { version: number }) | null>(null)
  function showAccount(mode: 'login' | 'register') {
    window.dispatchEvent(new Event('campus-account-open'))
    setAccount({
      mode,
      returnFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
    })
  }
  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<string | { tab: string; mode?: string }>).detail
      const tab = typeof detail === 'string' ? detail : detail?.tab
      if (tab === 'account')
        showAccount(typeof detail === 'object' && detail.mode === 'register' ? 'register' : 'login')
      if (tab === 'points') {
        setSection('points')
        setRoomId(null)
        setLifeEntry(null)
        document.getElementById('content')?.focus()
      }
    }
    window.addEventListener('campus-open', onOpen)
    return () => window.removeEventListener('campus-open', onOpen)
  }, [])
  useEffect(() => {
    const navigate = (event: Event) => {
      const detail = (
        event as CustomEvent<
          AppSection | { section: AppSection; category: LifeDestination['category'] }
        >
      ).detail
      const section = typeof detail === 'string' ? detail : detail?.section
      if (sections.some((entry) => entry.id === section)) {
        setSection(section)
        setRoomId(null)
        if (
          section === 'student-life' &&
          typeof detail === 'object' &&
          categories.some((item) => item.id === detail.category)
        )
          setLifeEntry((previous) => ({
            category: detail.category,
            target: 'category',
            version: (previous?.version ?? 0) + 1,
          }))
        else setLifeEntry(null)
        document.getElementById('content')?.focus()
      }
    }
    window.addEventListener('assistant-navigate', navigate)
    return () => window.removeEventListener('assistant-navigate', navigate)
  }, [])
  function changeTheme(next: Theme) {
    setTheme(next)
    applyTheme(next)
    setThemeMessage(
      writeTheme(next) ? '' : 'Тема применена. Браузер не разрешил сохранить выбор после закрытия.',
    )
  }
  function openLife(destination: LifeDestination) {
    setLifeEntry((previous) => ({ ...destination, version: (previous?.version ?? 0) + 1 }))
    setSection('student-life')
    setRoomId(null)
  }

  function showRoom(id: RoomId) {
    setRoomId(id)
    setSection('navigation')
    navigationButton.current?.focus()
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#content">{t("Перейти к содержимому ")}</a>
      <header className="header">
        <button
          type="button"
          className="brand brand-button"
          onClick={() => setSection('home')}
          aria-label={t("PocketUUST — на главную")}
        >
          <img className="brand-logo" src={brandLogo} alt="" width="56" height="56" />
          <div>
            <h1>
              PocketUUST<span>↗</span>
            </h1>
            <p>{t("УУНиТ в кармане")}</p>
          </div>
        </button>
        <div className="header-tools">
          <LanguageSwitcher />
          <ThemeSwitcher theme={theme} onChange={changeTheme} />
          {loading ? (
            <span className="account-loading" aria-hidden="true" />
          ) : user ? (
            <button className="profile-button" type="button" onClick={() => openCampus('account')}>{t("Профиль ")}<span aria-hidden="true">↗</span>
            </button>
          ) : (
            <div className="account-actions">
              <button
                className="profile-button"
                type="button"
                onClick={() => openCampus('account', 'login')}
              >{t("Войти ")}</button>
              {registrationEnabled && (
                <button
                  className="profile-button register-button"
                  type="button"
                  onClick={() => openCampus('account', 'register')}
                >{t("Зарегистрироваться ")}</button>
              )}
            </div>
          )}
        </div>
      </header>
      {themeMessage && (
        <p className="theme-message" role="status">
          {localize(themeMessage)}
        </p>
      )}
      <nav className="sections" aria-label={t("Разделы сайта")}>
        {sections.map((item) => (
          <button
            key={item.id}
            type="button"
            ref={item.id === 'navigation' ? navigationButton : undefined}
            aria-pressed={section === item.id}
            aria-controls="content"
            onClick={() => {
              setSection(item.id)
              setRoomId(null)
              setLifeEntry(null)
            }}
          >
            {localize(item.label)}
          </button>
        ))}
      </nav>
      <div className={`site-layout section-${section}`}>
        <main
          id="content"
          className={`content ${section === 'home' ? 'home-content' : ''}`}
          tabIndex={-1}
        >
          <Suspense
            fallback={
              <p role="status" className="section-loading">{t("Открываем раздел… ")}</p>
            }
          >
            {section === 'home' && <Home onGo={setSection} onLife={openLife} />}
            {section === 'navigation' && <Navigation requestedRoomId={roomId} />}
            {section === 'schedule' && <Schedule onShowRoom={showRoom} />}
            {section === 'student-life' && (
              <StudentLife
                key={lifeEntry?.version ?? 0}
                initialCategory={lifeEntry?.category}
                focusTarget={lifeEntry?.target}
              />
            )}
            {section === 'community' && <CommunityHub />}
            {section === 'services' && <StudentServices />}
            {section === 'forum' && <Forum />}
            {section === 'points' && <PointsPage />}
          </Suspense>
        </main>
        <QuickAccess onOpen={openLife} />
      </div>
      <footer>
        <div>
          <strong>PocketUUST</strong>
          <span>{t("Сделано студентами для студентов.")}</span>
        </div>
        <p>{t("Студенческий проект, не официальный сервис УУНиТ. Источники, дата обновления и ограничения указаны в разделах. ")}</p>
      </footer>
      <CampusDock />
      {account && (
        <AccountDialog
          key={account.mode}
          mode={account.mode}
          returnFocus={account.returnFocus}
          onClose={() => setAccount(null)}
        />
      )}
    </div>
  )
}
