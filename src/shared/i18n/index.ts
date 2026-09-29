import { english } from './english.ts'

export type Language = 'ru' | 'en'
export const LANGUAGE_KEY = 'pocketuust.language.v1'
const listeners = new Set<() => void>()
let language: Language = 'ru'
try {
  if (typeof window !== 'undefined' && window.localStorage.getItem(LANGUAGE_KEY) === 'en') language = 'en'
} catch { /* Language still works when browser storage is disabled. */ }

export const getLanguage = () => language
export const getLocale = () => language === 'en' ? 'en-GB' : 'ru-RU'
export function subscribeLanguage(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
function applyLanguage() {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = language
    document.title = language === 'en' ? 'PocketUUST — your campus in your pocket' : 'PocketUUST — УУНиТ в кармане'
  }
}
export function setLanguage(next: Language) {
  if (next !== 'ru' && next !== 'en') return
  try { window.localStorage.setItem(LANGUAGE_KEY, next) } catch { /* Optional persistence. */ }
  if (language === next) return
  language = next
  applyLanguage()
  listeners.forEach(listener => listener())
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== LANGUAGE_KEY && event.key !== null) return
    const next = event.newValue === 'en' ? 'en' : 'ru'
    if (next !== language) {
      language = next
      applyLanguage()
      listeners.forEach(listener => listener())
    }
  })
}
applyLanguage()

const normalize = (text: string) => text.trim().replace(/\s+/g, ' ')
const patterns = Object.entries(english).filter(([key]) => /\{\d+\}/.test(key) && /[а-яё]/i.test(key)).map(([key, value]) => {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{(\d+)\\\}/g, '(.+?)')
  const slots = [...key.matchAll(/\{(\d+)\}/g)].map(match => match[1])
  return { regex: new RegExp(`^${escaped}$`, 'u'), slots, value, length: key.length }
}).sort((a, b) => b.length - a.length)
/** Translate presentation text only; IDs, API payloads and user content stay unchanged. */
export function t(text: string, selectedLanguage: Language = language): string {
  if (selectedLanguage === 'ru') return text
  const key = normalize(text)
  let translated = english[key]
  if (translated === undefined) {
    for (const pattern of patterns) {
      const match = pattern.regex.exec(key)
      if (!match) continue
      translated = pattern.value.replace(/\{(\d+)\}/g, (slot, index: string) => {
        const position = pattern.slots.indexOf(index)
        return position < 0 ? slot : match[position + 1]
      })
      break
    }
  }
  if (translated === undefined) return text
  return `${text.match(/^\s*/)?.[0] ?? ''}${translated}${text.match(/\s*$/)?.[0] ?? ''}`
}
/** JSX expressions can include numbers, elements and arrays as well as strings. */
export function localize<T>(value: T, selectedLanguage: Language = language): T {
  if (typeof value === 'string') return t(value, selectedLanguage) as T
  if (Array.isArray(value)) return value.map(item => localize(item, selectedLanguage)) as T
  return value
}
/** Searches support both original text and the currently displayed translation. */
export function searchable(text: string): string {
  return `${text} ${t(text)}`.toLocaleLowerCase().replaceAll('ё', 'е')
}
