import { t, localize } from '../../shared/i18n/index.ts'
import type { RefObject } from 'react'
import { useCampus } from './client'
import { GamePanel } from './GamePanel'
import { FloatingWindow } from './FloatingWindow'
import styles from './CampusDock.module.css'

export function GamesWindow(props: {
  visible: boolean
  launcher: RefObject<HTMLButtonElement | null>
  onMinimize: () => void
  onClose: () => void
}) {
  const { user, error, refresh } = useCampus()
  return (
    <FloatingWindow title={t("Игры")} titleId="campus-games-title" closeLabel={t("Закрыть игры")} {...props}>
      {error && (
        <div className={styles.error} role="status">
          <p>{localize(error)}</p>
          <button type="button" onClick={() => void refresh()}>{t("Повторить соединение")}</button>
        </div>
      )}
      <GamePanel key={user?.id ?? 'guest'} />
    </FloatingWindow>
  )
}
