import { setLanguage, t } from './i18n/index.ts'
import { useLanguage } from './i18n/useLanguage.ts'
import styles from './LanguageSwitcher.module.css'

export function LanguageSwitcher() {
  const language = useLanguage()
  return (
    <div className={styles.switcher} role="group" aria-label={t('Язык сайта')} data-language={language}>
      <span className={styles.thumb} aria-hidden="true" />
      <button type="button" lang="ru" aria-label="Русский" aria-pressed={language === 'ru'} onClick={() => setLanguage('ru')}>RU</button>
      <button type="button" lang="en" aria-label="English" aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>EN</button>
    </div>
  )
}
