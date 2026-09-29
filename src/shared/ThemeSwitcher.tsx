import { t, localize } from './i18n/index.ts'
import type { Theme } from './theme'

const themes = [
  { id: 'light', label: 'Светлая' },
  { id: 'dark', label: 'Тёмная' },
  { id: 'uunit', label: 'УУНиТ' },
  { id: 'pixel', label: 'Пиксель' },
] as const
export function ThemeSwitcher({
  theme,
  onChange,
}: {
  theme: Theme
  onChange: (theme: Theme) => void
}) {
  return (
    <div className="theme-switcher" role="group" aria-label={t("Тема сайта")}>
      {themes.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={theme === item.id}
          aria-label={localize(`Тема: ${item.label}`)}
          onClick={() => onChange(item.id)}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {item.id === 'light' ? (
              <>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
              </>
            ) : item.id === 'dark' ? (
              <path d="M20 15.3A9 9 0 0 1 8.7 4 9 9 0 1 0 20 15.3Z" />
            ) : item.id === 'pixel' ? (
              <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM15 15h6v6h-6z" />
            ) : (
              <>
                <path d="m3 8 9-5 9 5-9 5-9-5Zm3 2v7c4 3 8 3 12 0v-7M21 8v8" />
              </>
            )}
          </svg>
          <span>{localize(item.label)}</span>
        </button>
      ))}
    </div>
  )
}
