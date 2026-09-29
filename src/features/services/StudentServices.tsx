import { t, localize, getLocale } from '../../shared/i18n/index.ts'
import { useState } from 'react'
import { administration, faculties, history } from './data'
import { teachingStaff } from './teachers-data'
import {
  checkedAt,
  filterStaff,
  scholarshipEstimate,
  scholarshipSources,
  type ScholarProfile,
} from './model'
import styles from './StudentServices.module.css'

type Tab = 'scholarship' | 'contacts' | 'history'
const tabs: Array<{ id: Tab; label: string; number: string }> = [
  { id: 'scholarship', label: 'Стипендия', number: '01' },
  { id: 'contacts', label: 'Контакты', number: '02' },
  { id: 'history', label: 'История', number: '03' },
]
const initialProfile: ScholarProfile = {
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
const rubles = (amount: number) =>
  new Intl.NumberFormat(getLocale(), {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 2,
  }).format(amount)

function Scholarships() {
  const [profile, setProfile] = useState(initialProfile)
  const [submitted, setSubmitted] = useState(false)
  const update = <K extends keyof ScholarProfile>(key: K, value: ScholarProfile[K]) => {
    setProfile((current) => ({ ...current, [key]: value }))
    setSubmitted(false)
  }
  const estimate = scholarshipEstimate(profile)
  const enhanced = profile.scheme.startsWith('enhanced')
  return (
    <div className={styles.calculator}>
      <div>
        <div className={styles.sectionIntro}>
          <span className={styles.kicker}>{t("Деньги на учёбу")}</span>
          <h3>{t("Проверим ваш тариф")}</h3>
          <p>{t("Выберите условия обучения и вид стипендии. Размеры действуют с 1 сентября 2026 года. ")}</p>
        </div>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            setSubmitted(true)
          }}
        >
          <div className={styles.fieldGrid}>
            <label>{t("Подразделение ")}<select
                value={profile.institution}
                onChange={(e) =>
                  update('institution', e.target.value as ScholarProfile['institution'])
                }
              >
                <option value="head">{t("Головной вуз · Уфа")}</option>
                <option value="branch">{t("Филиал")}</option>
              </select>
            </label>
            <label>{t("Форма обучения ")}<select value={profile.form} onChange={(e) => update('form', e.target.value)}>
                <option value="full-time">{t("Очная")}</option>
                <option value="part-time">{t("Очно-заочная / заочная")}</option>
              </select>
            </label>
            <label>{t("Основа обучения ")}<select value={profile.funding} onChange={(e) => update('funding', e.target.value)}>
                <option value="federal">{t("Федеральный бюджет")}</option>
                <option value="paid">{t("Договор / иной бюджет")}</option>
              </select>
            </label>
            <label>{t("Программа ")}<select
                value={profile.level}
                onChange={(e) => {
                  setProfile((current) => ({
                    ...current,
                    level: e.target.value,
                    course: 1,
                    firstSemester: false,
                  }))
                  setSubmitted(false)
                }}
              >
                <option value="bachelor">{t("Бакалавриат")}</option>
                <option value="specialist">{t("Специалитет")}</option>
                <option value="master">{t("Магистратура")}</option>
                <option value="spo">{t("СПО")}</option>
              </select>
            </label>
            <label>{t("Курс ")}<select
                value={profile.course}
                onChange={(e) => {
                  setProfile((current) => ({
                    ...current,
                    course: Number(e.target.value),
                    firstSemester: false,
                  }))
                  setSubmitted(false)
                }}
              >
                {Array.from(
                  {
                    length:
                      profile.level === 'master'
                        ? 2
                        : profile.level === 'spo'
                          ? 4
                          : profile.level === 'bachelor'
                            ? 5
                            : 6,
                  },
                  (_, i) => (
                    <option key={i + 1} value={i + 1}>
                      {localize(i + 1)}
                    </option>
                  ),
                )}
              </select>
            </label>
            <label>{t("Последняя аттестация ")}<select
                value={profile.performance}
                onChange={(e) => update('performance', e.target.value)}
                disabled={profile.firstSemester}
              >
                <option value="good">{t("Только «хорошо»")}</option>
                <option value="mixed">{t("«Хорошо» и «отлично»")}</option>
                <option value="excellent">{t("Только «отлично»")}</option>
                <option value="satisfactory">{t("Есть «удовлетворительно»")}</option>
              </select>
            </label>
            <label>{t("Вид стипендии ")}<select
                value={profile.scheme}
                onChange={(e) => {
                  setProfile((current) => ({ ...current, scheme: e.target.value, selected: false }))
                  setSubmitted(false)
                }}
              >
                <option value="academic">{t("Государственная академическая")}</option>
                <option value="social">{t("Государственная социальная")}</option>
                <option value="enhanced-academic">{t("Повышенная академическая")}</option>
                <option value="enhanced-social">{t("Социальная в повышенном размере")}</option>
              </select>
            </label>
          </div>
          <div className={styles.checks}>
            {profile.course === 1 && (
              <label>
                <input
                  type="checkbox"
                  checked={profile.firstSemester}
                  onChange={(e) => update('firstSemester', e.target.checked)}
                />{t("Первый семестр, первой сессии ещё не было ")}</label>
            )}
            <label>
              <input
                type="checkbox"
                checked={profile.debt}
                onChange={(e) => update('debt', e.target.checked)}
              />{t("Есть академическая задолженность ")}</label>
            <label>
              <input
                type="checkbox"
                checked={profile.quota}
                onChange={(e) => update('quota', e.target.checked)}
              />{t("Иностранный гражданин / без гражданства по квоте Правительства РФ ")}</label>
            {(profile.scheme === 'social' || profile.scheme === 'enhanced-social') && (
              <label>
                <input
                  type="checkbox"
                  checked={profile.socialEligible}
                  onChange={(e) => update('socialEligible', e.target.checked)}
                />{t("Право на социальную стипендию подтверждено документами ")}</label>
            )}
            {enhanced && (
              <label>
                <input
                  type="checkbox"
                  checked={profile.selected}
                  onChange={(e) => update('selected', e.target.checked)}
                />{t("Есть решение комиссии и приказ о назначении этого вида ")}</label>
            )}
          </div>
          {profile.scheme === 'enhanced-academic' && (
            <label className={styles.pointsField}>{t("Баллы, подтверждённые комиссией ")}<input
                type="number"
                min="1"
                step="0.01"
                required
                value={Number.isFinite(profile.points) ? profile.points : ''}
                onChange={(e) =>
                  update('points', e.target.value === '' ? NaN : Number(e.target.value))
                }
              />
              <small>{t("Это баллы конкурса ПГАС, а не баллы PocketUUST.")}</small>
            </label>
          )}
          <button className={styles.primary} type="submit">{t("Показать размер ")}<span aria-hidden="true">↗</span>
          </button>
        </form>
      </div>
      <aside className={styles.result} aria-live="polite" aria-atomic="true">
        <span className={styles.kicker}>{t("По официальному приказу")}</span>
        <h4>
          {localize(submitted
            ? estimate.amount === null
              ? 'Нужно уточнить условия'
              : 'Размер выбранного вида'
            : 'Сначала ваши условия')}
        </h4>
        <div className={styles.amount}>
          {localize(submitted && estimate.amount !== null ? rubles(estimate.amount) : '—')}
        </div>
        <p>
          {localize(submitted
            ? estimate.reason
            : 'Заполните форму и нажмите «Показать размер». Здесь появится тариф и его основание.')}
        </p>
        {submitted && estimate.amount !== null && (
          <dl className={styles.breakdown}>
            <div>
              <dt>{t("Период тарифа")}</dt>
              <dd>{t("С 01.09.2026")}</dd>
            </div>
            <div>
              <dt>{t("Районный коэффициент")}</dt>
              <dd>{localize(estimate.coefficientIncluded ? 'Уже включён' : 'Не включён в сумму выше')}</dd>
            </div>
            <div>
              <dt>{t("Совмещение выплат")}</dt>
              <dd>{t("Не суммируется в калькуляторе")}</dd>
            </div>
          </dl>
        )}
        {submitted && (
          <a href={estimate.sourceUrl} target="_blank" rel="noreferrer">{t("Открыть приказ (PDF) ↗ ")}</a>
        )}
        <p className={styles.resultNote}>{t("Предварительная справка по тарифу, а не обещание выплаты. Окончательное назначение, совмещение видов и начисления подтверждает университет. Для ПГАС нужен конкурс; отпуск и особые основания требуют отдельной проверки. ")}</p>
      </aside>
      <details className={styles.sourceDetails}>
        <summary>{t("Что входит в расчёт и какие документы использованы")}</summary>
        <p>{t("Выше показан один выбранный вид. ГАС и ПГАС не складываем; обычную и повышенную социальную тоже не складываем. Приказы №2427 и №2650 требуют последующего начисления районного коэффициента, поэтому их суммы показаны до него. В №2628 сумма 6 051 ₽ уже включает коэффициент. ")}</p>
        <p>{t("Приказ №0411 предусматривает временные увеличения для головного вуза до 30 сентября 2026: ГАС бакалавриата/специалитета — на 1 300 / 1 625 / 1 950 ₽; магистратуры — на 1 800 / 2 250 / 2 700 ₽; ГСС ВО — на 1 000 ₽. Они отдельно от сентябрьского тарифа. В калькуляторе они не прибавляются: применение индексации к этим временным увеличениям и совместимость с назначенными видами нужно уточнить в бухгалтерии. ")}</p>
        <p>{t("Аспирантура, ВУЦ, именные выплаты и индивидуальные назначения здесь не рассчитываются. Срок выплаты по Положению №3409 — 25–28 число, а если день нерабочий — предыдущий рабочий день. ")}</p>
        <ul>
          {[
            [scholarshipSources.base, '№2427 от 19.08.2026 — обычные тарифы'],
            [scholarshipSources.enhancedAcademic, '№2650 от 11.09.2026 — ПГАС по баллам'],
            [scholarshipSources.socialOriginal, '№2400 от 17.08.2026 — ПГСС'],
            [scholarshipSources.enhancedSocial, '№2628 от 10.09.2026 — актуальная сумма ПГСС'],
            [scholarshipSources.supplement, '№0411 от 10.02.2026 — временные увеличения'],
            [scholarshipSources.regulation, '№3409 от 29.12.2023 — условия назначения'],
            [scholarshipSources.quotaAmendment, '№2365 от 13.08.2024 — правила для квоты'],
          ].map(([url, title]) => (
            <li key={url}>
              <a href={url} target="_blank" rel="noreferrer">
                {localize(title)} ↗
              </a>
            </li>
          ))}
        </ul>
        <a href="https://uust.ru/scholarship/" target="_blank" rel="noreferrer">{t("Все документы о стипендиях на сайте УУНиТ ↗ ")}</a>
      </details>
    </div>
  )
}

function Contacts() {
  const [mode, setMode] = useState<'administration' | 'teachers'>('administration')
  const [facultyId, setFacultyId] = useState('faculty-2')
  const [query, setQuery] = useState('')
  const [role, setRole] = useState('all')
  const [page, setPage] = useState(1)
  const staff = mode === 'teachers' ? teachingStaff : administration
  const scoped =
    facultyId === 'all' || mode === 'teachers'
      ? staff
      : staff.filter((person) => person.facultyId === facultyId)
  const roles = [...new Set(scoped.map((person) => person.role))].sort((a, b) =>
    a.localeCompare(b, 'ru'),
  )
  const filtered = filterStaff(staff, {
    query,
    role,
    facultyId: mode === 'teachers' ? 'all' : facultyId,
  })
  const pages = Math.max(1, Math.ceil(filtered.length / 12))
  const currentPage = Math.min(page, pages)
  const faculty = faculties.find((item) => item.id === facultyId)
  function reset() {
    setQuery('')
    setRole('all')
    setPage(1)
  }
  return (
    <div>
      <div className={styles.sectionIntro}>
        <span className={styles.kicker}>{t("К кому обратиться")}</span>
        <h3>{t("Люди университета")}</h3>
        <p>{t("Публичные сведения с сайта УУНиТ. Проверьте источник перед визитом: кабинеты и часы могут измениться. ")}</p>
      </div>
      <div className={styles.switcher} aria-label={t("Тип справочника")}>
        <button
          type="button"
          aria-pressed={mode === 'administration'}
          onClick={() => {
            setMode('administration')
            reset()
          }}
        >{t("Дирекции и деканаты ")}</button>
        <button
          type="button"
          aria-pressed={mode === 'teachers'}
          onClick={() => {
            setMode('teachers')
            reset()
          }}
        >{t("Все преподаватели · ")}{localize(teachingStaff.length)}
        </button>
      </div>
      <div className={styles.directoryFilters}>
        {mode === 'administration' && (
          <label>{t("Институт / факультет ")}<select
              value={facultyId}
              onChange={(e) => {
                setFacultyId(e.target.value)
                reset()
              }}
            >
              <option value="all">{t("Все подразделения")}</option>
              {faculties.map((item) => (
                <option key={item.id} value={item.id}>
                  {localize(item.short)} — {localize(item.name)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>{t("Имя, должность или кабинет ")}<input
            type="search"
            value={query}
            placeholder={t("Например, Белова или учебная работа")}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(1)
            }}
          />
        </label>
        <label>{t("Должность ")}<select
            value={role}
            onChange={(e) => {
              setRole(e.target.value)
              setPage(1)
            }}
          >
            <option value="all">{t("Все должности")}</option>
            {roles.map((item) => (
              <option key={item} value={item}>{localize(item)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className={styles.coverage}>
        {mode === 'teachers' ? (
          <p>{t("Полный снимок таблицы педагогических работников: ")}{localize(teachingStaff.length)}{t(" человек. В этой таблице нет факультетов, рабочих телефонов, почты или кабинетов. Поэтому поиск общий; связь с факультетом и личные контакты не выведены из догадок.")}{' '}
            <a href="https://uust.ru/sveden/employees/" target="_blank" rel="noreferrer">{t("Полный официальный состав с программами ↗ ")}</a>
          </p>
        ) : (
          <p>{t("Контакты руководителей всех ")}{localize(faculties.length)}{t(" подразделений головного вуза; для ИИМРТ также опубликованы заместители. Это проверенная часть справочника сотрудников, не весь штат факультетов. Телефоны из приёмной комиссии принадлежат подразделениям.")}{' '}
            {faculty && (
              <a href={faculty.url} target="_blank" rel="noreferrer">{t("Страница ")}{localize(faculty.short)} ↗
              </a>
            )}{' '}
            <a href="https://uust.ru/sveden/employees/" target="_blank" rel="noreferrer">{t("Полный официальный педагогический состав ↗ ")}</a>
          </p>
        )}
      </div>
      <div className={styles.labDirectory}>
        <div>
          <strong>{t("Ищете лабораторию?")}</strong>
          <p>{t("Официальный каталог научных подразделений содержит страницы лабораторий, институтов и исследовательских центров. ")}</p>
        </div>
        <a href="https://uust.ru/research/centers/" target="_blank" rel="noreferrer">{t("Лаборатории и научные центры ↗ ")}</a>
      </div>
      <div className={styles.resultsLine}>
        <p role="status">{t("Найдено: ")}{localize(filtered.length)}
          {localize(filtered.length > 12 ? ` · страница ${currentPage} из ${pages}` : '')}
        </p>
        <button type="button" onClick={reset}>{t("Сбросить поиск ")}</button>
      </div>
      {filtered.length ? (
        <ul className={styles.people}>
          {filtered.slice((currentPage - 1) * 12, currentPage * 12).map((person) => (
            <li key={person.id} className={styles.person}>
              <div className={styles.personInitial} aria-hidden="true">
                {localize(person.name[0])}
              </div>
              <div className={styles.personBody}>
                <span className={styles.personRole}>{localize(person.role)}</span>
                <h4>{localize(person.name)}</h4>
                {mode === 'administration' && (
                  <p className={styles.facultyTag}>
                    {localize(faculties.find((item) => item.id === person.facultyId)?.short)}
                  </p>
                )}
                <p className={styles.office}>
                  {localize(person.office ?? 'Кабинет и лаборатория в этом источнике не опубликованы.')}
                </p>
                <div className={styles.contactLinks}>
                  {person.phones?.map((phone) => (
                    <a key={phone} href={`tel:${phone.replace(/[^+\d]/g, '')}`}>
                      {localize(phone)}
                    </a>
                  ))}
                  {person.email && <a href={`mailto:${person.email}`}>{localize(person.email)}</a>}
                  {!person.phones?.length && !person.email && (
                    <span>{t("Рабочие контакты не опубликованы в таблице")}</span>
                  )}
                </div>
                {person.contactNote && <p className={styles.personNote}>{localize(person.contactNote)}</p>}
                <a
                  className={styles.sourceLink}
                  href={person.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                >{t("Официальный источник ↗ ")}</a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.empty}>
          <h4>{t("Никого не нашли")}</h4>
          <p>{t("Попробуйте фамилию без имени или другую должность.")}</p>
          <button type="button" onClick={reset}>{t("Сбросить поиск ")}</button>
        </div>
      )}
      {pages > 1 && (
        <nav className={styles.pagination} aria-label={t("Страницы справочника")}>
          <button
            type="button"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >{t("← Назад ")}</button>
          <span>
            {localize(currentPage)} / {localize(pages)}
          </span>
          <button
            type="button"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >{t("Далее → ")}</button>
        </nav>
      )}
    </div>
  )
}

export function StudentServices() {
  const [tab, setTab] = useState<Tab>('scholarship')
  return (
    <section className={styles.services} aria-labelledby="services-title">
      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}>{t("PocketUUST · полезно каждый день")}</span>
          <h2 id="services-title">{t("База студента")}<span aria-hidden="true">↗</span>
          </h2>
          <p>{t("Стипендии, люди и история — чтобы уверенно ориентироваться в своём университете.")}</p>
        </div>
        <div className={styles.checked}>
          <span>{t("Официальные источники")}</span>
          <strong>27.09.2026</strong>
          <small>{t("Дата проверки сведений")}</small>
        </div>
      </header>
      <nav className={styles.tabs} aria-label={t("Студенческие сервисы")}>
        {tabs.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={tab === item.id}
            aria-controls="service-content"
            onClick={() => setTab(item.id)}
          >
            <span aria-hidden="true">{localize(item.number)}</span>
            {localize(item.label)}
          </button>
        ))}
      </nav>
      <div id="service-content" className={styles.content}>
        {tab === 'scholarship' ? (
          <Scholarships />
        ) : tab === 'contacts' ? (
          <Contacts />
        ) : (
          <div>
            <div className={styles.sectionIntro}>
              <span className={styles.kicker}>{t("Связь поколений")}</span>
              <h3>{t("Две школы, общая история")}</h3>
              <p>{t("УУНиТ создан в 2022 году. За этим именем — традиции классического и авиационного образования. ")}</p>
            </div>
            <ol className={styles.timeline}>
              {history.map((item) => (
                <li key={item.year}>
                  <span className={styles.year}>{localize(item.year)}</span>
                  <div>
                    <span className={styles.historyBranch}>{localize(item.branch)}</span>
                    <h4>{localize(item.title)}</h4>
                    <p>{localize(item.text)}</p>
                    <a
                      className={styles.sourceLink}
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                    >{t("Источник УУНиТ ↗ ")}</a>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
      <footer className={styles.footer}>{t("Проверено ")}<time dateTime={checkedAt}>{t("27 сентября 2026")}</time>{t(" · Сведения могут обновляться на сайте университета. ")}</footer>
    </section>
  )
}
