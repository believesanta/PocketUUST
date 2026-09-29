import test from 'node:test'
import assert from 'node:assert/strict'
import { parseLocal, validateAd, moderateText, summarizeReviews, validReview } from './model.ts'

test('corrupt, old and malformed local data cannot enter the view', () => {
  const valid = (item) => typeof item?.id === 'string'
  assert.deepEqual(parseLocal('{oops', valid), [])
  assert.deepEqual(parseLocal('{"version":0,"items":[{"id":"old"}]}', valid), [])
  assert.deepEqual(parseLocal('{"version":1,"items":[null,{"id":"ok"},{"id":3}]}', valid), [
    { id: 'ok' },
  ])
})
test('sale price and pickup location are required, free gifts allow zero', () => {
  const ad = {
    kind: 'sell',
    title: 'Учебник',
    description: 'Учебник по математике, хорошее состояние',
    price: '300',
    pickup: 'dorm',
    location: 'Общежитие № 1',
  }
  assert.equal(validateAd(ad), '')
  assert.ok(validateAd({ ...ad, price: '-2' }))
  assert.ok(validateAd({ ...ad, price: '0.5' }))
  assert.ok(validateAd({ ...ad, price: 'NaN' }))
  assert.ok(validateAd({ ...ad, location: ' ' }))
  assert.equal(validateAd({ ...ad, kind: 'give', price: '0' }), '')
  assert.ok(validateAd({ ...ad, title: ' ' }))
})
test('clean memes go to editorial queue; obvious profanity and personal attacks do not', () => {
  assert.equal(moderateText('Когда нашёл аудиторию раньше преподавателя'), '')
  assert.ok(moderateText('ты идиот'))
  assert.ok(moderateText('блядь'))
  assert.ok(moderateText(' '))
  assert.ok(moderateText('а'.repeat(241)))
})
test('review average has no seeded votes and invalid scores are excluded', () => {
  assert.deepEqual(summarizeReviews([]), { count: 0, average: null })
  assert.deepEqual(
    summarizeReviews([{ stars: 5 }, { stars: 2 }, { stars: 0 }, { stars: 6 }, { stars: 1.5 }]),
    { count: 2, average: 3.5 },
  )
  assert.equal(
    validReview({
      id: 'x',
      eventId: 'science-2025',
      stars: 4,
      comment: 'Хорошо',
      createdAt: '2026-09-27',
    }),
    true,
  )
  assert.equal(
    validReview({
      id: 'x',
      eventId: 'science-2025',
      stars: 6,
      comment: '',
      createdAt: '2026-09-27',
    }),
    false,
  )
})
