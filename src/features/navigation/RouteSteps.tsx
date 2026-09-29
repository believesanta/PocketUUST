import { t, localize } from '../../shared/i18n/index.ts'
import { useEffect, useRef } from 'react'
import type { RouteSuccess } from './routing'
import { describeStage } from './route-stage'
import styles from './Navigation.module.css'

export function RouteSteps({route,active,onChange}:{route:RouteSuccess;active:number;onChange:(step:number)=>void}) {
  const strip=useRef<HTMLOListElement>(null)
  useEffect(()=>{
    const container=strip.current
    const item=container?.children[active] as HTMLElement|undefined
    if(container&&item) container.scrollTo({left:item.offsetLeft-container.clientWidth/2+item.clientWidth/2,behavior:'instant'})
  },[active])
  return <section className={styles.journey} aria-label={t("Маршрут по этапам")}>
    <div className={styles.journeyHeading}>
      <h3>{localize(route.from.label)} <span aria-hidden="true">→</span> {localize(route.to.label)}</h3>
      <span>{localize(route.edges.some(e=>e.kind==='outdoor')?'Через двор и корпуса':'Внутри корпусов')} · {localize(route.steps.length)}{t(" шагов")}</span>
    </div>
    <ol ref={strip} className={styles.journeyStrip} aria-label={t("Выберите этап маршрута")}>
      {route.steps.map((step,index)=>{
        const stage=describeStage(route,index)
        const stairSymbol=(route.steps[index-1]?.floor??0)>(step.floor??0)?'↘':'↗'
        const label=step.kind==='start'?route.from.label:step.kind==='finish'?route.to.label:step.kind==='stairs'?'Лестница':step.kind==='passage'?`Корпус ${step.building}`:step.kind==='outdoor'?'Через двор':step.building?`Вход · ${step.building}`:'Вход'
        return <li key={index} data-state={index===active?'current':index<active?'passed':'next'}>
          <button type="button" aria-label={localize(`${step.title}. ${stage.level}`)} aria-current={index===active?'step':undefined} onClick={()=>onChange(index)}>
            <span className={styles.journeyNode} aria-hidden="true">{localize(index<active?'✓':step.kind==='stairs'?stairSymbol:index+1)}</span>
            <strong>{localize(label)}</strong><small>{localize(stage.level)}</small>
          </button>
        </li>
      })}
    </ol>
    <details className={styles.journeyDetails}>
      <summary>{t("Все инструкции и особенности пути")}</summary>
      <ol>{route.steps.map((step,index)=><li key={index}><strong>{localize(step.title)}</strong><p>{localize(step.detail)}</p></li>)}</ol>
      <ul>{route.warnings.map(w=><li key={w}>{localize(w)}</li>)}</ul>
      <p>{t("Это схема переходов. Расстояние и время не рассчитаны: масштаба и планов этажей нет.")}</p>
    </details>
  </section>
}
