import { localize, t } from '../../shared/i18n/index.ts'
import { useEffect, useId, useRef, useState } from 'react'
import { buildings, connections, type Point, type RouteSuccess } from './routing'
import { describeStage } from './route-stage'
import styles from './Navigation.module.css'

const pointsText=(points: readonly Point[])=>points.map(p=>p.join(',')).join(' ')
const passages=[
  {x:809,y:727,label:'2 эт.'}, {x:830,y:419,label:'2 эт.'},
  {x:530,y:445,label:'3 эт.'}, {x:340,y:477,label:'2 эт.'},
  {x:1381,y:693,label:'2 эт.'}, {x:1640,y:748,label:'3, 5 эт.'},
]
const foodMarkers=[{building:2,point:[745,504]},{building:3,point:[411,754]},{building:4,point:[514,285]},{building:6,point:[966,309]},{building:8,point:[1613,557]}]
const labelPositions:Record<number,Point>={1:[1120,678],2:[743,746],6:[1005,357]}
const hasMovement=(points:readonly Point[])=>points.some(point=>point[0]!==points[0][0]||point[1]!==points[0][1])
const pinWidth=(label:string)=>Math.max(110,label.length*16+24)
function RoutePin({point,letter,label}:{point:Point;letter:string;label:string}) {
  const width=pinWidth(label)
  return <g transform={`translate(${point.join(' ')})`} className={styles.routePin}>
    <circle r="28" className={letter==='А'?styles.startPoint:styles.endPoint}/>
    <text y="7" textAnchor="middle" className={styles.pinLetter}>{localize(letter)}</text>
    <rect x="35" y="-43" width={width} height="43" rx="10"/>
    <text x="47" y="-14" className={styles.pinLabel}>{localize(label)}</text>
  </g>
}
interface CampusMapProps {route:RouteSuccess|null;activeStep:number;onSelect:(id:string)=>void;playing?:boolean;onChangeStep?:(index:number)=>void;onTogglePlayback?:()=>void;canExpand?:boolean}
export function CampusMap({route,activeStep,onSelect,playing=false,onChangeStep,onTogglePlayback,canExpand=true}:CampusMapProps) {
  const [zoom,setZoom]=useState(1)
  const [pan,setPan]=useState<Point>([0,0])
  const [routeFocused,setRouteFocused]=useState(Boolean(route))
  const [followStep,setFollowStep]=useState(true)
  // A new followed stage starts with its fitted view, even after manual panning.
  useEffect(()=>{if(followStep){setZoom(1);setPan([0,0])}},[activeStep,followStep])
  const svg=useRef<SVGSVGElement>(null)
  const [viewport,setViewport]=useState({width:900,height:570})
  useEffect(()=>{
    const element=svg.current
    if(!element) return
    const observer=new ResizeObserver(([entry])=>setViewport({width:entry.contentRect.width,height:entry.contentRect.height}))
    observer.observe(element)
    return ()=>observer.disconnect()
  },[])
  const pattern=useId().replace(/:/g,'')
  const routePoints=route?.steps.flatMap(s=>s.points)??[]
  const step=route?.steps[activeStep]
  const start=route?.steps[0].points[0],finish=route?.steps.at(-1)!.points[0]
  const samePoint=start&&finish&&start[0]===finish[0]&&start[1]===finish[1]
  const pins=route&&start&&finish?(samePoint?[{point:start,letter:'А/Б',label:`${route.from.label.split(' · ')[0]} → ${route.to.label.split(' · ')[0]}`}]:[{point:start,letter:'А',label:route.from.label.split(' · ')[0]},{point:finish,letter:'Б',label:route.to.label.split(' · ')[0]}]):[]
  const following=routeFocused&&followStep&&activeStep>0&&Boolean(step)
  const bounds:Point[]=following&&step?[...step.points,...step.points.map(p=>[p[0]+180,p[1]] as Point)]:[...routePoints,...pins.flatMap(pin=>[[pin.point[0]-28,pin.point[1]-43],[pin.point[0]+35+pinWidth(pin.label),pin.point[1]+28]] as Point[])]
  const minX=Math.min(...bounds.map(p=>p[0])),maxX=Math.max(...bounds.map(p=>p[0]))
  const minY=Math.min(...bounds.map(p=>p[1])),maxY=Math.max(...bounds.map(p=>p[1]))
  const focus=routeFocused&&routePoints.length>0
  const frameWidth=focus?Math.max(600,maxX-minX+160):1780
  const frameHeight=focus?Math.max(480,maxY-minY+180):840
  const ratio=viewport.width/Math.max(1,viewport.height)
  const fittedWidth=Math.max(frameWidth,frameHeight*ratio)
  const width=fittedWidth/zoom,height=fittedWidth/ratio/zoom
  const centerX=focus?(minX+maxX)/2:940,centerY=focus?(minY+maxY)/2:480
  const unitsPerPixel=width/Math.max(1,viewport.width)
  const routeFloors=route?[...new Set(route.steps.flatMap(s=>s.floor?[s.floor]:[]))].sort((a,b)=>a-b):[]
  const [floorChoice,setFloorChoice]=useState<{value:number|null;step:number}>({value:null,step:activeStep})
  const floor=!playing&&floorChoice.step===activeStep?floorChoice.value:null
  const setFloor=(value:number|null)=>setFloorChoice({value,step:activeStep})
  const stage=route?describeStage(route,activeStep):null
  const [selected,setSelected]=useState<number|null>(null)
  const [expanded,setExpanded]=useState(false)
  const dialog=useRef<HTMLDialogElement>(null)
  useEffect(()=>{const element=dialog.current;if(expanded&&element){element.showModal();return()=>element.close()}},[expanded])
  function closeExpanded() {dialog.current?.close();setExpanded(false)}
  const currentFloor=floor??step?.floor
  function pickBuilding(id:number) {setSelected(id)}
  const building=buildings.find(b=>b.id===selected)
  const visiblePaths=route?.steps.filter(s=>hasMovement(s.points)&&(floor===null||s.floor===floor||s.kind==='outdoor'))??[]
  const activePath=step&&hasMovement(step.points)&&(floor===null||step.floor===floor||step.kind==='outdoor')?step:null
  function showCampus() {setRouteFocused(false);setZoom(1);setPan([0,0]);setFloor(null)}
  function showRoute() {setRouteFocused(true);setFollowStep(false);setZoom(1);setPan([0,0]);setFloor(null)}
  function showStep() {setRouteFocused(true);setFollowStep(true);setZoom(1);setPan([0,0]);setFloor(null)}
  return <div className={styles.mapCard}>
    <div className={styles.mapViewport}>
      {stage&&route&&<div className={styles.mapStage} data-playing={playing}>
        <div role="status" aria-label={t("Этап на карте")} aria-live="polite" className={styles.stageDescription}>
          <div className={styles.stageMeta}><span>{t("Шаг ")}{localize(activeStep+1)}{t(" из ")}{localize(route.steps.length)}</span><span>{localize(stage.location)}</span><strong className={styles.stageLevel}>{localize(stage.level)}</strong></div>
          <h3>{localize(stage.title)}</h3>
          <p>{localize(step?.detail)}</p>
        </div>
        {onChangeStep&&onTogglePlayback&&<div className={styles.mapPlayer} aria-label={t("Этапы маршрута на карте")}>
          <div className={styles.stepActions}><button type="button" aria-label={t("Предыдущий этап на карте")} disabled={activeStep===0} onClick={()=>onChangeStep(activeStep-1)}>←</button>
          {activeStep<route.steps.length-1?<button type="button" className={styles.nextStepButton} aria-label={t("Следующий этап на карте")} onClick={()=>onChangeStep(activeStep+1)}>{t("Дальше ")}<span aria-hidden="true">→</span></button>:<button type="button" className={styles.nextStepButton} disabled={route.steps.length<2} onClick={()=>onChangeStep(0)}>{t("К началу ↺")}</button>}</div>
          <button type="button" className={styles.previewButton} aria-label={localize(playing?'Приостановить маршрут на карте':'Запустить маршрут на карте')} aria-pressed={playing} disabled={route.steps.length<2} onClick={onTogglePlayback}>{localize(playing?'Ⅱ Остановить просмотр':'▶ Просмотреть весь путь')}</button>
        </div>}
      </div>}
      <div className={styles.mapViewControls}><div>{route&&<><button type="button" aria-pressed={routeFocused&&followStep} onClick={showStep}>{t("Текущий шаг")}</button><button type="button" aria-label={t("Приблизить маршрут")} aria-pressed={routeFocused&&!followStep} onClick={showRoute}>{t("Весь путь")}</button></>}<button type="button" aria-pressed={!routeFocused} onClick={showCampus}>{t("Весь кампус")}</button></div><span className={styles.mapAddress}>{t("Карла Маркса, 12")}</span></div>
      <svg ref={svg} viewBox={`${centerX-width/2+pan[0]} ${centerY-height/2+pan[1]} ${width} ${height}`} className={styles.campusSvg} role="group" aria-label={t("Схема кампуса. Выберите корпус, чтобы задать вход как начало или конец маршрута.")} onFocusCapture={event=>{
        const target=event.target
        if(!(target instanceof SVGElement)||!target.matches(':focus-visible')||!svg.current) return
        const item=target.getBoundingClientRect(),canvas=svg.current.getBoundingClientRect()
        const x=item.x+item.width/2,y=item.y+item.height/2
        if(x<canvas.left||x>canvas.right||y<canvas.top||y>canvas.bottom) showCampus()
      }}>
        <defs><pattern id={pattern} width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.5" fill="currentColor" opacity=".08"/></pattern></defs>
        <rect x="-1000" y="-1000" width="5000" height="3500" fill={`url(#${pattern})`} pointerEvents="none" />
        <g className={styles.street}>
          <path d="M110 0H166V950H110ZM0 92H1888V148H0ZM1741 0H1797V950H1741Z"/>
          <text x="765" y="132" textAnchor="middle">{t("ул. Карла Маркса")}</text>
          <text transform="translate(149 594) rotate(-90)" textAnchor="middle">{t("ул. Пушкина")}</text>
          <text transform="translate(1780 517) rotate(-90)" textAnchor="middle">{t("ул. Коммунистическая")}</text>
        </g>
        <g className={styles.connectors}>
          <path d="M471 450H574V513H471ZM779 627H840V707H779ZM1310 610Q1348 545 1401 545V575Q1370 584 1370 640Q1440 662 1440 704H1393Q1378 665 1310 675Z"/>
          <path d="M1028 331H1155V386H1028Z" className={styles.checkpointShape}/>
        </g>
        {buildings.map(b=><g key={b.id} role="button" tabIndex={0} aria-label={localize(`Корпус ${b.id}${b.id===5?'. Переход не уточнён':''}`)} aria-pressed={selected===b.id} aria-current={step?.building===b.id?'location':undefined} className={`${styles.building} ${route&&!route.buildings.includes(b.id)?styles.inactiveBuilding:''} ${step?.building===b.id&&activeStep>0?styles.currentBuilding:''}`} onClick={()=>pickBuilding(b.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pickBuilding(b.id)}}}>
          <path d={b.outline} fill={b.color} className={`${route?.buildings.includes(b.id)?styles.visitedBuilding:''} ${selected===b.id?styles.selectedBuilding:''}`}/>
          <g className={styles.buildingBadge} transform={`translate(${(labelPositions[b.id]??b.label).join(' ')})`}><circle r={14*unitsPerPixel}/><text y={6*unitsPerPixel} textAnchor="middle" style={{fontSize:17*unitsPerPixel}}>{localize(b.id)}</text></g>
          {b.entrance&&<g className={styles.entrance}><circle cx={b.entrance[0]} cy={b.entrance[1]} r="11"/><path d={`M${b.entrance[0]-4} ${b.entrance[1]+2}l4 -5 4 5`} /></g>}
        </g>)}
        <g className={styles.passageLabels}>{passages.map(p=><g key={p.x} className={stage?.kind==='passage'&&p.label.startsWith(`${currentFloor} `)?styles.currentPassageLabel:undefined}><rect x={p.x-30} y={p.y-19} width={p.label.length>5?92:72} height="31" rx="10"/><text x={p.x+6} y={p.y+4} textAnchor="middle">{localize(p.label)}</text></g>)}</g>
        <g className={styles.blocked}><circle cx="443" cy="434" r="16"/><path d="M432 445l22-22"/><circle cx="456" cy="750" r="16"/><path d="M445 761l22-22"/></g>
        <g className={styles.unconfirmed}><path d="M1490 321V382"/><text x="1520" y="387">{t("этажи уточнить")}</text></g>
        <g className={styles.landmark} role="button" tabIndex={0} aria-label={t("МИГ-19. Выбрать как пункт назначения")} onClick={()=>onSelect('mig')} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect('mig')}}}><text x="920" y="516" textAnchor="middle" className={styles.plane}>✈</text><text x="920" y="556" textAnchor="middle">{t("МИГ-19")}</text></g>
        <g className={styles.landmark} role="button" tabIndex={0} aria-label={t("Главный вход. Выбрать как пункт назначения")} onClick={()=>onSelect('main-entry')} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect('main-entry')}}}><rect x="1028" y="331" width="127" height="55" rx="8"/><text x="1091" y="348" textAnchor="middle" className={styles.entryText}>{t("ГЛАВНЫЙ")}</text><text x="1091" y="373" textAnchor="middle" className={styles.entryText}>{t("ВХОД")}</text></g>
        <g className={styles.stop} role="button" tabIndex={0} aria-label={t("Остановка ЦУМ. Выбрать как пункт назначения")} onClick={()=>onSelect('stop-tsum')} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect('stop-tsum')}}}><text x="1018" y="66" textAnchor="middle">{t("▣ ЦУМ")}</text></g>
        <g className={styles.stop} role="button" tabIndex={0} aria-label={t("Остановка Дом актёра. Выбрать как пункт назначения")} onClick={()=>onSelect('stop-actor')} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect('stop-actor')}}}><text transform="translate(79 635) rotate(-90)" textAnchor="middle">{t("▣ Дом актёра")}</text></g>
        {!routeFocused&&foodMarkers.map(marker=><g key={marker.building} className={styles.foodMarker} role="button" tabIndex={0} aria-label={localize(`${marker.building===3?'Столовая':'Буфет'}, корпус ${marker.building}. Выбрать как пункт назначения`)} onClick={()=>onSelect(`food-${marker.building}`)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onSelect(`food-${marker.building}`)}}}><circle cx={marker.point[0]} cy={marker.point[1]} r="20"/><text x={marker.point[0]} y={marker.point[1]+7} textAnchor="middle">◒</text></g>)}
        {!routeFocused&&<g className={styles.mapPoi}><text x="1270" y="393">{t("МФСО · ОМП")}</text><text x="1320" y="680" textAnchor="middle">+</text><text x="1320" y="768" textAnchor="middle">♡</text><text x="962" y="375" textAnchor="middle">₽</text></g>}
        {connections.filter(c=>floor!==null&&c.floor===floor).map((c,index)=><polyline key={index} points={pointsText(c.points)} className={styles.availablePassage}/>)}
        <g aria-hidden="true" className={styles.routeLines}>
          {visiblePaths.map((s,index)=><g key={index} className={(playing||activeStep>0)&&s.floor!==step?.floor?styles.otherFloorRoute:undefined}>
            <polyline points={pointsText(s.points)} vectorEffect="non-scaling-stroke" className={styles.routeHalo}/>
            <polyline points={pointsText(s.points)} vectorEffect="non-scaling-stroke" className={styles.routeBorder}/>
            <polyline points={pointsText(s.points)} vectorEffect="non-scaling-stroke" className={`${styles.routeBase} ${s.kind==='outdoor'?styles.outdoorLine:''}`}/>
          </g>)}
          {activePath&&<polyline key={activeStep} points={pointsText(activePath.points)} vectorEffect="non-scaling-stroke" pathLength={1} className={styles.routeActive}/>}
          {visiblePaths.flatMap((s,si)=>s.points.slice(1).map((b,i)=>{
            const a=s.points[i],distance=Math.hypot(b[0]-a[0],b[1]-a[1])
            if(distance<90) return null
            const angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI
            return <g key={`${si}-${i}`} className={(playing||activeStep>0)&&s.floor!==step?.floor?styles.otherFloorRoute:undefined} transform={`translate(${(a[0]+b[0])/2} ${(a[1]+b[1])/2}) rotate(${angle})`}><path d="M-12 -12L0 0L-12 12" vectorEffect="non-scaling-stroke" className={styles.arrowHalo}/><path d="M-12 -12L0 0L-12 12" vectorEffect="non-scaling-stroke" className={styles.routeArrow}/></g>
          }))}
          {step&&(floor===null||step.floor===floor||!step.floor)&&<g><circle cx={step.points.at(-1)![0]} cy={step.points.at(-1)![1]} r="20" className={styles.currentPoint}/><circle cx={step.points.at(-1)![0]} cy={step.points.at(-1)![1]} r="7" fill="white"/></g>}
          {pins.map(pin=><RoutePin key={pin.letter} {...pin}/>)}
          {step&&(floor===null||step.floor===floor||!step.floor)&&<circle cx={step.points.at(-1)![0]} cy={step.points.at(-1)![1]} r="35" vectorEffect="non-scaling-stroke" className={styles.currentRing}/>}
          {step?.kind==='stairs'&&(floor===null||step.floor===floor)&&<g transform={`translate(${step.points.at(-1)!.join(' ')}) scale(${unitsPerPixel})`} aria-hidden="true" className={styles.stairMarker}><circle r="20"/><path d="M-11 10H-4V3H3V-4H10V-11"/></g>}
        </g>
      </svg>
      <div className={styles.zoomTools} aria-label={t("Масштаб карты")}><button type="button" aria-label={t("Увеличить карту")} disabled={zoom>=2.5} onClick={()=>setZoom(z=>Math.min(2.5,z+.3))}>+</button><button type="button" aria-label={t("Уменьшить карту")} disabled={zoom<=1} onClick={()=>{setZoom(z=>Math.max(1,z-.3));setPan([0,0])}}>−</button><button type="button" aria-label={t("Показать всю карту")} onClick={showCampus}>↺</button>{canExpand&&<button type="button" aria-label={t("Развернуть карту")} onClick={()=>setExpanded(true)}>⛶</button>}</div>
      {zoom>1&&<div className={styles.panTools} aria-label={t("Сдвиг карты")}><button type="button" aria-label={t("Карта влево")} onClick={()=>setPan(p=>[Math.max(-450,p[0]-100),p[1]])}>←</button><button type="button" aria-label={t("Карта вверх")} onClick={()=>setPan(p=>[p[0],Math.max(-230,p[1]-100)])}>↑</button><button type="button" aria-label={t("Карта вниз")} onClick={()=>setPan(p=>[p[0],Math.min(230,p[1]+100)])}>↓</button><button type="button" aria-label={t("Карта вправо")} onClick={()=>setPan(p=>[Math.min(450,p[0]+100),p[1]])}>→</button></div>}
    </div>
    <div className={styles.mapFooter}>
      <p className={styles.mapDisclaimer}>{t("Схема ведёт до корпуса и предполагаемого этажа. Дверь аудитории ищите по указателям.")}</p>
      <details className={styles.mapDetails}><summary>{t("Этажи и обозначения на схеме")}</summary>
      <div className={styles.floorTabs} aria-label={t("Слой карты")}><button type="button" aria-pressed={floor===null} onClick={()=>setFloor(null)}>{t("Весь маршрут")}</button>{(routeFloors.length?routeFloors:[1,2,3,5]).map(f=><button type="button" key={f} aria-pressed={floor===f} aria-current={stage?.floor===f?'step':undefined} onClick={()=>setFloor(f)}>{localize(f)}{t(" эт.")}{stage?.floor===f&&<span className={styles.srOnly}>{t(" · текущий этап")}</span>}</button>)}</div>
      <div className={styles.legend}><span><i className={styles.legendRoute}/>{t("Весь путь")}</span><span><i className={styles.legendActive}/>{t("Текущий шаг")}</span><span><i className={styles.legendDoor}/>{t("Вход")}</span><span><i className={styles.legendBlocked}/>{t("Нет перехода")}</span><span>{t("Цифры — номера корпусов")}</span></div>
      <p>{t("Линии условные: это схема переходов, не план коридоров. Нажмите на корпус, чтобы выбрать его вход.")}</p>
      </details>
    </div>
    {building&&<div className={styles.buildingInfo}><div><strong>{localize(building.name)}</strong><span>{localize(building.id===5?'Доступ через корпус 4 нужно уточнить':`Подтверждённые переходы: ${connections.filter(c=>c.a===building.id||c.b===building.id).map(c=>`${c.a===building.id?c.b:c.a} (${c.floor} эт.)`).join(', ')||'этажи не уточнены'}`)}</span></div>{building.id!==5&&<button type="button" onClick={()=>onSelect(`entry-${building.id}`)}>{t("Ко входу")}</button>}<button type="button" aria-label={t("Закрыть сведения о корпусе")} onClick={()=>setSelected(null)}>×</button></div>}
    {expanded&&<dialog ref={dialog} className={styles.mapDialog} aria-label={t("Развёрнутая карта кампуса")} onCancel={event=>{event.preventDefault();closeExpanded()}}><div className={styles.dialogHeading}><strong>{t("Схема кампуса")}</strong><button type="button" autoFocus onClick={closeExpanded}>{t("Закрыть ×")}</button></div><CampusMap canExpand={false} route={route} activeStep={activeStep} playing={playing} onChangeStep={onChangeStep} onTogglePlayback={onTogglePlayback} onSelect={id=>{closeExpanded();onSelect(id)}}/></dialog>}
  </div>
}
