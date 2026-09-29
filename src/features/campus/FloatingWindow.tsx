import { useEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react'
import styles from './CampusDock.module.css'
import { t, getLanguage, type Language } from '../../shared/i18n/index.ts'

interface FloatingWindowProps {
  language?: Language
  title: string
  titleId: string
  closeLabel: string
  visible: boolean
  launcher: RefObject<HTMLButtonElement | null>
  onMinimize: () => void
  onClose: () => void
  children: ReactNode
}

export function FloatingWindow({
  title, titleId, closeLabel, visible, launcher, onMinimize, onClose, children, language = getLanguage(),
}: FloatingWindowProps) {
  const windowRef = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  const drag = useRef<{ id: number; x: number; y: number; left: number; top: number } | null>(null)
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (visible) closeButton.current?.focus()
  }, [visible])

  useEffect(() => {
    const element = windowRef.current
    if (!element || !visible) return
    const keepVisible = () => {
      if (window.matchMedia('(max-width: 600px)').matches) {
        setPosition(null)
        return
      }
      setPosition((previous) => {
        if (!previous) return null
        const { width, height } = element.getBoundingClientRect()
        const left = Math.max(8, Math.min(previous.left, window.innerWidth - width - 8))
        const top = Math.max(8, Math.min(previous.top, window.innerHeight - height - 8))
        return left === previous.left && top === previous.top ? previous : { left, top }
      })
    }
    const observer = new ResizeObserver(keepVisible)
    observer.observe(element)
    window.addEventListener('resize', keepVisible)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', keepVisible)
    }
  }, [visible])

  function startDrag(event: PointerEvent<HTMLElement>) {
    if (
      event.pointerType !== 'mouse' || event.button !== 0 ||
      window.matchMedia('(max-width: 600px)').matches ||
      (event.target as HTMLElement).closest('button') || !windowRef.current
    ) return
    const rect = windowRef.current.getBoundingClientRect()
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
  }

  function moveDrag(event: PointerEvent<HTMLElement>) {
    if (!drag.current || drag.current.id !== event.pointerId || !windowRef.current) return
    const { x, y, left, top } = drag.current
    const rect = windowRef.current.getBoundingClientRect()
    setPosition({
      left: Math.max(8, Math.min(window.innerWidth - rect.width - 8, left + event.clientX - x)),
      top: Math.max(8, Math.min(window.innerHeight - rect.height - 8, top + event.clientY - y)),
    })
  }

  function stopDrag(event: PointerEvent<HTMLElement>) {
    if (drag.current?.id === event.pointerId) drag.current = null
  }

  return (
    <div
      ref={windowRef}
      lang={language}
      className={styles.window}
      hidden={!visible}
      style={position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onMinimize()
          launcher.current?.focus()
        }
      }}
    >
      <header
        className={`${styles.windowHeader} ${styles.draggableHeader}`}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        <div>
          <span className={styles.online} aria-hidden="true" />
          <span className={styles.windowTitle}>
            <strong id={titleId}>{t(title, language)}</strong>
            <small>{t('Перетащите · размер ↘', language)}</small>
          </span>
        </div>
        <button
          ref={closeButton}
          type="button"
          onClick={() => { onClose(); launcher.current?.focus() }}
          aria-label={t(closeLabel, language)}
        >×</button>
      </header>
      <div className={styles.scroll}>{children}</div>
    </div>
  )
}
