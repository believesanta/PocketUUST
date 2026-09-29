import { searchable } from '../../shared/i18n/index.ts'
export type ScholarProfile = {
  institution: 'head' | 'branch'
  form: string
  funding: string
  level: string
  course: number
  performance: string
  firstSemester: boolean
  debt: boolean
  socialEligible: boolean
  quota: boolean
  scheme: string
  points: number
  selected: boolean
}
export type Estimate = {
  amount: number | null
  reason: string
  sourceUrl: string
  coefficientIncluded: boolean
}
export type Staff = {
  id: string
  name: string
  role: string
  facultyId: string
  sourceUrl?: string
  phones?: string[]
  email?: string
  office?: string
  contactNote?: string
}
export const checkedAt = '2026-09-27'
export const scholarshipSources = {
  base: 'https://uust.ru/media/eduInfo/2427_19.08.2026.pdf',
  enhancedAcademic: 'https://uust.ru/media/eduInfo/2650_11.09.2026.pdf',
  enhancedSocial: 'https://uust.ru/media/eduInfo/2628_10.09.2026.pdf',
  socialOriginal: 'https://uust.ru/media/eduInfo/2400_17.08.2026.pdf',
  supplement: 'https://uust.ru/media/eduInfo/0411_10.02.2026.pdf',
  regulation: 'https://uust.ru/media/eduInfo/3409_29.12.2023.pdf',
  quotaAmendment: 'https://uust.ru/media/eduInfo/2365_13.08.2024.pdf',
}
export function scholarshipEstimate(profile: ScholarProfile): Estimate {
  const sourceUrl =
    profile.scheme === 'enhanced-academic'
      ? scholarshipSources.enhancedAcademic
      : profile.scheme === 'enhanced-social'
        ? scholarshipSources.enhancedSocial
        : scholarshipSources.base
  const coefficientIncluded = profile.scheme === 'enhanced-social'
  const result = (amount: number | null, reason: string): Estimate => ({
    amount,
    reason,
    sourceUrl,
    coefficientIncluded,
  })
  if (profile.scheme.startsWith('enhanced') && profile.institution !== 'head')
    return result(
      null,
      'Тарифы этих приказов относятся к головному вузу. Для филиала проверьте отдельные приказы и уточните сумму в своём подразделении.',
    )
  if (
    !['bachelor', 'specialist', 'master', 'spo'].includes(profile.level) ||
    !Number.isInteger(profile.course) ||
    profile.course < 1 ||
    profile.course >
      (profile.level === 'master'
        ? 2
        : profile.level === 'spo'
          ? 4
          : profile.level === 'bachelor'
            ? 5
            : 6)
  )
    return result(null, 'Проверьте уровень образования и курс.')
  if (profile.form !== 'full-time' || profile.funding !== 'federal')
    return result(
      null,
      'Эти государственные стипендии предусмотрены для очного обучения за счёт федерального бюджета.',
    )
  if (profile.firstSemester && profile.course !== 1)
    return result(null, 'Первый семестр до первой сессии относится только к первому курсу.')
  const academicEligible =
    !profile.debt && ['good', 'mixed', 'excellent'].includes(profile.performance)
  if (profile.scheme === 'social')
    return profile.socialEligible
      ? result(
          profile.level === 'spo' ? 1280.89 : 3526.03,
          'Для подтверждённого права на государственную социальную стипендию; успеваемость не меняет этот тариф.',
        )
      : result(
          null,
          'Нужно подтвердить основание документами и оформить назначение социальной стипендии.',
        )
  if (profile.scheme === 'enhanced-social') {
    if (
      !['bachelor', 'specialist'].includes(profile.level) ||
      profile.course > 2 ||
      !academicEligible ||
      !profile.socialEligible
    )
      return result(
        null,
        'Приказ относится к 1–2 курсам бакалавриата и специалитета с оценками 4/5 и подтверждённым правом на социальную стипендию.',
      )
    return profile.selected
      ? result(6051, 'Размер ПГСС по приказу №2628; районный коэффициент уже включён.')
      : result(
          null,
          'Соответствие условиям ещё не означает назначение. Уточните решение стипендиальной комиссии.',
        )
  }
  if (profile.scheme === 'enhanced-academic') {
    if (profile.level === 'spo' || profile.firstSemester || !academicEligible)
      return result(
        null,
        'Нужны обучение по программе ВО, право на академическую стипендию и завершённая аттестация. В первом семестре ПГАС не рассчитывается.',
      )
    if (!profile.selected)
      return result(
        null,
        'ПГАС назначается по конкурсу за подтверждённые достижения. Нужен приказ о назначении и баллы комиссии.',
      )
    const brackets = [
      [1, 50, 9996.95],
      [51, 99.99, 12496.18],
      [100, 199.99, 14995.42],
      [200, 299.99, 17494.66],
      [300, Infinity, 19993.89],
    ]
    const bracket = Number.isFinite(profile.points)
      ? brackets.find(([min, max]) => profile.points >= min && profile.points <= max)
      : undefined
    return bracket
      ? result(
          bracket[2],
          'Тариф ПГАС по баллам стипендиальной комиссии. Его не складываем автоматически с обычной ГАС.',
        )
      : result(
          null,
          'Значение баллов не входит в интервалы приказа №2650. Уточните округление у комиссии.',
        )
  }
  if (profile.scheme !== 'academic') return result(null, 'Выберите вид стипендии.')
  if (!profile.quota && !profile.firstSemester && !academicEligible)
    return result(
      null,
      'Обычная ГАС требует отсутствия академического долга и оценок «удовлетворительно».',
    )
  const grade = profile.quota || profile.firstSemester ? 'good' : profile.performance
  const rates: Record<string, number> =
    profile.level === 'spo'
      ? { good: 854.97, mixed: 1068.71, excellent: 1282.46 }
      : { good: 2349.63, mixed: 2937.04, excellent: 3524.45 }
  return result(
    rates[grade] ?? null,
    profile.quota
      ? 'Для иностранных граждан и лиц без гражданства по правительственной квоте — базовый норматив независимо от успеваемости.'
      : profile.firstSemester
        ? 'До первой аттестации на первом курсе назначается базовая ГАС.'
        : 'Размер обычной ГАС по итогам последней аттестации.',
  )
}
export function filterStaff(
  staff: Staff[],
  filters: { query: string; facultyId: string; role: string },
): Staff[] {
  const normalize = (value: string) => value.trim().toLocaleLowerCase('ru').replaceAll('ё', 'е')
  const query = normalize(filters.query)
  return staff.filter(
    (person) =>
      (filters.facultyId === 'all' || person.facultyId === filters.facultyId) &&
      (filters.role === 'all' || person.role === filters.role) &&
      (!query || normalize(`${person.name} ${searchable(person.role)} ${searchable(person.office ?? '')}`).includes(query)),
  )
}
