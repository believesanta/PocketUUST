import { useState } from 'react'
import { parseLocal } from './model'
export function useLocal<T>(key: string, valid: (value: unknown) => boolean) {
  const [items, setItems] = useState<T[]>(() => {
    try {
      return parseLocal<T>(localStorage.getItem(key), valid)
    } catch {
      return []
    }
  })
  const [storageError, setStorageError] = useState('')
  const save = (next: T[]) => {
    try {
      localStorage.setItem(key, JSON.stringify({ version: 1, items: next.slice(0, 200) }))
      setItems(next.slice(0, 200))
      setStorageError('')
      return true
    } catch {
      setStorageError(
        'Браузер не разрешил сохранить данные. Освободите место или разрешите локальное хранение.',
      )
      return false
    }
  }
  return { items, save, storageError }
}
