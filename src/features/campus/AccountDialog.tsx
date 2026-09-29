import { t } from '../../shared/i18n/index.ts'
import { useEffect, useRef } from 'react'
import { AccountPanel } from './AccountPanel'
import styles from './AccountDialog.module.css'

export function AccountDialog({
  mode,
  onClose,
  returnFocus,
}: {
  mode: 'login' | 'register'
  onClose: () => void
  returnFocus: HTMLElement | null
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    closeButton.current?.focus()
    return () => {
      element?.close()
      returnFocus?.focus()
    }
  }, [returnFocus])
  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby="account-dialog-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <header className={styles.header}>
        <strong id="account-dialog-title">{t("Аккаунт PocketUUST")}</strong>
        <button ref={closeButton} type="button" onClick={onClose} aria-label={t("Закрыть аккаунт")}>
          ×
        </button>
      </header>
      <div className={styles.content}>
        <AccountPanel key={mode} initialMode={mode} />
      </div>
    </dialog>
  )
}
