export type Theme = 'light' | 'dark' | 'uunit' | 'pixel'
export const THEME_KEY = 'pocketuust.theme.v1'
type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>
export function readTheme(storage?: Pick<Storage, 'getItem'>): Theme {
  try {
    const store = storage ?? localStorage
    const value = store.getItem(THEME_KEY)
    if (value === 'light' || value === 'dark' || value === 'uunit' || value === 'pixel')
      return value
    if (value === null && store.getItem('pocketuust.navigation.theme.v1') === 'dark') return 'dark'
  } catch {
    /* A theme still works when storage is unavailable. */
  }
  return 'light'
}
export function writeTheme(theme: Theme, storage?: ThemeStorage): boolean {
  try {
    ;(storage ?? localStorage).setItem(THEME_KEY, theme)
    return true
  } catch {
    return false
  }
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute(
      'content',
      theme === 'dark'
        ? '#18181e'
        : theme === 'pixel'
          ? '#111c19'
          : theme === 'uunit'
            ? '#4d19cc'
            : '#f5f4f0',
    )
}
