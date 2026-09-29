import type { Plugin } from 'vite'
export function schedulePlugin(env?: Record<string, string>): Plugin & { getService(): unknown }
