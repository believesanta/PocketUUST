import { createHash } from 'node:crypto'

export function decodeEntities(value) {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–' }
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (!entity.startsWith('#')) return named[entity.toLowerCase()] ?? match
    const code = entity.toLowerCase().startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match
  })
}

export function textOnly(value) {
  return decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim()
}

export function safeUrl(value, base) {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(decodeEntities(value), base)
    if (url.protocol !== 'https:' || url.username || url.password || url.hostname === 'localhost' || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || !url.hostname.includes('.')) return null
    return url.href
  } catch { return null }
}

const idFor = (url) => `news-${createHash('sha256').update(url).digest('hex').slice(0, 16)}`
const dateOrNull = (value) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? null : date.toISOString() }
const tag = (block, name) => block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? ''
const attr = (html, name) => html.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1] ?? ''

export function parseGoogleRss(xml, maxItems = 10) {
  if (!/<rss\b/i.test(xml)) throw new Error('Источник вернул не RSS')
  const result = []
  const seen = new Set()
  for (const match of xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)) {
    const block = match[1]
    const sourceUrl = safeUrl(textOnly(tag(block, 'link')))
    const title = textOnly(tag(block, 'title'))
    if (!sourceUrl || !title || seen.has(sourceUrl)) continue
    seen.add(sourceUrl)
    const imageTag = block.match(/<media:(?:content|thumbnail)\b[^>]*>/i)?.[0] ?? ''
    result.push({ id: idFor(sourceUrl), title, summary: 'Откройте публикацию, чтобы прочитать подробности.', sourceName: textOnly(tag(block, 'source')) || 'Google News', sourceUrl, publishedAt: dateOrNull(textOnly(tag(block, 'pubDate'))), checkedAt: null, imageSourceUrl: safeUrl(attr(imageTag, 'url')), image: null, tags: ['Кампус'], group: 'Новости', isDemo: false })
    if (result.length >= maxItems) break
  }
  return result
}

export function parseOfficialNews(html, maxItems = 10) {
  const result = []
  const seen = new Set()
  for (const match of html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/gi)) {
    const block = match[1]
    const link = block.match(/<a\b[^>]+href=["']([^"']*\/news\/get\/[^"']+)["']/)?.[1]
    const sourceUrl = link && safeUrl(link, 'https://uust.ru')
    const title = textOnly(block.match(/<h[234][^>]*class=["'][^"']*article-card__title[^"']*["'][^>]*>([\s\S]*?)<\/h[234]>/)?.[1] ?? '')
    if (!sourceUrl || !title || seen.has(sourceUrl)) continue
    seen.add(sourceUrl)
    const imageTag = block.match(/<img\b[^>]*>/)?.[0] ?? ''
    const timeTag = block.match(/<time\b[^>]*>/)?.[0] ?? ''
    result.push({ id: idFor(sourceUrl), title, summary: 'Официальная публикация УУНиТ. Подробности — на сайте университета.', sourceName: 'УУНиТ', sourceUrl, publishedAt: dateOrNull(attr(timeTag, 'datetime')), checkedAt: null, imageSourceUrl: safeUrl(attr(imageTag, 'src'), 'https://uust.ru'), image: null, tags: ['Кампус'], group: 'Новости', isDemo: false })
    if (result.length >= maxItems) break
  }
  return result
}
