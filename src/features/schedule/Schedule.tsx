import { localize, t, getLocale } from '../../shared/i18n/index.ts'
import { Fragment, useEffect, useState } from 'react'
import type { RoomId } from '../../shared/types'
import { dayLabel, getLessons, type Lesson } from './data'
import { countWord, groupOptionLabel, lessonPhase, roomDestination, timeMinutes, weekDates } from './schedule-view'
import { useSchedule } from './useSchedule'
import styles from './Schedule.module.css'

const shortDays = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const lessonCount = (count: number) => `${count} ${countWord(count,['занятие','занятия','занятий'])}`
function CalendarIcon() {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><rect x="7" y="10" width="34" height="32" rx="7"/><path d="M15 6v9m18-9v9M7 21h34"/><path d="m17 31 5 5 10-10"/></svg>
}
function LessonCard({lesson, phase, onShowRoom}: {lesson: Lesson; phase: ReturnType<typeof lessonPhase>; onShowRoom:(id:RoomId)=>void}) {
  const destination = roomDestination(lesson.room)
  return <li className={`${styles.lesson} ${phase === 'current' ? styles.currentLesson : ''}`}>
    <div className={styles.time}><strong>{localize(lesson.time.start ?? '—')}</strong><span>{localize(lesson.time.end ?? 'Время уточняется')}</span>{lesson.time.slot && <small>{localize(lesson.time.slot)}{t(" пара")}</small>}</div>
    <div className={styles.lessonBody}><div className={styles.lessonMeta}>{lesson.lesson_type && <span>{localize(lesson.lesson_type)}</span>}{phase === 'current' && <b className={styles.now}>{t("Сейчас идёт")}</b>}{phase === 'past' && <span>{t("Завершилась")}</span>}</div>
      <h4>{lesson.subject}</h4><p className={styles.teacher}>{lesson.teacher.name ?? 'Преподаватель не указан'}</p>
      <div className={styles.roomLine}><span>{localize(lesson.room.title ? `Ауд. ${lesson.room.title}` : 'Аудитория уточняется')}</span>{lesson.room.building_short_title && <span>{localize(lesson.room.building_short_title)}</span>}
        {destination && <button type="button" onClick={()=>onShowRoom(destination)} aria-label={localize(`Маршрут до аудитории ${destination}`)}>{t("На карте ")}<span aria-hidden="true">↗</span></button>}</div>
      {!destination && lesson.room.building_title && <p className={styles.address}>{localize(lesson.room.building_title)}</p>}
      {lesson.comment?.trim() && <p className={styles.comment}>{lesson.comment}</p>}
    </div>
  </li>
}

export function Schedule({ onShowRoom }: { onShowRoom: (id: RoomId) => void }) {
  const s = useSchedule()
  const [view, setView] = useState<'day'|'week'>('day')
  const [now, setNow] = useState(Date.now)
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),60000);return()=>clearInterval(timer)},[])
  const query = s.groupInput.trim().toLocaleLowerCase('ru')
  const matches = (s.groups?.groups ?? []).filter(group => !query || group.group_title.toLocaleLowerCase('ru').includes(query) || String(group.group_id) === query).slice(0,8)
  const days = s.config && s.week !== null ? weekDates(s.config,s.week) : []
  const selectedDate = days.find(day=>day.weekday===s.weekday)?.date
  const lessons = s.current ? getLessons(s.current,s.weekday) : []
  const currentDays = view === 'week' ? days : days.filter(day=>day.weekday===s.weekday)
  const todayWeekday = s.config ? new Date(`${s.config.today}T12:00:00`).getDay() || 7 : 1
  const first = lessons[0]?.time.start, last = lessons.at(-1)?.time.end
  const nextLesson = s.current?.lessons.toSorted((a,b)=>(a.date??'').localeCompare(b.date??'') || (a.time.start??'99').localeCompare(b.time.start??'99'))
    .find(lesson => lessonPhase(lesson,s.config?.timezone??'Asia/Yekaterinburg',now)==='current' || lessonPhase(lesson,s.config?.timezone??'Asia/Yekaterinburg',now)==='upcoming')
  const datedUndated = s.current?.undated.filter(entry=>!entry.weeks?.length || entry.weeks.some(week=>Number(week)===s.week)) ?? []

  return <section className={styles.schedule} aria-labelledby="schedule-title">
    <div className={styles.heading}><div><h2 id="schedule-title">{t("Расписание")}</h2><p>{t("Твоя учебная неделя — всё под рукой.")}</p></div><a href="https://schedule.uust.ru/" target="_blank" rel="noreferrer">{t("Сайт расписания ")}<span aria-hidden="true">↗</span></a></div>
    <div className={styles.groupPanel}>
      <div className={styles.groupHeader}><div className={styles.calendarIcon}><CalendarIcon/></div><div><span className={styles.caption}>{t("Моя группа")}</span><h3>{localize(s.selection?.title ?? 'Найди свою группу')}</h3><p>{localize(s.selection ? 'Выбор сохранён в этом браузере' : 'Название можно посмотреть в личном кабинете или уточнить у старосты')}</p></div></div>
      <form className={styles.groupPicker} onSubmit={s.openGroup}><div><label htmlFor="schedule-group">{t("Название или ID группы")}</label>
        <input id="schedule-group" type="search" autoComplete="off" maxLength={150} value={s.groupInput} placeholder={t("Например, БМИ-ИВТ-103М")} aria-describedby="schedule-search-help" aria-invalid={Boolean(s.searchError)} onChange={event=>{s.setGroupInput(event.target.value);s.setSearching(true)}}/>
      </div><button className={styles.primary} type="submit">{t("Показать расписание")}</button></form>
      <p id="schedule-search-help" className={styles.searchHelp}>{localize(s.groups?.catalog_loaded ? 'Начни вводить название и выбери свою группу ниже.' : 'Загружаем список групп… Можно ввести ID с сайта расписания.')}</p>
      {s.searching && matches.length > 0 && <ul className={styles.results} aria-label={t("Найденные группы")}>{matches.map(group=><li key={group.group_id}><button type="button" onClick={()=>s.chooseGroup({id:group.group_id,title:group.group_title})} aria-label={localize(groupOptionLabel(group))}><strong>{localize(group.group_title)}</strong><span>{localize([group.filial_title,group.course?`${group.course} курс`:null,group.faculty].filter(Boolean).join(' · '))}</span></button></li>)}</ul>}
      {s.searchError && <p className={styles.notice} role="alert">{localize(s.searchError)}</p>}
      {(s.catalogError || (!s.groups?.catalog_loaded && s.groups?.refresh_error)) && <p className={styles.notice} role="status">{t("Список групп пока недоступен. Можно ввести ID или ")}<button type="button" onClick={s.retry}>{t("повторить загрузку")}</button>.</p>}
    </div>
    {s.configError && <p className={styles.notice} role="alert">{localize(s.configError)} {localize(s.config?'Используются сохранённые настройки.':'')} <button type="button" onClick={s.retry}>{t("Повторить")}</button></p>}
    {!s.selection && <div className={styles.welcome}><CalendarIcon/><h3>{t("Пары, время и аудитории")}</h3><p>{t("Выбери группу один раз — расписание будет открываться сразу. Просматривай день или всю неделю и находи аудитории на карте.")}</p><div><span>{t("01 Найди группу")}</span><span>{t("02 Выбери день")}</span><span>{t("03 Иди на пару")}</span></div></div>}
    {s.selection && s.config && s.week !== null && <>
      {nextLesson && <div className={styles.nextLesson}><span>{localize(lessonPhase(nextLesson,s.config.timezone,now)==='current'?'Сейчас идёт':'Ближайшая пара сегодня')}</span><strong>{nextLesson.subject}</strong><small>{localize(nextLesson.time.start)}–{localize(nextLesson.time.end)}{localize(nextLesson.room.title?` · Ауд. ${nextLesson.room.title}`:'')}</small></div>}
      <div className={styles.weekToolbar}><div className={styles.weekNavigation}>
        <button type="button" aria-label={t("Предыдущая неделя")} disabled={s.week<=1} onClick={()=>s.setWeek(s.week!-1)}>‹</button>
        <div><strong>{localize(days[0] && new Date(`${days[0].date}T12:00:00`).toLocaleDateString(getLocale(),{day:'numeric',month:'short'}))} — {localize(days[6] && new Date(`${days[6].date}T12:00:00`).toLocaleDateString(getLocale(),{day:'numeric',month:'short'}))}</strong><span>{localize(s.week)}{t(" учебная неделя · ")}{localize(s.config.period_label)}</span></div>
        <button type="button" aria-label={t("Следующая неделя")} disabled={s.week>=53} onClick={()=>s.setWeek(s.week!+1)}>›</button>
      </div><button type="button" className={styles.today} onClick={()=>{s.setWeek(s.config!.current_week);s.setWeekday(todayWeekday);setView('day')}}>{t("Сегодня")}</button></div>
      <div className={styles.days} role="group" aria-label={t("Дни учебной недели")}>{days.map(day=><button key={day.weekday} type="button" aria-pressed={s.weekday===day.weekday} aria-label={localize(dayLabel(day.date))} className={day.date===s.config!.today?styles.todayDate:''} onClick={()=>{s.setWeekday(day.weekday);setView('day')}}>
        <span>{localize(shortDays[day.weekday-1])}</span><strong>{localize(Number(day.date.slice(-2)))}</strong><small>{localize(s.current ? getLessons(s.current,day.weekday).length : '—')}<span className={styles.countWord}> {localize(countWord(s.current?getLessons(s.current,day.weekday).length:0,['пара','пары','пар']))}</span></small>
      </button>)}</div>
      <div className={styles.dayToolbar}><div><h3>{localize(view==='week'?'Вся учебная неделя':selectedDate?dayLabel(selectedDate):'Занятия')}</h3><p>{localize(view==='week'?`${s.current?lessonCount(s.current.lessons.length):'Получаем занятия'} в расписании`:s.current?`${lessonCount(lessons.length)}${first&&last?` · ${first}–${last}`:''}`:'Получаем занятия из источника')}</p></div>
        <div className={styles.viewSwitch} role="group" aria-label={t("Вид расписания")}><button type="button" aria-pressed={view==='day'} onClick={()=>setView('day')}>{t("День")}</button><button type="button" aria-pressed={view==='week'} onClick={()=>setView('week')}>{t("Вся неделя")}</button></div>
      </div>
      <div aria-live="polite" aria-busy={s.loading}>
        {s.loading && <p className={styles.notice} role="status">{t("Загружаем расписание…")}</p>}
        {s.loadError && <p className={styles.notice} role="alert">{localize(s.loadError)} {localize(s.current?'Показана последняя сохранённая копия.':'')} <button type="button" onClick={s.retry}>{t("Повторить")}</button></p>}
        {s.current && <>
          {(s.localCopy || s.current.stale || s.current.offline || s.current.refresh_error) && <p className={styles.notice} role="status">{t("Показана сохранённая копия. ")}{localize(s.current.refreshing?'Сервер обновляет данные.':'Сверь дату обновления перед занятиями.')}</p>}
          {currentDays.map(day=>{const daily=getLessons(s.current!,day.weekday);return <div key={day.date} className={styles.dayBlock}>
            {view==='week' && <h4 className={styles.weekDayHeading}>{localize(dayLabel(day.date))} <span>{localize(lessonCount(daily.length))}</span></h4>}
            {daily.length ? <ul className={styles.lessons}>{daily.map((lesson,index)=>{
              const prevEnd=index>0?timeMinutes(daily[index-1].time.end):null,start=timeMinutes(lesson.time.start)
              const gap=prevEnd!==null && start!==null ? start-prevEnd : 0
              return <Fragment key={lesson.id}>{gap>=30 && <li className={styles.break}>{t("Перерыв ")}{localize(gap)}{t(" мин ")}<span>{t("Есть время на обед или самостоятельную работу")}</span></li>}<LessonCard lesson={lesson} phase={lessonPhase(lesson,s.config!.timezone,now)} onShowRoom={onShowRoom}/></Fragment>
            })}</ul>:<div className={styles.empty}><span aria-hidden="true">☼</span><div><strong>{t("На этот день пар нет")}</strong><p>{t("В полученном расписании занятий не указано. Можно выбрать другой день или проверить обновления.")}</p></div></div>}
          </div>})}
          {datedUndated.length>0 && <details className={styles.undated}><summary>{t("Записи без дня недели (")}{localize(datedUndated.length)})</summary><p>{t("Источник не указал день. Уточни его у старосты или преподавателя.")}</p><ul>{datedUndated.map((entry,index)=><li key={index}>{entry.subject??entry.comment??entry.teacher}{entry.teacher&&entry.teacher!==entry.subject?` · ${entry.teacher}`:''}</li>)}</ul></details>}
        </>}
      </div>
      <div className={styles.dataFooter}><div><span>{localize(s.current?`Обновлено ${new Date(s.current.fetched_at).toLocaleString(getLocale(),{timeZone:s.config.timezone,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}`:'Данные из источника УУНиТ')}</span><small>{t("Время Уфы (UTC+5). Изменения сверяй на сайте расписания.")}</small></div><button type="button" disabled={s.loading} onClick={s.refresh}>{t("↻ Обновить")}</button></div>
    </>}
  </section>
}
