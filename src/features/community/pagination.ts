export function mergePage<T extends { id: number }>(
  existing: T[],
  incoming: T[],
  position: 'append' | 'prepend',
): T[] {
  const seen = new Set(existing.map((item) => item.id))
  const fresh = incoming.filter((item) => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
  return position === 'append' ? [...existing, ...fresh] : [...fresh, ...existing]
}
