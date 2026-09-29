import { readFile } from 'node:fs/promises'
import { randomBytes, scrypt } from 'node:crypto'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { CampusService, campusSettings } from '../services/campus/service.mjs'

const derive = promisify(scrypt)
const credentialsPath = resolve(process.argv[2] ?? 'test-accounts.txt')
const lines = (await readFile(credentialsPath, 'utf8')).trim().split(/\r?\n/)
if (lines.shift() !== 'login\tpassword' || lines.length !== 128)
  throw new Error('Ожидается файл из 128 аккаунтов с заголовком login<TAB>password')

const accounts = lines.map((line, index) => {
  const [login, password, ...extra] = line.split('\t')
  const expected = `${String(index + 1).padStart(3, '0')}@stud.uust.ru`
  if (login !== expected || extra.length || !/^[A-Za-z0-9_-]{24}$/.test(password))
    throw new Error(`Некорректный аккаунт в строке ${index + 2}`)
  return { login, password, name: `Тест ${String(index + 1).padStart(3, '0')}` }
})

const service = new CampusService(campusSettings())
try {
  const existing = service.db.prepare('SELECT 1 FROM users WHERE login=?')
  for (const { login } of accounts)
    if (existing.get(login))
      throw new Error(`${login} уже существует в базе: импорт отменён, аккаунты не перезаписаны`)

  const createdAt = Date.now()
  const users = []
  for (const { login, password, name } of accounts) {
    const salt = randomBytes(16).toString('hex')
    const hash = await derive(password, salt, 64, {
      N: 131072,
      r: 8,
      p: 1,
      maxmem: 256 * 1024 * 1024,
    })
    users.push({ login, name, hash: `scrypt$131072$8$1$${salt}$${hash.toString('hex')}` })
  }

  service.transaction(() => {
    const insert = service.db.prepare(
      'INSERT INTO users(login,name,password_hash,created_at,email_verified_at) VALUES (?,?,?,?,?)',
    )
    for (const { login, name, hash } of users)
      insert.run(login, name, hash, createdAt, createdAt)
  })
  console.log(`Добавлено ${users.length} подтверждённых тестовых аккаунтов в ${service.options.databasePath}`)
} finally {
  service.close()
}
