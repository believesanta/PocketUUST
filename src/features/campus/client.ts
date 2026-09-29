import { useEffect, useSyncExternalStore } from 'react'
export interface User {
  id: number
  login: string
  name: string
  emailVerified?: boolean
}
export interface Wallet {
  balance: number
  earned: number
  floor: number
  forumPoints: number
  tickets: number
  nextFloorAt: number | null
  gameAvailable: boolean
  activity: Array<{ label: string; points: number; createdAt: string }>
}
interface CampusState {
  user: User | null
  wallet: Wallet | null
  loading: boolean
  error: string
}
export interface VerificationRequired {
  status: 'verification_required'
  challengeId: string
  email: string
  expiresAt: string
  resendAvailableAt: string
}
export interface AuthConfig {
  emailDomains: string[]
  registrationEnabled: boolean
  testEmailCode: string | null
  passwordMinLength: number
  passwordMaxLength: number
  nameMaxLength: number
}
let state: CampusState = { user: null, wallet: null, loading: true, error: '' }
let generation = 0
let changingAccount = false
let walletRevision = 0
const listeners = new Set<() => void>()
function update(next: Partial<CampusState>) {
  state = { ...state, ...next }
  listeners.forEach((listener) => listener())
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000)
  const writing = options.method === 'POST'
  const walletWrite = writing && path.startsWith('/api/campus/')
  if (walletWrite) walletRevision++
  try {
    const response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      signal: controller.signal,
      headers:
        writing || options.body !== undefined
          ? { Accept: 'application/json', 'Content-Type': 'application/json' }
          : { Accept: 'application/json' },
      body: writing
        ? JSON.stringify(options.body ?? {})
        : options.body === undefined
          ? undefined
          : JSON.stringify(options.body),
    })
    if (!response.headers.get('content-type')?.includes('application/json'))
      throw new Error('Сервис аккаунтов недоступен. Запустите сервер через npm start.')
    const data = await response.json()
    if (!response.ok)
      throw new Error(
        typeof data.error === 'string' ? data.error : 'Запрос не выполнен. Попробуйте ещё раз.',
      )
    return data as T
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError')
      throw new Error('Сервер не ответил вовремя. Попробуйте ещё раз.')
    throw error instanceof Error ? error : new Error('Нет связи с сервером.')
  } finally {
    clearTimeout(timer)
    if (walletWrite) walletRevision++
  }
}
let pending: { generation: number; revision: number; promise: Promise<void> } | null = null
export function getCampusSnapshot() {
  return state
}
export function refreshCampus(): Promise<void> {
  if (pending?.generation === generation && pending.revision === walletRevision)
    return pending.promise
  const current = generation,
    revision = walletRevision
  const promise = api<{ user: User | null; wallet: Wallet | null }>('/api/campus/me')
    .then((result) => {
      if (current === generation && revision === walletRevision)
        update({ ...result, loading: false, error: '' })
    })
    .catch((error) => {
      if (current === generation && revision === walletRevision)
        update({ loading: false, error: error.message })
    })
    .finally(() => {
      if (pending?.promise === promise) pending = null
    })
  pending = { generation: current, revision, promise }
  return promise
}
export async function changeAccount(
  action: 'login' | 'register' | 'logout',
  body?: unknown,
): Promise<VerificationRequired | null> {
  if (changingAccount) throw new Error('Дождитесь завершения входа или выхода.')
  changingAccount = true
  generation++
  pending = null
  try {
    const result = await api<
      { status?: 'authenticated'; user: User | null; wallet: Wallet | null } |
      VerificationRequired | { ok: true }
    >(
      `/api/campus/auth/${action}`,
      { method: 'POST', body },
    )
    generation++
    pending = null
    if ('status' in result && result.status === 'verification_required') {
      update({ user: null, wallet: null, loading: false, error: '' })
      return result
    }
    if (action === 'logout') update({ user: null, wallet: null, loading: false, error: '' })
    else if ('user' in result && 'wallet' in result)
      update({ user: result.user, wallet: result.wallet, loading: false, error: '' })
    else throw new Error('Сервис вернул неполный ответ при входе.')
    return null
  } catch (error) {
    generation++
    pending = null
    await refreshCampus()
    throw error
  } finally {
    changingAccount = false
  }
}
export async function verifyAccount(challengeId: string, code: string): Promise<void> {
  if (changingAccount) throw new Error('Дождитесь завершения предыдущего запроса.')
  changingAccount = true
  generation++
  pending = null
  try {
    const result = await api<{ user: User; wallet: Wallet }>('/api/campus/auth/verify-email', {
      method: 'POST',
      body: { challengeId, code },
    })
    generation++
    pending = null
    update({ user: result.user, wallet: result.wallet, loading: false, error: '' })
  } catch (error) {
    generation++
    pending = null
    await refreshCampus()
    throw error
  } finally {
    changingAccount = false
  }
}
export function useCampus() {
  const snapshot = useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  )
  useEffect(() => {
    if (state.loading) void refreshCampus()
  }, [])
  return { ...snapshot, refresh: refreshCampus }
}
let rewardQueue: Promise<void> = Promise.resolve()
export function awardActivity(
  kind: 'news-read' | 'news-save' | 'route',
  key: string,
): Promise<{ added: boolean; message: string }> {
  if (!state.user || changingAccount) return Promise.resolve({ added: false, message: '' })
  const current = generation,
    userId = state.user.id
  const result = rewardQueue.then(() => performReward(kind, key, current, userId))
  rewardQueue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}
async function performReward(
  kind: 'news-read' | 'news-save' | 'route',
  key: string,
  current: number,
  userId: number,
): Promise<{ added: boolean; message: string }> {
  if (current !== generation || state.user?.id !== userId || changingAccount)
    return { added: false, message: '' }
  const revision = walletRevision
  try {
    const result = await api<{ added: boolean; message: string; wallet: Wallet }>(
      '/api/campus/reward',
      { method: 'POST', body: { kind, key } },
    )
    if (current !== generation || state.user?.id !== userId) return { added: false, message: '' }
    if (walletRevision === revision + 2) update({ wallet: result.wallet })
    else await refreshCampus()
    if (current !== generation || state.user?.id !== userId) return { added: false, message: '' }
    if (typeof window !== 'undefined')
      window.dispatchEvent(new CustomEvent('campus-reward', { detail: result.message }))
    return result
  } catch (error) {
    if (current !== generation) return { added: false, message: '' }
    const message = error instanceof Error ? error.message : 'Баллы не начислены.'
    if (typeof window !== 'undefined')
      window.dispatchEvent(new CustomEvent('campus-reward', { detail: message }))
    return { added: false, message }
  }
}
export type DockTab = 'account' | 'points' | 'game' | 'assistant'
export function openCampus(tab: DockTab = 'points', mode?: 'login' | 'register') {
  window.dispatchEvent(new CustomEvent('campus-open', { detail: mode ? { tab, mode } : tab }))
}
