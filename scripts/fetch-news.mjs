#!/usr/bin/env node
import { readFile, writeFile, mkdir, rename, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseGoogleRss, parseOfficialNews, safeUrl } from './news-utils.mjs'
import { acquireNewsLock } from './news-lock.mjs'

const defaultPath = fileURLToPath(new URL('../src/features/student-life/', import.meta.url))
const digest = (value) => createHash('sha256').update(value).digest('hex')

// Пути и сеть передаются параметрами: ручной импорт и сервер используют один код.
export async function refreshNews({ featurePath = defaultPath, officialOnly = false, fetchImpl = fetch, imagePrefix = './assets/', signal, log = console.log } = {}) {
const jsonPath = path.join(featurePath, 'student-life.json')
const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent('УУНиТ')}&hl=ru&gl=RU&ceid=RU:ru`

async function fetchBytes(url, maxBytes = 2_000_000) {
  signal?.throwIfAborted()
  const timeout = AbortSignal.timeout(15000)
  const response = await fetchImpl(url, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, headers: { 'User-Agent': 'PocketUUST/1.0 (student news reader)' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${new URL(url).hostname}`)
  const chunks = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > maxBytes) throw new Error('Ответ источника слишком большой')
    chunks.push(chunk)
  }
  return { bytes: Buffer.concat(chunks), type: response.headers.get('content-type') ?? '' }
}

async function loadOfficial() {
  const { bytes } = await fetchBytes('https://uust.ru/news/', 3_000_000)
  const news = parseOfficialNews(bytes.toString('utf8'), 8)
  if (!news.length) throw new Error('Не найдены карточки официальных новостей: структура сайта могла измениться')
  for (const item of news) {
    item.group = 'Официальные'
    if (!item.imageSourceUrl) {
      try {
        const { bytes: articleBytes } = await fetchBytes(item.sourceUrl)
        const main = articleBytes.toString('utf8').match(/<main[\s\S]*?<\/main>/)?.[0] ?? ''
        const source = main.match(/<img[^>]+src=["']([^"']*\/media\/[^"']+)["']/)?.[1]
        item.imageSourceUrl = source ? safeUrl(source, 'https://uust.ru') : null
      } catch { signal?.throwIfAborted() /* У новости может не быть публичной фотографии. */ }
    }
  }
  return news
}

async function attachLocalImage(item) {
  if (!item.imageSourceUrl || new URL(item.imageSourceUrl).hostname !== 'uust.ru') return item
  try {
    const { bytes } = await fetchBytes(item.imageSourceUrl)
    // Некоторые изображения УУНиТ выдаются как application/octet-stream.
    // Проверяем сигнатуру файла, а не доверяем только заголовку сервера.
    const extension = bytes[0] === 255 && bytes[1] === 216 ? 'jpg' : bytes.subarray(1,4).toString() === 'PNG' ? 'png' : bytes.subarray(8,12).toString() === 'WEBP' ? 'webp' : null
    if (!extension) throw new Error('Источник изображения вернул неподдерживаемый формат')
    const filename = `news-${digest(item.imageSourceUrl).slice(0,16)}.${extension}`
    const destination = path.join(featurePath, 'assets', filename)
    await writeFile(destination + '.tmp', bytes)
    await rename(destination + '.tmp', destination)
    return { ...item, image: `${imagePrefix}${filename}`, imageAlt: `Изображение публикации: ${item.title}`, imageKind: 'Фото из источника' }
  } catch(error) {
    signal?.throwIfAborted()
    log(`Без фото: ${item.title.slice(0,55)} — ${error.message}`)
    return item
  }
}

async function main() {
  await mkdir(featurePath, { recursive: true })
  const lockPath = path.join(featurePath, '.fetch-news.lock')
  const releaseLock = await acquireNewsLock(lockPath)
  const tempPath = `${jsonPath}.tmp`
  try {
    const original = await readFile(jsonPath, 'utf8')
    const data = JSON.parse(original)
    const official = await loadOfficial()
    let incoming = official
    if (!officialOnly) {
      const { bytes } = await fetchBytes(rssUrl, 2_000_000)
      const google = parseGoogleRss(bytes.toString('utf8'), 100)
        .sort((a,b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '')).slice(0,10)
      if (!google.length) throw new Error('Google News вернул пустую ленту: предыдущие новости сохранены')
      // RSS Google обычно не содержит фото. Не подставляем случайные картинки.
      const normalize = (title) => title.replace(/\s+-\s+[^-]+$/, '').toLocaleLowerCase('ru').replace(/[^\p{L}\p{N}]/gu,'')
      const officialTitles = new Set(official.map((item) => normalize(item.title)))
      incoming = [...official, ...google.filter((item) => !officialTitles.has(normalize(item.title))).map((item)=>({...item,group:'СМИ'}))]
    }
    await mkdir(path.join(featurePath, 'assets'), { recursive: true })
    const news = []
    for (const item of incoming) news.push(await attachLocalImage(item))
    signal?.throwIfAborted()
    if (digest(await readFile(jsonPath)) !== digest(original)) throw new Error('Данные изменены во время импорта. Запустите импорт снова, чтобы сохранить чужие правки.')
    data.news = news
    data.newsFetchedAt = new Date().toISOString()
    data.newsImportMode = officialOnly ? 'official' : 'google-and-official'
    await writeFile(path.join(featurePath, 'student-life.last-success.json'), original)
    await writeFile(tempPath, JSON.stringify(data,null,2)+'\n')
    await rename(tempPath,jsonPath)
    log(`Сохранено ${news.length} новостей; ${news.filter((item)=>item.image).length} с локальными фото.`)
    return data
  } finally {
    await unlink(tempPath).catch(()=>{})
    await releaseLock()
  }
}
return main()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  refreshNews({ officialOnly: process.argv.includes('--official') })
    .then(()=>console.log('checkedAt не проставляется автоматически. Для статической публикации после проверки выполните npm run build.'))
    .catch((error)=>{ console.error('Импорт не выполнен, прежний JSON сохранён:',error.message); process.exitCode=1 })
}
