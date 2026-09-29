import { t, localize } from '../../shared/i18n/index.ts'
import { useState, type FormEvent } from 'react'
import { readProposals, validPublicUrl, writeLocal } from './storage'
import type { Proposal } from './model'
import styles from './StudentLife.module.css'
export function SuggestMaterial() {
  const [open, setOpen] = useState(false)
  const [proposals, setProposals] = useState(readProposals)
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [description, setDescription] = useState('')
  const [kind, setKind] = useState('Гайд')
  const [message, setMessage] = useState('')
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!validPublicUrl(url.trim())) { setMessage('Укажите публичную ссылку, начинающуюся с https://.'); return }
    if (!title.trim() || !description.trim()) { setMessage('Заполните название и описание.'); return }
    if (proposals.length >= 25) { setMessage('В демоверсии можно сохранить до 25 предложений. Удалите одно из предыдущих.'); return }
    const item: Proposal = {id:crypto.randomUUID(),title:title.trim(),url:url.trim(),description:description.trim(),kind}
    const next = [item,...proposals]
    if (!writeLocal('proposals',next)) { setMessage('Браузер не разрешил сохранение. Предложение не сохранено.'); return }
    setProposals(next); setTitle(''); setUrl(''); setDescription('')
    setMessage('Сохранено в этом браузере. Команде не отправлено.')
  }
  function remove(id: string) {
    const next = proposals.filter(item=>item.id!==id)
    if(writeLocal('proposals',next)) setProposals(next)
    else setMessage('Браузер не разрешил удалить предложение.')
  }
  return <div className={styles.suggest}>
    <div className={styles.suggestHeading}><div><h3>{t("Знаете полезную штуку?")}</h3><p>{t("Добавьте гайд, сервис или скидку в локальную демоколлекцию.")}</p></div><button type="button" aria-expanded={open} aria-controls="life-proposal" onClick={()=>setOpen(!open)}>{t("Предложить материал")}</button></div>
    {open && <form id="life-proposal" onSubmit={submit} className={styles.form}>
      <p className={styles.detail}>{t("Демонстрация для хакатона: данные хранятся только в этом браузере. Отправки и модерации пока нет.")}</p>
      <label htmlFor="proposal-title">{t("Название")}<input id="proposal-title" value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} required /></label>
      <label htmlFor="proposal-url">{t("Ссылка")}<input id="proposal-url" type="url" placeholder="https://…" value={url} onChange={e=>setUrl(e.target.value)} maxLength={1000} required /></label>
      <div><label htmlFor="proposal-kind">{t("Тип материала")}</label><select id="proposal-kind" value={kind} onChange={e=>setKind(e.target.value)}><option value="Гайд">{t("Гайд")}</option><option value="Сервис">{t("Сервис")}</option><option value="Скидка">{t("Скидка")}</option></select></div>
      <label htmlFor="proposal-description">{t("Чем полезен")}<textarea id="proposal-description" value={description} onChange={e=>setDescription(e.target.value)} maxLength={800} rows={4} required /></label>
      {title.trim() && <div className={styles.preview}><span className={styles.eyebrow}>{t("Предпросмотр · ")}{localize(kind)}</span><h4>{title}</h4><p>{description || t('Здесь появится ваше описание.')}</p><span>{localize(url)}</span></div>}
      <button type="submit">{t("Сохранить предложение здесь")}</button>
    </form>}
    <p role="status">{localize(message)}</p>
    {!!proposals.length && <div className={styles.proposals}><h4>{t("Ваши предложения в этом браузере")}</h4>{proposals.map(item=><div className={styles.proposal} key={item.id}><div><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a><p>{localize(item.kind)} · {item.description}</p></div><button type="button" aria-label={localize(`Удалить предложение: ${item.title}`)} onClick={()=>remove(item.id)}>{t("Удалить")}</button></div>)}</div>}
  </div>
}
