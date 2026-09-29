import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// Node runs the real TSX components. Styles have no effect on static semantic markup.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      for (const extension of ['.ts', '.tsx']) {
        const candidate = new URL(specifier + extension, context.parentURL)
        if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true }
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.endsWith('.css'))
      return { format: 'module', source: 'export default {}', shortCircuit: true }
    if (/\.tsx?$/.test(url)) {
      const source = ts.transpileModule(readFileSync(fileURLToPath(url), 'utf8'), {
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
        },
      }).outputText
      return { format: 'module', source, shortCircuit: true }
    }
    return nextLoad(url, context)
  },
})

const { CommunityHub } = await import('./CommunityHub.tsx')
const { PastEvents } = await import('./PastEvents.tsx')

test('community renders safely without browser storage and labels every seeded ad as demo', () => {
  const html = renderToStaticMarkup(createElement(CommunityHub))
  assert.match(html, /Своё сообщество/)
  assert.match(html, /aria-label="Разделы сообщества"/)
  const articles = html.match(/<article[\s\S]*?<\/article>/g) || []
  assert.ok(articles.length > 0)
  for (const article of articles) assert.match(article, /Пример · демо/)
  assert.doesNotMatch(html, /tel:|Ваше · локально/)
  assert.match(html, /другие|только в этом браузере/)
})
test('events start with no fabricated votes and official sources are linked', () => {
  const html = renderToStaticMarkup(createElement(PastEvents))
  assert.match(html, /Пока без оценок/)
  assert.doesNotMatch(html, /★ \d\.\d \/ 5/)
  assert.match(html, /href="https:\/\/uust\.ru\/smu\/publications\/news\/get\/festival-nauki\/"/)
  assert.match(html, /1–18 сентября 2025/)
  assert.match(html, /23 сентября 2026/)
  assert.match(html, /Источник даты · PDF/)
  assert.match(html, /не общий рейтинг университета/)
})
