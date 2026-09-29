import type { Proposal } from './model'
const prefix = 'pocketuust.life.v1.'
function read(key: string): unknown {
  try { return JSON.parse(localStorage.getItem(prefix + key) ?? 'null') } catch { return null }
}
export function readStrings(key: string): string[] {
  const value = read(key)
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length < 150))].slice(0,300) : []
}
export function writeLocal(key: string, value: unknown): boolean {
  try { localStorage.setItem(prefix + key, JSON.stringify(value)); return true } catch { return false }
}
export function validPublicUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && url.hostname.includes('.') && !/^[\d.]+$/.test(url.hostname) && !url.hostname.includes(':') } catch { return false }
}
export function readProposals(): Proposal[] {
  const value = read('proposals')
  if (!Array.isArray(value)) return []
  return value.filter((item): item is Proposal => item && typeof item.id === 'string' && typeof item.title === 'string' && item.title.length <= 100 && typeof item.description === 'string' && item.description.length <= 800 && typeof item.kind === 'string' && typeof item.url === 'string' && validPublicUrl(item.url)).slice(0,25)
}
