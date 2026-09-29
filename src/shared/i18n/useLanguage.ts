import { useSyncExternalStore } from 'react'
import { getLanguage, subscribeLanguage } from './index.ts'
export function useLanguage() {
  return useSyncExternalStore(subscribeLanguage, getLanguage, () => 'ru' as const)
}
