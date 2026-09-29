import { t, localize } from '../../../shared/i18n/index.ts'
import { useEffect, useRef, useState } from 'react'
import { ForumIcon } from './ForumIcon'
import { problem } from './types'
import s from './Forum.module.css'
export function ConfirmDelete({
  reply = false,
  onDelete,
  onClose,
}: {
  reply?: boolean
  onDelete: () => Promise<void>
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const element = dialog.current
    element?.showModal()
    return () => {
      element?.close()
      if (previous?.isConnected) previous.focus()
    }
  }, [])
  async function confirm() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onDelete()
      onClose()
    } catch (error) {
      setError(problem(error))
      setBusy(false)
    }
  }
  return (
    <dialog
      ref={dialog}
      className={s.confirm}
      aria-labelledby="delete-heading"
      aria-describedby="delete-description"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
    >
      <span className={s.deleteBadge}>
        <ForumIcon name="trash" size={24} />
      </span>
      <h2 id="delete-heading">{t("Удалить ")}{localize(reply ? 'ответ' : 'обсуждение')}?</h2>
      <p id="delete-description">
        {localize(reply
          ? 'Ваш ответ исчезнет из разговора. Отменить это действие нельзя.'
          : 'Публикация и все ответы исчезнут из форума, в том числе из избранного у других участников. Отменить это действие нельзя.')}
      </p>
      {error && (
        <p className={s.error} role="alert">
          {localize(error)}
        </p>
      )}
      <div className={s.confirmActions}>
        <button autoFocus disabled={busy} onClick={onClose}>{t("Оставить ")}</button>
        <button className={s.danger} disabled={busy} onClick={() => void confirm()}>
          {localize(busy ? 'Удаляем…' : 'Удалить')}
        </button>
      </div>
    </dialog>
  )
}
