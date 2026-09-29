import { t, localize, searchable } from '../../shared/i18n/index.ts'
import { useState } from 'react'
import { faqItems } from './faq-data'
import type { CategoryId } from './model'
import styles from './StudentLife.module.css'

const topics = ['Все вопросы',...new Set(faqItems.map(item=>item.topic))]
export function Faq({onNavigate}: {onNavigate:(category:CategoryId,group?:string,query?:string)=>void}) {
  const [query,setQuery] = useState('')
  const [topic,setTopic] = useState('Все вопросы')
  const normalized = query.trim().toLocaleLowerCase('ru')
  const filtered = faqItems.filter(item=>(topic==='Все вопросы'||item.topic===topic) && (!normalized||[item.question,item.answer,item.keywords??''].map(searchable).join(' ').includes(normalized)))
  return <section id="life-faq" className={styles.faq} aria-labelledby="life-faq-title">
    <div className={styles.faqHeading}><div><h3 id="life-faq-title" tabIndex={-1}>{t("Частые вопросы")}</h3><p>{t("Короткий ответ и понятный следующий шаг.")}</p></div><a href="https://uust.ru/faq/" target="_blank" rel="noreferrer">{t("Официальные ответы УУНиТ ↗")}</a></div>
    <label htmlFor="faq-search">{t("Поиск по вопросам")}</label><input id="faq-search" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder={t("Например, справка, клуб или стажировка")} />
    <div className={styles.chips} role="group" aria-label={t("Темы вопросов")}>{topics.map(value=><button key={value} type="button" aria-pressed={topic===value} onClick={()=>setTopic(value)}>{localize(value)}</button>)}</div>
    <p className={styles.faqCount} role="status">{t("Ответов: ")}{localize(filtered.length)}{t(" из ")}{localize(faqItems.length)}</p>
    {filtered.length ? <div className={styles.faqList}>{filtered.map(item=><details key={item.id} className={styles.faqItem}>
      <summary>{localize(item.question)}</summary><div className={styles.faqAnswer}><p>{localize(item.answer)}</p>
        {item.action && <button type="button" className={styles.action} onClick={()=>onNavigate(item.action!.category,item.action!.group,item.action!.query)}>{localize(item.action.label)}</button>}
        {item.source && <p className={styles.faqSource}><a href={item.source.url} target="_blank" rel="noreferrer">{localize(item.source.label)} ↗</a><span>{t("Источник проверен 26.09.2026")}</span></p>}
      </div>
    </details>)}</div> : <div className={styles.empty}><h4>{t("Вопрос не найден")}</h4><p>{t("Попробуйте другое слово или выберите все темы.")}</p><button type="button" onClick={()=>{setQuery('');setTopic('Все вопросы')}}>{t("Сбросить поиск")}</button></div>}
    <p className={styles.faqFoot}>{t("Не нашли свой вопрос? По индивидуальной ситуации уточните порядок в своём учебном подразделении или ")}<a href="https://uust.ru/mfso/" target="_blank" rel="noreferrer">{t("МФСО")}</a>.</p>
  </section>
}
