export interface KnowledgeDocument {
  id: string
  title: string
  text: string
  keywords: string[]
  sourceUrl?: string
  sourceName?: string
}
const stop = new Set(
  'как где что кто когда зачем почему можно нужно мне мой для или это есть у нас на в и по от до с со ли не а к из чтобы хочу найти узнать получить посмотреть пожалуйста'.split(
    ' ',
  ),
)
function tokens(text: string): string[] {
  return [
    ...new Set(
      (
        text
          .toLocaleLowerCase('ru')
          .replace(/ё/g, 'е')
          .match(/[a-zа-я0-9]+/g) ?? []
      )
        .filter((word) => word.length > 2 && !stop.has(word))
        .map((word) => word.startsWith('общаг') ? 'общеж'
          : word.startsWith('выплач') ? 'выплат' : word.slice(0, 6)),
    ),
  ]
}
export function retrieve(
  query: string,
  documents: readonly KnowledgeDocument[],
): KnowledgeDocument[] {
  const words = tokens(query.slice(0, 300))
  if (!words.length) return []
  return documents
    .map((document) => {
      const title = new Set(tokens(document.title)),
        headings = new Set(tokens(document.keywords.join(' '))),
        body = new Set(tokens(document.text))
      return {
        document,
        score: words.reduce(
          (sum, word) => sum + (title.has(word) ? 8 : headings.has(word) ? 4 : body.has(word) ? 1 : 0),
          0,
        ),
        coverage:
          words.filter((word) => title.has(word) || headings.has(word) || body.has(word)).length / words.length,
      }
    })
    .filter((item) => item.score >= 4 && item.coverage >= 0.3)
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage)
    .filter((item, _, ranked) => item.score >= ranked[0].score * 0.55)
    .slice(0, 3)
    .map((item) => item.document)
}
