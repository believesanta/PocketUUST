import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { schedulePlugin } from './services/schedule/vite-plugin.mjs'
import { campusPlugin } from './services/campus/vite-plugin.mjs'
import { assistantPlugin } from './services/assistant/vite-plugin.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const schedule = schedulePlugin(env)
  return {
    plugins: [react(), schedule, campusPlugin(env), assistantPlugin(env, schedule.getService)],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  }
})
