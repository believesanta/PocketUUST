import { t, localize } from './i18n/index.ts'
import {buildings} from '../features/navigation/routing'
import type {CategoryId} from '../features/student-life/model'

export type LifeDestination={category:CategoryId;target:'category'|'faq'}
const shortcuts:[string,string,LifeDestination][]=[
  ['Полезные гайды','Учёба, документы и скидки',{category:'resources',target:'category'}],
  ['Найти своих','Клубы и студенческие команды',{category:'clubs',target:'category'}],
  ['Первый шаг в карьеру','Стажировки и возможности',{category:'career',target:'category'}],
  ['Есть вопрос?','Ответы на частые вопросы',{category:'resources',target:'faq'}],
]
export function QuickAccess({onOpen}:{onOpen:(destination:LifeDestination)=>void}) {
  return <aside className="quick-access" aria-labelledby="quick-access-title">
    <div className="campus-vignette" aria-hidden="true"><svg viewBox="180 210 1530 650">
      {buildings.map(building=><path key={building.id} d={building.outline}/>)}
      <path className="vignette-route" d="M979 665H743V309H850"/>
      <circle cx="979" cy="665" r="22"/><circle cx="850" cy="309" r="22"/>
    </svg><span>{t("Кампус ближе, чем кажется")}</span></div>
    <h2 id="quick-access-title">{t("Под рукой")}</h2>
    <div className="shortcut-list">{shortcuts.map(([title,description,destination])=><button key={title} type="button" onClick={()=>onOpen(destination)}>
      <span><strong>{localize(title)}</strong><small>{localize(description)}</small></span><span aria-hidden="true">↗</span>
    </button>)}</div>
    <div className="pocket-note"><span className="pocket-note-icon" aria-hidden="true">⌑</span><p>{t("Сохраняйте маршруты и материалы — они останутся под рукой в этом браузере.")}</p></div>
    <a className="university-link" href="https://uust.ru/" target="_blank" rel="noreferrer">{t("Официальный сайт УУНиТ ")}<span aria-hidden="true">↗</span></a>
  </aside>
}
