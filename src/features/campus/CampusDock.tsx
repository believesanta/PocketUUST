import { t, localize } from '../../shared/i18n/index.ts'
import { useEffect, useRef, useState } from 'react'
import { AssistantWindow } from './AssistantWindow'
import { GamesWindow } from './GamesWindow'
import type { DockTab } from './client'
import styles from './CampusDock.module.css'

type WindowTab = Extract<DockTab, 'game' | 'assistant'>

export function CampusDock() {
  const [active, setActive] = useState<WindowTab | null>(null)
  const [mounted, setMounted] = useState({ game: false, assistant: false })
  const [toast, setToast] = useState('')
  const gameButton = useRef<HTMLButtonElement>(null)
  const assistantButton = useRef<HTMLButtonElement>(null)

  function show(next: WindowTab) {
    setMounted((previous) => ({ ...previous, [next]: true }))
    setActive(next)
  }
  function toggle(next: WindowTab) {
    if (active === next) setActive(null)
    else show(next)
  }
  function close(next: WindowTab) {
    setActive((previous) => previous === next ? null : previous)
    setMounted((previous) => ({ ...previous, [next]: false }))
  }

  useEffect(() => {
    const onOpen = (event: Event) => {
      const next = (event as CustomEvent<DockTab>).detail
      if (next === 'game' || next === 'assistant') show(next)
    }
    const onReward = (event: Event) => setToast((event as CustomEvent<string>).detail)
    const onNavigate = () => setActive(null)
    window.addEventListener('campus-open', onOpen)
    window.addEventListener('campus-reward', onReward)
    window.addEventListener('assistant-navigate', onNavigate)
    window.addEventListener('campus-account-open', onNavigate)
    return () => {
      window.removeEventListener('campus-open', onOpen)
      window.removeEventListener('campus-reward', onReward)
      window.removeEventListener('assistant-navigate', onNavigate)
      window.removeEventListener('campus-account-open', onNavigate)
    }
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 5000)
    return () => clearTimeout(timer)
  }, [toast])

  return (
    <aside className={styles.dock} aria-label={t("Игры и помощник")}>
      {toast && <p className={styles.toast} role="status">{localize(toast)}</p>}
      {mounted.game && (
        <GamesWindow
          visible={active === 'game'}
          launcher={gameButton}
          onMinimize={() => setActive(null)}
          onClose={() => close('game')}
        />
      )}
      {mounted.assistant && (
        <AssistantWindow
          visible={active === 'assistant'}
          launcher={assistantButton}
          onMinimize={() => setActive(null)}
          onClose={() => close('assistant')}
        />
      )}
      <div className={styles.launcher}>
        <button
          ref={gameButton}
          className={styles.gameButton}
          type="button"
          onClick={() => toggle('game')}
          aria-label={localize(active === 'game' ? 'Свернуть игры' : 'Открыть игры')}
          aria-expanded={active === 'game'}
        >
          <span className={styles.gameIcon} aria-hidden="true" />
          <span>{t("Игры")}</span>
        </button>
        <button
          ref={assistantButton}
          className={styles.chatButton}
          type="button"
          onClick={() => toggle('assistant')}
          aria-label={localize(active === 'assistant' ? 'Свернуть помощника Карман' : 'Открыть помощника Карман')}
          aria-expanded={active === 'assistant'}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z" />
            <path d="M7 9h10M7 13h6" />
          </svg>
          <span>{t("Помощник")}</span>
        </button>
      </div>
    </aside>
  )
}
