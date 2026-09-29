import { CampusService, campusSettings } from './service.mjs'

export function campusPlugin(env = {}) {
  let service
  const attach = (server, localDev = false) => {
    const settings = { ...env, ...process.env }
    // Vite's local HTTP origin differs from the public HTTPS Funnel origin.
    // Keep the production origin and Secure cookies for the port 3000 server.
    if (localDev) {
      settings.CAMPUS_PUBLIC_ORIGIN = ''
      settings.CAMPUS_SECURE_COOKIES = 'false'
      settings.NODE_ENV = 'development'
    }
    service = new CampusService(campusSettings(settings))
    server.middlewares.use(service.middleware())
    server.httpServer?.once('close', () => service?.close())
    server.config.logger.info('  Campus API: /api/campus (SQLite accounts, rewards and forum)')
  }
  return {
    name: 'pocketuust-campus',
    configureServer(server) { attach(server, true) },
    configurePreviewServer(server) { attach(server) },
    closeBundle() {
      service?.close()
    },
  }
}
