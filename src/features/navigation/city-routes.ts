import type { Dormitory } from './routing'

export interface CityLeg {
  kind:'walk'|'bus'|'tram'|'car'
  from:string
  to:string
  line?:string
  direction?:string
  stops?:string[]
  detail:string
  sourceUrl?:string
  fromPoint?:string
  toPoint?:string
}
export interface CityRoute {
  id:string
  title:string
  summary:string
  mode:'walking'|'transit'|'driving'
  legs:CityLeg[]
}
const campus='Карла Маркса, 12'
const entrance='Главный вход'
const routes={
  bus75:'https://2gis.ru/ufa/route/2393143027318257',
  bus39:'https://2gis.ru/ufa/route/2393142892429406',
  bus14:'https://2gis.ru/ufa/route/2393143095607366',
  bus6:'https://2gis.ru/ufa/route/2393142892429558',
  tram18:'https://2gis.ru/ufa/route/2393142892429353',
}
export const CITY_ROUTES_CHECKED_AT='27 сентября 2026'
const walk=(from:string,to:string,detail:string):CityLeg=>({kind:'walk',from,to,detail})
const lastWalk=(stop:string)=>walk(stop,entrance,'Дойдите до кампуса на Карла Маркса, 12. Вход — проходной пункт между корпусами 6 и 7. Точную дорожку от остановки покажут карты.')
const bus75=():CityLeg=>({kind:'bus',line:'75',from:'Дом печати',to:'ЦУМ',direction:'ТСК Пушкинский',stops:['ТК Центральный','Авиатехникум','Дом профсоюзов','Столетия Башавтотранс'],detail:'Садитесь в направлении «ТСК Пушкинский». Выходите на «ЦУМ». Обратный маршрут отличается.',sourceUrl:routes.bus75})
const bus14=():CityLeg=>({kind:'bus',line:'14',from:'Пушкина',to:'ЦУМ',direction:'Исследовательская',stops:['Музей им. Нестерова'],detail:'Нужна автобусная остановка «Пушкина» и направление «Исследовательская», через музей Нестерова до «ЦУМ».',sourceUrl:routes.bus14})
// Public 2GIS platforms: tram18 toward Gosсircus (0711), bus75 toward Pushkinsky (0926).
const printHouseTransfer=():CityLeg=>({...walk('Дом печати · трамвай','Дом печати · автобус','Перейдите к автобусной остановке «Дом печати» для направления «ТСК Пушкинский». Используйте пешеходный переход.'),fromPoint:'54.735366,55.971177',toPoint:'54.737099,55.970165',sourceUrl:'https://2gis.ru/ufa/station/2393323281055823'})

/** Ready-made stop sequences verified against the public direction lists in 2GIS.
 * The graphics show stages, not surveyed city geometry or real-time departures.
 */
export function getDormRoutes(dorm:Dormitory):CityRoute[] {
  const start=`Общежитие № ${dorm.id}`
  const approach=(stop:string)=>walk(start,stop,`${dorm.address}. Дойдите до остановки «${stop}»; выбирайте сторону по направлению на автобусе. Подход покажут карты.`)
  const transit:CityRoute[]=[]
  if(dorm.id<=9) {
    transit.push({id:'bus-75',title:'Автобус 75',summary:'Без пересадок · выход у ЦУМ',mode:'transit',legs:[approach('Дом печати'),bus75(),lastWalk('ЦУМ')]})
    transit.push({id:'bus-39',title:'Автобус 39',summary:'Без пересадок · выход у БГМУ',mode:'transit',legs:[approach('Дом печати'),{kind:'bus',line:'39',from:'Дом печати',to:'БГМУ',direction:'ТСК Пушкинский',stops:['ТК Центральный','Поликлиника №5','Гостиница Башкортостан','Гостиный Двор'],detail:'Садитесь в сторону «ТСК Пушкинский» и выходите у БГМУ. Затем пройдите к кампусу.',sourceUrl:routes.bus39},lastWalk('БГМУ')]})
  } else if(dorm.id===14) {
    transit.push({id:'tram-18-bus-75',title:'Трамвай 18 + автобус 75',summary:'1 пересадка · старт у РКБ',mode:'transit',legs:[approach('РКБ им. Г.Г. Куватова'),{kind:'tram',line:'18',from:'РКБ им. Г.Г. Куватова',to:'Дом печати',direction:'Госцирк',stops:['Революционная'],detail:'Садитесь в сторону «Госцирк». После «Революционной» выходите на «Дом печати».',sourceUrl:routes.tram18},printHouseTransfer(),bus75(),lastWalk('ЦУМ')]})
    transit.push({id:'bus-75',title:'Автобус 75',summary:'Без пересадок · дальше идти до остановки',mode:'transit',legs:[approach('Дом печати'),bus75(),lastWalk('ЦУМ')]})
  } else {
    if(dorm.id===13) transit.push({id:'bus-6',title:'Автобус 6',summary:'Без пересадок · посадка у Телецентра',mode:'transit',legs:[approach('Телецентр'),{kind:'bus',line:'6',from:'Телецентр',to:'БГМУ',direction:'ОК Сипайловский',stops:['Пушкина'],detail:'От «Телецентра» садитесь в сторону «ОК Сипайловский». После «Пушкина» выходите у БГМУ.',sourceUrl:routes.bus6},lastWalk('БГМУ')]})
    transit.push({id:'bus-14',title:'Автобус 14',summary:'Без пересадок · через остановку «Пушкина»',mode:'transit',legs:[approach('Пушкина'),bus14(),lastWalk('ЦУМ')]})
  }
  return [...transit,
    {id:'walk',title:'Пешком',summary:'Без ожидания транспорта',mode:'walking',legs:[walk(start,campus,`${dorm.address}. Следуйте пешим маршрутом до Карла Маркса, 12; повороты и переходы покажут карты.`),walk(campus,entrance,'Найдите проходной пункт между корпусами 6 и 7.')]},
    {id:'car',title:'Машина / такси',summary:'Без пешего пути по городу',mode:'driving',legs:[{kind:'car',from:start,to:campus,detail:`Точка посадки: ${dorm.address}. Пункт назначения: Уфа, улица Карла Маркса, 12. Попросите высадить у разрешённого места рядом с кампусом.`},walk(campus,entrance,'От места высадки дойдите до проходного пункта между корпусами 6 и 7. Машина не заезжает в кампус автоматически.')]},
  ]
}

export function cityRouteLink(dorm:Dormitory,mode:CityRoute['mode']):string {
  const url=new URL('https://www.google.com/maps/dir/')
  url.search=new URLSearchParams({api:'1',origin:dorm.address,destination:'Уфа, улица Карла Маркса, 12',travelmode:mode}).toString()
  return url.href
}

/** Exact curated vehicle direction; walking approaches remain separate links. */
export function walkingLegLink(dorm:Dormitory,leg:CityLeg):string {
  const url=new URL('https://www.google.com/maps/dir/')
  const address=(label:string)=>label.startsWith('Общежитие')?dorm.address:label===entrance||label===campus?'Уфа, улица Карла Маркса, 12':`Уфа, остановка ${label.replace(/ · .+$/,'')}`
  url.search=new URLSearchParams({api:'1',origin:leg.fromPoint??address(leg.from),destination:leg.toPoint??address(leg.to),travelmode:'walking'}).toString()
  return url.href
}
