import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
try {
  process.loadEnvFile()
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
const python = process.env.SCHEDULE_PYTHON ?? (process.platform === 'win32' ? 'python' : 'python3')
const result = spawnSync(python, [fileURLToPath(new URL('./package-case.py', import.meta.url))], {
  stdio: 'inherit',
  windowsHide: true,
})
if (result.error) {
  console.error('Не удалось запустить Python. Укажите путь SCHEDULE_PYTHON в .env.')
  process.exitCode = 1
} else process.exitCode = result.status ?? 1
