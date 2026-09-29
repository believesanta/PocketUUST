import test from 'node:test'
import assert from 'node:assert/strict'
import { scholarshipEstimate, filterStaff } from './model.ts'

const profile = {
  institution: 'head',
  form: 'full-time',
  funding: 'federal',
  level: 'bachelor',
  course: 2,
  performance: 'mixed',
  firstSemester: false,
  debt: false,
  socialEligible: false,
  quota: false,
  scheme: 'academic',
  points: 51,
  selected: false,
}
test('head-university enhanced tariffs cannot be applied to branch students', () => {
  for (const scheme of ['enhanced-academic', 'enhanced-social'])
    assert.equal(
      scholarshipEstimate({
        ...profile,
        institution: 'branch',
        scheme,
        selected: true,
        socialEligible: true,
      }).amount,
      null,
    )
})
test('academic rate follows the September order, without rounding percentages again', () => {
  assert.equal(scholarshipEstimate(profile).amount, 2937.04)
})
test('excellent and good grades select their own official rates', () => {
  assert.equal(scholarshipEstimate({ ...profile, performance: 'excellent' }).amount, 3524.45)
  assert.equal(scholarshipEstimate({ ...profile, performance: 'good' }).amount, 2349.63)
})
test('part-time and fee-paying students cannot obtain a federal estimate', () => {
  assert.equal(scholarshipEstimate({ ...profile, form: 'part-time' }).amount, null)
  assert.equal(scholarshipEstimate({ ...profile, funding: 'paid' }).amount, null)
})
test('debt or a satisfactory grade blocks academic scholarship', () => {
  assert.equal(scholarshipEstimate({ ...profile, debt: true }).amount, null)
  assert.equal(scholarshipEstimate({ ...profile, performance: 'satisfactory' }).amount, null)
})
test('first-semester academic rate is basic and requires course one', () => {
  assert.equal(
    scholarshipEstimate({ ...profile, course: 1, firstSemester: true, performance: 'excellent' })
      .amount,
    2349.63,
  )
  assert.equal(scholarshipEstimate({ ...profile, course: 3, firstSemester: true }).amount, null)
})
test('foreign quota preserves the basic academic rate despite grades', () => {
  assert.equal(
    scholarshipEstimate({ ...profile, quota: true, performance: 'satisfactory', debt: true })
      .amount,
    2349.63,
  )
})
test('social rate depends on confirmed entitlement, independently of academic debt', () => {
  assert.equal(
    scholarshipEstimate({ ...profile, scheme: 'social', debt: true, socialEligible: true }).amount,
    3526.03,
  )
  assert.equal(scholarshipEstimate({ ...profile, scheme: 'social' }).amount, null)
})
test('enhanced social amount includes the coefficient once and excludes later courses and masters', () => {
  const eligible = { ...profile, scheme: 'enhanced-social', socialEligible: true, selected: true }
  assert.equal(scholarshipEstimate(eligible).amount, 6051)
  assert.equal(scholarshipEstimate(eligible).coefficientIncluded, true)
  assert.equal(scholarshipEstimate({ ...eligible, course: 3 }).amount, null)
  assert.equal(scholarshipEstimate({ ...eligible, level: 'master' }).amount, null)
})
test('enhanced academic requires selection and returns the literal points bracket rate', () => {
  const enhanced = { ...profile, scheme: 'enhanced-academic', selected: true }
  for (const [points, amount] of [
    [1, 9996.95],
    [50, 9996.95],
    [51, 12496.18],
    [99.99, 12496.18],
    [100, 14995.42],
    [200, 17494.66],
    [300, 19993.89],
  ]) {
    assert.equal(scholarshipEstimate({ ...enhanced, points }).amount, amount)
  }
  assert.equal(scholarshipEstimate({ ...enhanced, selected: false }).amount, null)
  assert.equal(scholarshipEstimate({ ...enhanced, points: 50.5 }).amount, null)
  assert.equal(scholarshipEstimate({ ...enhanced, points: NaN }).amount, null)
  assert.equal(scholarshipEstimate({ ...enhanced, course: 1, firstSemester: true }).amount, null)
})
test('SPO rates are distinct and SPO enhanced academic is excluded', () => {
  assert.equal(scholarshipEstimate({ ...profile, level: 'spo' }).amount, 1068.71)
  assert.equal(
    scholarshipEstimate({ ...profile, level: 'spo', scheme: 'social', socialEligible: true })
      .amount,
    1280.89,
  )
  assert.equal(
    scholarshipEstimate({ ...profile, level: 'spo', scheme: 'enhanced-academic', selected: true })
      .amount,
    null,
  )
})
const staff = [
  { id: 'a', name: 'Семёнов Иван', role: 'Доцент', facultyId: 'math' },
  { id: 'b', name: 'Петров Иван', role: 'Директор', facultyId: 'law' },
  { id: 'c', name: 'Петров Сергей', role: 'Доцент', facultyId: 'law' },
]
test('staff search matches normalized names and roles', () => {
  assert.deepEqual(
    filterStaff(staff, { query: ' СЕМЕНОВ ', facultyId: 'all', role: 'all' }).map((x) => x.id),
    ['a'],
  )
  assert.deepEqual(
    filterStaff(staff, { query: 'Директор', facultyId: 'all', role: 'all' }).map((x) => x.id),
    ['b'],
  )
})
test('faculty, role and query filters intersect rather than leak other staff', () => {
  assert.deepEqual(
    filterStaff(staff, { query: 'Петров', facultyId: 'law', role: 'Доцент' }).map((x) => x.id),
    ['c'],
  )
  assert.equal(filterStaff(staff, { query: '[', facultyId: 'all', role: 'all' }).length, 0)
})
