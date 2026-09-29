import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePlace, planRoute, graph, findPath, dormitories, walkingLink, connections } from '../src/features/navigation/routing.ts'
import { describeStage } from '../src/features/navigation/route-stage.ts'
import { getDormRoutes, cityRouteLink, walkingLegLink } from '../src/features/navigation/city-routes.ts'

test('map stage reports passage floors, stair changes and outdoors without inventing a floor',()=>{
  const route=planRoute('1-203','6-401',false)
  assert.equal(describeStage(route,1).level,'2 этаж')
  assert.equal(describeStage(route,1).location,'Корпуса 1 → 2')
  const stairs=route.steps.findIndex(step=>step.kind==='stairs')
  assert.equal(describeStage(route,stairs).level,'2 → 4 этаж')
  const outdoor=planRoute('1-203','7-117',true)
  assert.equal(describeStage(outdoor,outdoor.steps.findIndex(step=>step.kind==='outdoor')).level,'Через двор')
  const unknown=planRoute('1-203','library',true)
  assert.equal(describeStage(unknown,unknown.steps.length-1).level,'Этаж уточнить')
})

test('every dormitory has distinct walking, vehicle and transit choices ending at the checkpoint',()=>{
  for(const dorm of dormitories) {
    const choices=getDormRoutes(dorm)
    assert.ok(choices.length>=3)
    assert.equal(new Set(choices.map(choice=>choice.id)).size,choices.length)
    assert.deepEqual([...new Set(choices.map(choice=>choice.mode))].sort(),['driving','transit','walking'])
    for(const choice of choices) {
      assert.equal(choice.legs[0].from,`Общежитие № ${dorm.id}`)
      assert.equal(choice.legs.at(-1).to,'Главный вход')
      const url=new URL(cityRouteLink(dorm,choice.mode))
      assert.equal(url.searchParams.get('origin'),dorm.address)
      assert.equal(url.searchParams.get('destination'),'Уфа, улица Карла Маркса, 12')
      assert.equal(url.searchParams.get('travelmode'),choice.mode)
      if(choice.mode==='transit') {
        assert.ok(choice.legs.some(leg=>leg.kind==='bus'))
        assert.equal(choice.legs[0].kind,'walk')
        assert.equal(choice.legs.at(-1).kind,'walk')
        for(const leg of choice.legs.filter(leg=>leg.kind==='bus'||leg.kind==='tram')) {
          assert.ok(leg.direction)
          assert.match(leg.sourceUrl,/^https:\/\/2gis\.ru\/ufa\/route\//)
        }
      }
    }
  }
})

test('curated rides use the verified direction and separate the walking transfer',()=>{
  const bus=getDormRoutes(dormitories[0]).find(route=>route.id==='bus-75').legs[1]
  assert.equal(bus.direction,'ТСК Пушкинский')
  assert.equal(bus.from,'Дом печати')
  assert.equal(bus.to,'ЦУМ')
  const transfer=getDormRoutes(dormitories[13]).find(route=>route.id==='tram-18-bus-75')
  assert.deepEqual(transfer.legs.map(leg=>leg.kind),['walk','tram','walk','bus','walk'])
  assert.equal(transfer.legs[1].direction,'Госцирк')
  const transferLink=new URL(walkingLegLink(dormitories[13],transfer.legs[2]))
  assert.notEqual(transferLink.searchParams.get('origin'),transferLink.searchParams.get('destination'))
  assert.equal(transferLink.searchParams.get('origin'),'54.735366,55.971177')
  assert.equal(transferLink.searchParams.get('destination'),'54.737099,55.970165')
  const approach=new URL(walkingLegLink(dormitories[0],getDormRoutes(dormitories[0])[0].legs[0]))
  assert.equal(approach.searchParams.get('origin'),dormitories[0].address)
  assert.equal(approach.searchParams.get('destination'),'Уфа, остановка Дом печати')
  assert.equal(approach.searchParams.get('travelmode'),'walking')
})

test('room input extracts building and inferred floor and rejects broken values', () => {
  assert.deepEqual(parsePlace(' 1 – 203 '), { id: '1-203', label: '1-203', building: 1, floor: 2, kind: 'room' })
  assert.equal(parsePlace('6-401').floor, 4)
  for (const bad of ['', '203', '0-203', '10-203', '1-003', '1-1234', '<script>', '1-20a']) assert.equal(parsePlace(bad), null, bad)
})

test('example route uses the second-floor passages and then stairs, without outdoors', () => {
  const route = planRoute('1-203', '6-401', false)
  assert.equal(route.ok, true)
  assert.deepEqual(route.buildings, [1, 2, 6])
  assert.equal(route.edges.filter(e => e.kind === 'passage').length, 2)
  assert.equal(route.edges.some(e => e.kind === 'outdoor'), false)
  assert.equal(route.steps.at(-1).floor, 4)
  assert.match(route.steps.at(-1).detail, /двер|указател/)
})

test('blocked and undocumented transitions never appear in the graph', () => {
  const pairs = connections.map(c => [c.a, c.b].sort((a,b) => a-b).join('-'))
  assert.equal(pairs.includes('5-6'), false)
  assert.equal(pairs.includes('7-8'), false)
  const route = planRoute('3-201', '2-201', false)
  assert.equal(route.ok, true)
  const passage = route.edges.find(e => e.kind === 'passage')
  assert.equal(graph.nodes[passage.from].floor, 3)
  assert.equal(graph.nodes[passage.to].floor, 3)
  assert.equal(planRoute('5-101', '1-203', true).ok, false)
})

test('unknown places and identical rooms have safe, meaningful outcomes', () => {
  assert.equal(planRoute('foo','6-401',true).ok, false)
  const route = planRoute('1-203','1-203',false)
  assert.equal(route.ok,true)
  assert.equal(route.edges.length,0)
  assert.match(route.steps[0].title,/уже/)
})

test('entrance display labels preserve canonical endpoints when re-submitted or swapped', () => {
  assert.equal(parsePlace('Вход в корпус 6').id,'entry-6')
  const original=planRoute('1-203','entry-6',true)
  const display=planRoute('1-203','Вход в корпус 6',true)
  assert.equal(original.ok,true)
  assert.deepEqual(display.edges,original.edges)
  assert.equal(planRoute('Вход в корпус 6','1-203',true).edges[0].from,'entry-6')
})

test('courtyard edges stay outside the solid wings of building 8', () => {
  const inside8=([x,y])=> (x>1401&&x<1480&&y>346&&y<603) || (x>1401&&x<1653&&y>446&&y<537) || (x>1573&&x<1653&&y>273&&y<713)
  for(const edges of Object.values(graph.adjacency)) for(const edge of edges) {
    if(edge.kind!=='outdoor') continue
    for(let i=1;i<edge.points.length;i++) {
      const a=edge.points[i-1],b=edge.points[i]
      const count=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1])/5)
      for(let sample=1;sample<count;sample++) {
        const ratio=sample/count
        assert.equal(inside8([a[0]+(b[0]-a[0])*ratio,a[1]+(b[1]-a[1])*ratio]),false,`${edge.from} → ${edge.to} crosses building 8`)
      }
    }
  }
})

test('indoor-only routing does not silently cross the courtyard or checkpoint', () => {
  assert.equal(planRoute('1-203','7-117',false).ok,false)
  const route=planRoute('1-203','7-117',true)
  assert.equal(route.ok,true)
  assert.equal(route.edges.some(e=>e.kind==='outdoor'),true)
  assert.equal(planRoute('main-entry','6-401',false).ok,true)
})

test('an unknown POI floor never causes an invented descent to floor one', () => {
  const route=planRoute('6-401','atm',false)
  assert.equal(route.ok,true)
  assert.equal(route.edges.some(e=>e.kind==='stairs'),false)
  assert.match(route.steps.at(-1).detail,/неизвестен/)
  assert.equal(planRoute('atm','6-401',false).ok,false)
})

test('marked bus stops are outdoor endpoints and require courtyard permission', () => {
  for(const stop of ['stop-tsum','stop-actor']) {
    assert.notEqual(parsePlace(stop),null)
    assert.equal(planRoute('1-203',stop,false).ok,false)
    assert.equal(planRoute('1-203',stop,true).ok,true)
  }
})

test('A* agrees with independent Dijkstra, including stairs and disconnected endpoints', () => {
  const keys=Object.keys(graph.nodes)
  assert.ok(keys.length > 20)
  for(const indoor of [true,false]) for(const start of ['b1f2','b3f3','b7f1','b8f5','main-entry']) {
    const dist=new Map([[start,0]]),pending=new Set(keys)
    while(pending.size){
      let best=null
      for(const id of pending) if(best===null || (dist.get(id)??Infinity)<(dist.get(best)??Infinity)) best=id
      if(best===null || !Number.isFinite(dist.get(best))) break
      pending.delete(best)
      for(const edge of graph.adjacency[best]??[]) {
        if(indoor && edge.kind==='outdoor') continue
        if(edge.to==='main-entry') continue
        const cost=dist.get(best)+edge.cost
        if(cost<(dist.get(edge.to)??Infinity)) dist.set(edge.to,cost)
      }
    }
    for(const end of keys) {
      if(end==='main-entry') continue
      const result=findPath(start,end,!indoor)
      assert.equal(result?.cost??Infinity,dist.get(end)??Infinity,`${start} → ${end}, indoor ${indoor}`)
      if(result) assert.equal(result.edges.every(e=>e.cost>0),true)
    }
  }
})

test('all 15 dormitories create encoded pedestrian links, with campus address not invented coordinates', () => {
  assert.equal(dormitories.length,15)
  for(const dorm of dormitories) {
    const url=new URL(walkingLink(dorm))
    assert.equal(url.protocol,'https:')
    assert.equal(url.searchParams.get('origin'),dorm.address)
    assert.equal(url.searchParams.get('destination'),'Уфа, улица Карла Маркса, 12')
    assert.equal(url.searchParams.get('travelmode'),'walking')
    assert.equal(dorm.sourceUrl,'https://uust.ru/campus/')
  }
})
