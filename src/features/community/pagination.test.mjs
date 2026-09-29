import test from 'node:test'
import assert from 'node:assert/strict'
import { mergePage } from './pagination.ts'

test('older topic pages append without losing latest topics or duplicating overlapping cursor results', () => {
  const latest = [
    { id: 105, title: 'new' },
    { id: 104, title: 'still new' },
  ]
  const older = [
    { id: 104, title: 'overlap' },
    { id: 103, title: 'older' },
    { id: 102, title: 'oldest' },
  ]
  assert.deepEqual(mergePage(latest, older, 'append'), [
    { id: 105, title: 'new' },
    { id: 104, title: 'still new' },
    { id: 103, title: 'older' },
    { id: 102, title: 'oldest' },
  ])
  assert.deepEqual(latest, [
    { id: 105, title: 'new' },
    { id: 104, title: 'still new' },
  ])
})
test('early reply pages prepend chronologically and retain newest optimistic replies', () => {
  const latest = [
    { id: 201, body: 'recent' },
    { id: 202, body: 'newest local' },
  ]
  const earlier = [
    { id: 199, body: 'earlier' },
    { id: 200, body: 'early' },
    { id: 201, body: 'overlap' },
  ]
  assert.deepEqual(mergePage(latest, earlier, 'prepend'), [
    { id: 199, body: 'earlier' },
    { id: 200, body: 'early' },
    { id: 201, body: 'recent' },
    { id: 202, body: 'newest local' },
  ])
})
test('repeating an older page neither duplicates entries nor changes their order', () => {
  const latest = [{ id: 4 }, { id: 5 }]
  const earlier = [{ id: 2 }, { id: 3 }]
  const merged = mergePage(latest, earlier, 'prepend')
  assert.deepEqual(mergePage(merged, earlier, 'prepend'), [
    { id: 2 },
    { id: 3 },
    { id: 4 },
    { id: 5 },
  ])
  assert.deepEqual(mergePage(latest, [], 'prepend'), [{ id: 4 }, { id: 5 }])
})
