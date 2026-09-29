import test from 'node:test'
import assert from 'node:assert/strict'
import { parseGoogleRss, parseOfficialNews, safeUrl, decodeEntities } from './news-utils.mjs'

test('missing photo does not resolve to homepage and can use article fallback', () => {
  assert.equal(safeUrl('', 'https://uust.ru'), null)
  const result = parseOfficialNews('<article><a href="/news/get/test"><h3 class="article-card__title">Без обложки</h3></a></article>')
  assert.equal(result[0].imageSourceUrl, null)
})

test('RSS: attributes, CDATA, numeric entities, publisher and valid date', () => {
  const result = parseGoogleRss('<rss><channel><item><title><![CDATA[УУНиТ &amp; наука &#x2014; новости]]></title><link>https://news.google.com/articles/abc</link><pubDate>Fri, 25 Sep 2026 10:00:00 GMT</pubDate><source url="https://uust.ru">УУНиТ</source></item></channel></rss>')
  assert.equal(result[0].title, 'УУНиТ & наука — новости')
  assert.equal(result[0].sourceName, 'УУНиТ')
  assert.equal(result[0].publishedAt, '2026-09-25T10:00:00.000Z')
  assert.equal(result[0].checkedAt, null)
})
test('malformed date becomes unknown and stable IDs do not depend on order', () => {
  const item = '<item><title>Заголовок</title><link>https://news.google.com/articles/a</link><pubDate>bad-date</pubDate></item>'
  const a = parseGoogleRss(`<rss>${item}</rss>`)[0]
  const b = parseGoogleRss(`<rss><item><title>Другой</title><link>https://news.google.com/articles/b</link></item>${item}</rss>`).find((x) => x.title === 'Заголовок')
  assert.equal(a.publishedAt, null)
  assert.equal(a.id, b.id)
})
test('unsafe/empty links are rejected and duplicate stories are removed', () => {
  const item = '<item><title>Новость</title><link>https://news.google.com/articles/a</link></item>'
  assert.equal(parseGoogleRss(`<rss>${item}${item}<item><title>Нельзя</title><link>javascript:alert(1)</link></item></rss>`).length, 1)
  assert.equal(safeUrl('javascript:alert(1)'), null)
  assert.equal(safeUrl('https://127.0.0.1/'), null)
})
test('official cards keep article URL, original image and publication timestamp', () => {
  const result = parseOfficialNews('<article class="article-card"><a href="/news/get/one"></a><time datetime="2026-09-25T09:45:00+05:00"></time><h3 class="article-card__title">Новость &amp; учёба</h3><img src="/media/photo.webp"></article>')
  assert.equal(result[0].sourceUrl, 'https://uust.ru/news/get/one')
  assert.equal(result[0].imageSourceUrl, 'https://uust.ru/media/photo.webp')
  assert.equal(result[0].title, 'Новость & учёба')
})
test('XML entity decoding never injects HTML or throws on invalid codepoints', () => {
  assert.equal(decodeEntities('&quot;A&#39; &#1103; &amp;'), '"A\' я &')
  assert.doesNotThrow(() => decodeEntities('&#99999999;'))
})
