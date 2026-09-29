import { AssistantService, assistantSettings } from './service.mjs'

export function assistantPlugin(env = {}, scheduleService = null) {
  const attach = (server) => {
    const assistant = new AssistantService({ settings: assistantSettings({ ...env, ...process.env }), scheduleService })
    server.middlewares.use(assistant.middleware())
    server.config.logger.info('  Assistant API: /api/assistant/ask')
  }
  return { name: 'pocketuust-assistant', configureServer: attach, configurePreviewServer: attach }
}
