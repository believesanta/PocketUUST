import { t, localize } from '../../shared/i18n/index.ts'
import { PointsPanel } from './PointsPanel'
import { useCampus } from './client'

export function PointsPage() {
  const { error, refresh } = useCampus()

  return (
    <section className="points-page" aria-labelledby="points-page-title">
      <header className="points-page-header">
        <span>{t("Личный кампус")}</span>
        <h2 id="points-page-title">{t("Баллы")}</h2>
        <p>{t("Прогресс, рейтинг и награды за активность на сайте.")}</p>
      </header>
      {error && (
        <div className="points-page-error" role="status">
          <p>{localize(error)}</p>
          <button type="button" onClick={() => void refresh()}>{t("Повторить соединение ")}</button>
        </div>
      )}
      <PointsPanel />
    </section>
  )
}
