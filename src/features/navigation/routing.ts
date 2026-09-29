/** Macro routes, not floor plans. Coordinates are diagram pixels, never metres.
 * Stair nodes represent unspecified staircases, not surveyed positions.
 * Only floor-marked passages in the supplied image enter the indoor graph.
 */
export type Point = readonly [number, number]
export interface Building { id: number; name: string; color: string; outline: string; center: Point; label: Point; entrance?: Point }
export const buildings: Building[] = [
  { id: 1, name: 'Корпус 1', color: '#6548dc', outline: 'M840 615H901V628H1012V614H1163V628H1290V615H1347V789H1290V707H901V789H840Z', center: [979,665], label: [979,665], entrance: [1090,615] },
  { id: 2, name: 'Корпус 2', color: '#f26432', outline: 'M574 450H789V513H779V787H709V772H669V688H709V633H669V550H709V513H574Z', center: [743,595], label: [743,637], entrance: [789,486] },
  { id: 3, name: 'Корпус 3', color: '#179979', outline: 'M239 513H414V434H471V587H296V713H456V787H239Z', center: [270,620], label: [270,657], entrance: [239,599] },
  { id: 4, name: 'Корпус 4', color: '#8961b6', outline: 'M264 247H542V322H471V434H414V322H296V513H239V284H264Z', center: [395,285], label: [395,285], entrance: [509,247] },
  { id: 5, name: 'Корпус 5', color: '#ed994b', outline: 'M542 247H633V322H542Z', center: [587,285], label: [587,285] },
  { id: 6, name: 'Корпус 6', color: '#e8a037', outline: 'M682 273H1028V395H934V346H779V450H709V346H682Z', center: [850,309], label: [850,309], entrance: [979,395] },
  { id: 7, name: 'Корпус 7', color: '#859099', outline: 'M1155 273H1573V346H1239V395H1155Z', center: [1345,309], label: [1345,309], entrance: [1197,395] },
  { id: 8, name: 'Корпус 8', color: '#179979', outline: 'M1401 346H1480V446H1573V273H1653V713H1573V537H1480V603H1401Z', center: [1510,491], label: [1510,491], entrance: [1653,486] },
  { id: 9, name: 'Корпус 9', color: '#859099', outline: 'M1393 704H1523V729H1573V713H1653V775Q1649 873 1569 845L1480 790H1393Z', center: [1491,756], label: [1491,756], entrance: [1437,790] },
]
export interface Connection { a: number; b: number; floor: number; points: Point[] }
export const connections: Connection[] = [
  { a:1,b:2,floor:2,points:[[979,665],[880,665],[800,665],[743,665],[743,595]] },
  { a:2,b:6,floor:2,points:[[743,595],[743,483],[743,420],[743,309],[850,309]] },
  { a:2,b:3,floor:3,points:[[743,595],[743,483],[443,483],[443,550],[270,550],[270,620]] },
  { a:3,b:4,floor:2,points:[[270,620],[270,540],[270,305],[395,285]] },
  { a:1,b:9,floor:2,points:[[979,665],[1305,665],[1360,665],[1407,722],[1491,756]] },
  { a:8,b:9,floor:3,points:[[1510,491],[1610,491],[1610,756],[1491,756]] },
  { a:8,b:9,floor:5,points:[[1510,491],[1610,491],[1610,756],[1491,756]] },
]

export interface Place { id: string; label: string; kind: 'room' | 'poi'; building?: number; floor?: number }
export interface UsefulPlace extends Place { icon: string; detail: string; sourceUrl?: string }
export const usefulPlaces: UsefulPlace[] = [
  { id:'main-entry',label:'Главный вход',kind:'poi',icon:'↗',detail:'Проходной пункт между корпусами 6 и 7' },
  { id:'mig',label:'МИГ-19',kind:'poi',icon:'✈',detail:'Ориентир и место встреч во дворе' },
  { id:'stop-tsum',label:'Остановка «ЦУМ»',kind:'poi',icon:'▣',detail:'Улица Карла Маркса · по предоставленной схеме' },
  { id:'stop-actor',label:'Остановка «Дом актёра»',kind:'poi',icon:'▣',detail:'Улица Пушкина · по предоставленной схеме' },
  { id:'mfso',label:'МФСО · 7-117',kind:'poi',building:7,floor:1,icon:'◎',detail:'Отдел по работе с обучающимися',sourceUrl:'https://uust.ru/mfso/office_contacts/' },
  { id:'tuition',label:'Платное обучение · 7-209',kind:'poi',building:7,floor:2,icon:'₽',detail:'Вход по лестнице в фойе корпуса 7',sourceUrl:'https://uust.ru/mfso/office_contacts/' },
  { id:'records',label:'Личные дела · 7-411',kind:'poi',building:7,floor:4,icon:'▤',detail:'Вход по лестнице в фойе корпуса 7',sourceUrl:'https://uust.ru/mfso/office_contacts/' },
  { id:'mobilization',label:'Мобилизационный отдел · 7-212',kind:'poi',building:7,floor:2,icon:'▧',detail:'Отдел мобилизационной подготовки',sourceUrl:'https://uust.ru/departments/mobilization-service/' },
  { id:'clinic',label:'Медпункт · 1-125',kind:'poi',building:1,floor:1,icon:'+',detail:'Отмечен на предоставленной схеме' },
  { id:'union',label:'Профком · 1-129',kind:'poi',building:1,floor:1,icon:'♡',detail:'Отмечен на предоставленной схеме' },
  { id:'library',label:'Библиотека',kind:'poi',building:7,icon:'▥',detail:'Корпус 7. Этаж на схеме не указан' },
  { id:'atm',label:'Банкомат',kind:'poi',building:6,icon:'₽',detail:'Корпус 6. Этаж на схеме не указан' },
  ...[[2,2],[3,2],[4,1],[6,2],[8,2]].map(([building,floor]): UsefulPlace => ({ id:`food-${building}`,label:building===3?'Столовая · корпус 3':`Буфет · корпус ${building}`,kind:'poi',building,floor,icon:'◒',detail:`${floor} этаж · по предоставленной схеме` })),
]
export interface Dormitory { id: number; address: string; sourceUrl: string }
export const dormitories: Dormitory[] = ['8 Марта, 2','8 Марта, 4','8 Марта, 6','8 Марта, 8','Мингажева, 162','Мингажева, 160','Мингажева, 160/1','Мингажева, 160/2','Мингажева, 158/1','Гоголя, 15','Заки Валиди, 33','Заки Валиди, 33','Свердлова, 60/1','Достоевского, 133','Аксакова, 53'].map((address,index)=>({id:index+1,address:`Уфа, улица ${address}`,sourceUrl:'https://uust.ru/campus/'}))
export function walkingLink(dorm: Dormitory): string {
  const url=new URL('https://www.google.com/maps/dir/')
  url.search=new URLSearchParams({api:'1',origin:dorm.address,destination:'Уфа, улица Карла Маркса, 12',travelmode:'walking'}).toString()
  return url.href
}
export function parsePlace(text: string): Place | null {
  const normalized=text.trim().toLowerCase().replace(/[–—−]/g,'-').replace(/\s/g,'')
  const poi=usefulPlaces.find(place=>place.id===normalized || place.label.toLowerCase().replace(/\s/g,'')===normalized)
  if(poi) return poi
  const entrance=/^(?:entry-|входвкорпус)([1-46-9])$/.exec(normalized)
  if(entrance) return {id:`entry-${entrance[1]}`,label:`Вход в корпус ${entrance[1]}`,kind:'poi',building:Number(entrance[1])}
  const match=/^([1-9])-([1-9]\d{2})$/.exec(normalized)
  if(!match) return null
  return {id:normalized,label:normalized,building:Number(match[1]),floor:Number(match[2][0]),kind:'room'}
}

export interface GraphNode { id: string; point: Point; building?: number; floor?: number }
export interface Edge { from: string; to: string; kind: 'stairs' | 'passage' | 'outdoor' | 'entry'; cost: number; points: Point[] }
export interface Graph { nodes: Record<string,GraphNode>; adjacency: Record<string,Edge[]> }
const distance=(a: Point,b: Point)=>Math.hypot(a[0]-b[0],a[1]-b[1])
function makeGraph(): Graph {
  const nodes: Graph['nodes']={},adjacency: Graph['adjacency']={}
  const node=(id:string,point:Point,building?:number,floor?:number)=>{ nodes[id]={id,point,building,floor};adjacency[id]=[] }
  const link=(a:string,b:string,kind:Edge['kind'],points:Point[],extra=0)=>{
    const cost=points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),extra)+1
    adjacency[a].push({from:a,to:b,kind,cost,points})
    adjacency[b].push({from:b,to:a,kind,cost,points:[...points].reverse()})
  }
  for(const building of buildings.filter(b=>b.id!==5)) {
    // Numbering convention, not a claim that all nine floors physically exist.
    for(let floor=1;floor<=9;floor++) node(`b${building.id}f${floor}`,building.center,building.id,floor)
    for(let floor=1;floor<9;floor++) link(`b${building.id}f${floor}`,`b${building.id}f${floor+1}`,'stairs',[building.center,building.center],110)
    if(building.entrance) {
      node(`entry-${building.id}`,building.entrance,building.id)
      link(`entry-${building.id}`,`b${building.id}f1`,'entry',[building.entrance,building.center])
    }
  }
  for(const c of connections) link(`b${c.a}f${c.floor}`,`b${c.b}f${c.floor}`,'passage',c.points)
  node('main-entry',[1091,357]);node('court-north',[1091,439]);node('court-west',[820,555]);node('court-east',[1368,555]);node('mig',[920,506])
  // Schematic courtyard connections, not surveyed pedestrian paths.
  const outdoor=(a:string,b:string,points?:Point[])=>link(a,b,'outdoor',points??[nodes[a].point,nodes[b].point],160)
  outdoor('main-entry','court-north')
  outdoor('court-north','entry-6',[[1091,439],[979,439],[979,395]])
  outdoor('court-north','entry-7',[[1091,439],[1197,439],[1197,395]])
  outdoor('court-north','court-west',[[1091,439],[820,439],[820,555]])
  outdoor('court-north','court-east',[[1091,439],[1368,439],[1368,555]])
  outdoor('court-west','entry-2',[[820,555],[820,486],[789,486]])
  outdoor('court-west','entry-1',[[820,555],[1090,555],[1090,615]])
  outdoor('court-west','mig',[[820,555],[920,555],[920,506]])
  outdoor('court-east','entry-9',[[1368,555],[1368,858],[1437,858],[1437,790]])
  outdoor('court-east','entry-8',[[1368,555],[1368,858],[1700,858],[1700,486],[1653,486]])
  outdoor('entry-3','entry-4',[[239,599],[210,599],[210,218],[509,218],[509,247]])
  outdoor('entry-4','entry-6',[[509,247],[509,218],[1065,218],[1065,439],[979,439],[979,395]])
  node('stop-tsum',[1018,66]);node('stop-actor',[79,635])
  outdoor('court-north','stop-tsum',[[1091,439],[1130,439],[1130,66],[1018,66]])
  outdoor('entry-3','stop-actor',[[239,599],[210,599],[210,735],[79,735],[79,635]])
  // An endpoint at the checkpoint is allowed, but it is not a through shortcut.
  link('main-entry','b6f1','entry',[[1091,357],[979,357],[979,395],[850,309]],80)
  link('main-entry','b7f1','entry',[[1091,357],[1197,357],[1345,309]],80)
  return {nodes,adjacency}
}
export const graph=makeGraph()
export interface Path { edges: Edge[]; cost: number }
export function findPath(start:string,end:string,outdoors:boolean): Path | null {
  if(!graph.nodes[start] || !graph.nodes[end]) return null
  const scores=new Map([[start,0]]),previous=new Map<string,Edge>(),open=new Set([start])
  // Every edge costs at least its straight-line length: admissible heuristic.
  const estimate=(id:string)=>(scores.get(id)??Infinity)+distance(graph.nodes[id].point,graph.nodes[end].point)
  while(open.size) {
    let current=''
    for(const id of open) if(!current || estimate(id)<estimate(current)) current=id
    if(current===end) {
      const edges:Edge[]=[]
      for(let id=end;id!==start;) { const edge=previous.get(id)!;edges.unshift(edge);id=edge.from }
      return {edges,cost:scores.get(end)!}
    }
    open.delete(current)
    for(const edge of graph.adjacency[current]) {
      if(!outdoors && edge.kind==='outdoor') continue
      if(edge.to==='main-entry' && end!=='main-entry') continue
      const next=scores.get(current)!+edge.cost
      if(next<(scores.get(edge.to)??Infinity)) { scores.set(edge.to,next);previous.set(edge.to,edge);open.add(edge.to) }
    }
  }
  return null
}
export interface RouteStep { title:string; detail:string; building?:number; floor?:number; points:Point[]; kind:'start'|'stairs'|'passage'|'outdoor'|'entry'|'finish' }
export interface RouteSuccess { ok:true; from:Place; to:Place; edges:Edge[]; steps:RouteStep[]; buildings:number[]; warnings:string[] }
export interface RouteError { ok:false; message:string; canUseCourtyard?:boolean }
export type Route=RouteSuccess|RouteError
function nodeFor(place:Place):string { return place.id.startsWith('entry-')?place.id:place.building?`b${place.building}f${place.floor??1}`:place.id }
export function planRoute(a:string,b:string,outdoors:boolean): Route {
  const from=parsePlace(a),to=parsePlace(b)
  if(!from || !to) return {ok:false,message:'Введите номер в формате «1-203»: корпус, дефис и три цифры аудитории. Или выберите место из списка.'}
  if(from.building===5 || to.building===5) return {ok:false,message:'Корпус 5 отмечен рядом с корпусом 4, но его вход и этажи перехода не указаны. Точный маршрут пока не построить. Уточните доступ у охраны корпуса 4.'}
  if(from.building&&!from.floor&&!from.id.startsWith('entry-')) return {ok:false,message:`Этаж места «${from.label}» неизвестен. Для старта укажите номер аудитории или выберите вход в корпус ${from.building} на карте.`}
  let targetNode=nodeFor(to)
  let path=findPath(nodeFor(from),targetNode,outdoors)
  if(to.building&&!to.floor&&!to.id.startsWith('entry-')) {
    // Stop on the floor where we enter the building, without inventing a POI floor.
    for(let floor=1;floor<=9;floor++) {
      const candidate=`b${to.building}f${floor}`,candidatePath=findPath(nodeFor(from),candidate,outdoors)
      if(candidatePath && (!path||candidatePath.cost<path.cost)) {path=candidatePath;targetNode=candidate}
    }
  }
  if(!path) return {ok:false,message:outdoors?'Для этих точек пока недостаточно сведений о переходах.':'По подтверждённым переходам пройти целиком внутри не получается. Разрешите выход во двор.',canUseCourtyard:!outdoors}
  const steps:RouteStep[]=[],warnings=['Этаж аудитории определён по первой цифре её номера. Наличие кабинета и этажей не проверено по плану. Лестницы обозначены условно.']
  const first=graph.nodes[nodeFor(from)]
  if(from.id===to.id) steps.push({title:'Вы уже в нужной точке',detail:from.label,building:from.building,floor:from.floor,points:[first.point],kind:'finish'})
  else {
    steps.push({title:`Старт: ${from.label}`,detail:from.building?`Корпус ${from.building}${from.floor?`, ${from.floor} этаж`:''}. Найдите указатели к лестнице или переходу.`:'Найдите этот ориентир на схеме.',building:from.building,floor:from.floor,points:[first.point],kind:'start'})
    for(let i=0;i<path.edges.length;i++) {
      const edge=path.edges[i],start=graph.nodes[edge.from]
      let end=graph.nodes[edge.to],points=[...edge.points]
      if(edge.kind==='stairs' || edge.kind==='outdoor') {
        while(path.edges[i+1]?.kind===edge.kind && (edge.kind!=='stairs' || graph.nodes[path.edges[i+1].to].building===end.building)) { const next=path.edges[++i];end=graph.nodes[next.to];points.push(...next.points.slice(1)) }
      }
      if(edge.kind==='stairs') steps.push({title:`${(end.floor??0)>(start.floor??0)?'Поднимитесь':'Спуститесь'} на ${end.floor} этаж`,detail:`Корпус ${end.building}. Воспользуйтесь лестницей по указателям; её точное положение пока неизвестно.`,building:end.building,floor:end.floor,points,kind:'stairs'})
      if(edge.kind==='passage') steps.push({title:`Перейдите в корпус ${end.building}`,detail:`Переход ${start.building} → ${end.building} на ${end.floor} этаже по предоставленной схеме.`,building:end.building,floor:end.floor,points,kind:'passage'})
      if(edge.kind==='outdoor') steps.push({title:'Пройдите через двор',detail:'Следуйте к отмеченному входу по схеме. Линия показывает ориентиры, а не точную пешеходную дорожку.',building:end.building,points,kind:'outdoor'})
      if(edge.kind==='entry') steps.push({title:edge.from==='main-entry'?`От проходного пункта — в корпус ${end.building}`:end.floor?`Войдите в корпус ${end.building}`:'Выйдите через отмеченный вход',detail:edge.from==='main-entry'||edge.to==='main-entry'?'Уточните направление у охраны. Этаж проходного пункта на схеме не указан; дальнейший путь начинается от входного уровня корпуса.':'Найдите лестницу или указатель нужного этажа. Входной уровень принят за 1 этаж, его нужно уточнить на месте.',building:end.building,floor:end.floor,points,kind:'entry'})
    }
    steps.push({title:to.kind==='room'?`Найдите аудиторию ${to.label}`:to.building&&!to.floor&&!to.id.startsWith('entry-')?`Уточните этаж: ${to.label}`:`Вы пришли: ${to.label}`,detail:to.kind==='room'?`Корпус ${to.building}, предполагаемый ${to.floor} этаж. Ищите номер на двери по указателям: плана этажа и точного положения кабинета пока нет.`:to.building&&!to.floor&&!to.id.startsWith('entry-')?'Вы в нужном корпусе. Этаж этого места неизвестен: уточните его у сотрудников.':'Ориентируйтесь по вывеске на месте. Положение двери на карте не отмечено.',building:to.building,floor:to.floor,points:[graph.nodes[targetNode].point],kind:'finish'})
  }
  if(path.edges.some(e=>e.kind==='outdoor')) warnings.push('Участок через двор показан схематично. Доступность входов на месте может меняться.')
  if(from.id==='main-entry'||to.id==='main-entry') warnings.push('Главный вход — выбранный вами проходной пункт между корпусами 6 и 7. Его этаж не указан на схеме.')
  if(path.edges.some(e=>[7,8].includes(graph.nodes[e.to].building??0))) warnings.push('Переход 7 ↔ 8 показан на схеме с разными этажами с двух сторон. До уточнения соответствия этажей он не используется.')
  const visited:number[]=[]
  for(const id of [nodeFor(from),...path.edges.map(e=>e.to)]) { const building=graph.nodes[id].building;if(building && visited.at(-1)!==building) visited.push(building) }
  return {ok:true,from,to,edges:path.edges,steps,buildings:visited,warnings}
}
