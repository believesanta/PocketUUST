import { settingsFromEnv } from './settings.mjs'
import { ScheduleService } from './service.mjs'

export function schedulePlugin(env = {}) {
  let service
  const attach = (server) => {
    service = new ScheduleService(settingsFromEnv({ ...env, ...process.env }), { bulkImport: false })
    server.middlewares.use(service.middleware())
    server.httpServer?.once('close', () => { void service.close() })
    server.config.logger.info('  Schedule API: /api/schedule/v1 (SQLite + Python)')
  }
  return {
    name: 'pocketuust-schedule',
    getService: () => service,
    configureServer: attach,
    configurePreviewServer: attach,
    async closeBundle() { await service?.close() },
  }
}
