import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { campusPlugin } from '../vite-plugin.mjs'

test('local Vite accepts its own origin while production still rejects another site', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'campus-vite-origin-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const env = {
    CAMPUS_DATA_DIR: directory,
    CAMPUS_PUBLIC_ORIGIN: 'https://game-system-product-name.taila7361a.ts.net',
    CAMPUS_EMAIL_CODE_SECRET: 'a'.repeat(64),
    CAMPUS_REGISTRATION_ENABLED: 'false',
    NODE_ENV: 'production',
  }
  const previous = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]))
  Object.assign(process.env, env)
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  async function open(preview) {
    let middleware
    const plugin = campusPlugin(env)
    const server = createServer((request, response) => middleware(request, response, () => response.end()))
    const vite = {
      middlewares: { use(value) { middleware = value } },
      httpServer: server,
      config: { logger: { info() {} } },
    }
    if (preview) plugin.configurePreviewServer(vite)
    else plugin.configureServer(vite)
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    t.after(() => new Promise(resolve => server.close(resolve)))
    return `http://127.0.0.1:${server.address().port}`
  }
  async function login(url, origin) {
    const response = await fetch(url + '/api/campus/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@stud.uust.ru', password: 'invalid' }),
    })
    return response.status
  }
  const local = await open(false)
  assert.notEqual(await login(local, local), 403)
  assert.equal(await login(local, 'https://other.example'), 403)
  const production = await open(true)
  assert.equal(await login(production, production), 403)
  assert.notEqual(await login(production, env.CAMPUS_PUBLIC_ORIGIN), 403)
})
