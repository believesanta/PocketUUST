import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { SERVICE_ROOT } from './settings.mjs'

export class PythonSource {
  constructor(settings) { this.settings = settings; this.children = new Set() }

  fetch(resource) {
    const settings = this.settings
    return new Promise((resolveResult, reject) => {
      const child = spawn(settings.python, [resolve(SERVICE_ROOT, 'python/fetch.py')], {
        stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
        windowsHide: true,
      })
      this.children.add(child)
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      let stdout = '', stderr = '', finished = false
      const finish = (error, value) => {
        if (finished) return
        finished = true
        clearTimeout(timer)
        this.children.delete(child)
        if (error) reject(error); else resolveResult(value)
      }
      const timer = setTimeout(() => {
        child.kill()
        finish(new Error('Превышено время ожидания ответа источника.'))
      }, (settings.upstreamTimeout * 2 + 10) * 1000)
      child.on('error', (error) => finish(new Error(error.code === 'ENOENT'
        ? 'Python не найден. Установите Python 3.10+ или задайте SCHEDULE_PYTHON.' : error.message)))
      child.stdout.on('data', (chunk) => {
        stdout += chunk
        if (stdout.length > 20 * 1024 * 1024) {
          child.kill(); finish(new Error('Ответ источника слишком большой.'))
        }
      })
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-8000) })
      child.stdin.on('error', () => {})
      child.on('close', (code) => {
        if (code !== 0) { finish(new Error(stderr.trim() || 'Python-парсер завершился с ошибкой.')); return }
        try { finish(null, JSON.parse(stdout)) } catch { finish(new Error('Парсер вернул неполный JSON.')) }
      })
      child.stdin.end(JSON.stringify({
        ...resource, base_url: settings.upstreamUrl, timeout: settings.upstreamTimeout,
      }))
    })
  }

  close() { for (const child of this.children) child.kill() }
}
