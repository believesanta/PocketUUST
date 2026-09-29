import type { Plugin } from 'vite'
export function assistantPlugin(env?: Record<string, string>, scheduleService?: () => unknown): Plugin
