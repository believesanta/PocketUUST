import { t, localize } from '../../shared/i18n/index.ts'
import { useState } from 'react'
import type { Dormitory } from './routing'
import { CITY_ROUTES_CHECKED_AT, cityRouteLink, getDormRoutes, walkingLegLink, type CityLeg, type CityRoute } from './city-routes'
import styles from './Navigation.module.css'

function TravelIcon({kind}:{kind:CityLeg['kind']|'home'|'entry'}) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind==='walk'?<><circle cx="14" cy="4" r="2"/><path d="m7 21 4-7-2-5 4-2 3 5 4 1M11 14l5 7M9 9l-4 5"/></>:kind==='car'?<><path d="m4 9 2-5h12l2 5M3 17h18V9H3zM5 17v3m14-3v3M6 12h2m8 0h2"/></>:kind==='home'?<><path d="m3 10 9-8 9 8M5 9v12h14V9M10 21v-8h4v8"/></>:kind==='entry'?<><path d="M13 3h7v18h-7M3 12h12m-4-4 4 4-4 4"/></>:<><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 11h14M8 19v2m8-2v2M8 15h1m6 0h1"/>{kind==='tram'&&<path d="m8 1 4 2 4-2"/>}</>}
  </svg>
}

function CityDiagram({route,dorm}:{route:CityRoute;dorm:Dormitory}) {
  const vehicles=route.legs.flatMap((leg,index)=>leg.kind==='bus'||leg.kind==='tram'?[{leg,index}]:[])
  const count=route.legs.length+1
  const points=Array.from({length:count},(_,index)=>[46+index*(548/(count-1)),index%2?112:68] as const)
  const path=(index:number)=>`M${points[index][0]} ${points[index][1]}H${(points[index][0]+points[index+1][0])/2}V${points[index+1][1]}H${points[index+1][0]}`
  return <div className={styles.cityDiagram}>
    <svg viewBox="0 0 640 180" role="img" aria-label={t("Схема выбранного городского маршрута")}>
      <title>{localize(`Общежитие № ${dorm.id} → ${route.legs.map(leg=>leg.to).join(' → ')}`)}</title>
      <g className={styles.diagramRoads}><path d="M0 36H640M0 145H640M130 0V180M320 0V180M510 0V180"/></g>
      {route.legs.map((leg,index)=><path key={index} d={path(index)} data-kind={leg.kind} className={leg.kind==='walk'?styles.diagramWalk:styles.diagramRide}/>)}
      {points.map((point,index)=><g key={index} transform={`translate(${point.join(' ')})`}><circle r={index===0||index===count-1?18:10} className={index===0?styles.diagramStart:index===count-1?styles.diagramFinish:styles.diagramStop}/>{(index===0||index===count-1)&&<text y="6" textAnchor="middle">{localize(index===0?'А':'Б')}</text>}</g>)}
      {vehicles.map(({leg,index})=>{const a=points[index],b=points[index+1],x=(a[0]+b[0])/2;return <g key={index} transform={`translate(${x} 28)`}><rect x="-25" y="-17" width="50" height="30" rx="7" className={styles.diagramVehicle}/><text textAnchor="middle" y="4">{localize(leg.line)}</text></g>})}
    </svg>
    <div className={styles.diagramLabels}><span><b>{t("Общежитие № ")}{localize(dorm.id)}</b><small>{localize(dorm.address.replace('Уфа, улица ',''))}</small></span><span><TravelIcon kind={route.mode==='walking'?'walk':route.mode==='driving'?'car':'bus'}/><small>{localize(vehicles.length?vehicles.map(({leg})=>`${leg.kind==='tram'?'Трамвай':'Автобус'} ${leg.line}`).join(' + '):route.mode==='walking'?'Пешком':'Машина / такси')}</small></span><span><b>{t("Главный вход")}</b><small>{t("Между корпусами 6 и 7")}</small></span></div>
    <p className={styles.diagramCaption}>{t("Схема этапов · без масштаба ")}<span><i/>{t(" пешком ")}<i/>{t(" транспорт")}</span></p>
  </div>
}

export function DormRoutes({dorm,onContinue}:{dorm:Dormitory;onContinue:()=>void}) {
  const options=getDormRoutes(dorm)
  const [selected,setSelected]=useState(options[0].id)
  const route=options.find(item=>item.id===selected)??options[0]
  const [expanded,setExpanded]=useState<number|null>(null)
  return <section className={styles.cityRoutes} aria-labelledby="dorm-routes-title">
    <div className={styles.cityHeading}><h3 id="dorm-routes-title">{t("Общежитие № ")}{localize(dorm.id)}{t(" → главный вход")}</h3><p>{t("Выберите, как добраться")}</p></div>
    <div role="group" aria-label={t("Варианты маршрута из общежития")} className={styles.cityOptions}>{options.map(item=><button type="button" key={item.id} aria-pressed={route.id===item.id} onClick={()=>{setSelected(item.id);setExpanded(null)}}><TravelIcon kind={item.mode==='walking'?'walk':item.mode==='driving'?'car':item.legs.some(leg=>leg.kind==='tram')?'tram':'bus'}/><span><strong>{localize(item.title)}</strong><small>{localize(item.summary)}</small></span></button>)}</div>
    <div role="region" aria-label={t("Описание выбранного маршрута")} className={styles.citySelected}>
      <CityDiagram route={route} dorm={dorm}/>
      <ol className={styles.cityTimeline}>{route.legs.map((leg,index)=><li key={`${route.id}-${index}`} data-kind={leg.kind}>
        <span className={styles.cityLegIcon}><TravelIcon kind={leg.kind}/></span>
        <div><strong>{localize(leg.kind==='bus'||leg.kind==='tram'?`${leg.kind==='bus'?'Автобус':'Трамвай'} ${leg.line}`:leg.kind==='walk'?'Пешком':'Машина / такси')}</strong><p>{localize(leg.from)} → {localize(leg.to)}</p>{leg.direction&&<small>{t("В сторону «")}{localize(leg.direction)}»{localize(leg.stops&&` · ${leg.stops.length+1} ост.`)}</small>}
          <button type="button" className={styles.legDetailsButton} aria-expanded={expanded===index} onClick={()=>setExpanded(expanded===index?null:index)}>{localize(expanded===index?'Скрыть подробности':'Подробности')}</button>
          {expanded===index&&<div className={styles.legDetails}><p>{localize(leg.detail)}</p>{leg.stops&&<p>{t("Через: ")}{localize(leg.stops.join(' → '))}.</p>}{leg.kind==='walk'&&<a href={walkingLegLink(dorm,leg)} target="_blank" rel="noreferrer">{t("Показать пеший участок ↗")}</a>}{leg.sourceUrl&&<a href={leg.sourceUrl} target="_blank" rel="noreferrer">{localize(leg.kind==='walk'?'Остановки в 2ГИС':'Посмотреть направление в 2ГИС')} ↗</a>}</div>}
        </div>
      </li>)}</ol>
      <div className={styles.cityActions}><a className={styles.primaryLink} href={cityRouteLink(dorm,route.mode)} target="_blank" rel="noreferrer">{localize(route.mode==='walking'?'Открыть пеший маршрут':route.mode==='driving'?'Открыть маршрут на машине':'Проверить транспорт в картах')} ↗</a><button type="button" className={styles.secondary} onClick={onContinue}>{t("После входа — до аудитории →")}</button></div>
      <p className={styles.cityNote}>{t("У автобуса есть пешие подходы; машина сокращает прогулку по городу. Время, стоимость и доступность транспорта уточняйте в картах. Они могут предложить другой вариант.")}</p>
      <details className={styles.citySources}><summary>{t("Источники и точка входа")}</summary><p>{t("Адрес: ")}<a href={dorm.sourceUrl} target="_blank" rel="noreferrer">{t("справочник УУНиТ")}</a>{t(". Остановки и направления транспорта — по 2ГИС, проверены ")}{localize(CITY_ROUTES_CHECKED_AT)}{t(". Это подборка вариантов, а не расчёт самого короткого пути.")}</p><ul>{route.legs.filter(leg=>leg.sourceUrl).map((leg,index)=><li key={index}><a href={leg.sourceUrl} target="_blank" rel="noreferrer">{localize(leg.kind==='walk'?'Пересадка':`${leg.kind==='tram'?'Трамвай':'Автобус'} ${leg.line}`)}: {localize(leg.from)} → {localize(leg.to)}</a></li>)}</ul><p>{t("Карты ведут до адреса кампуса. Проходной пункт между корпусами 6 и 7 не привязан к GPS; найдите его на схеме кампуса.")}</p></details>
    </div>
  </section>
}
