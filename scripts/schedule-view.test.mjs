import test from 'node:test'
import assert from 'node:assert/strict'
const view = await import('../src/features/schedule/schedule-view.ts').catch(()=>({}))

test('a room route is offered only for an unambiguous mapped campus building',()=>{
  assert.equal(typeof view.roomDestination,'function','room matching must be implemented')
  const room={title:'304',short_title:'304',building_short_title:'Корпус 1',building_title:'Учебный корпус № 1 (г. Уфа, ул. К. Маркса, 12 )',map_id:null}
  assert.equal(view.roomDestination(room),'1-304')
  assert.equal(view.roomDestination({...room,short_title:'1-304'}),'1-304')
  assert.equal(view.roomDestination({...room,short_title:'4-304'}),null)
  assert.equal(view.roomDestination({...room,building_title:'Стерлитамак, корпус 1'}),null)
  assert.equal(view.roomDestination({...room,building_short_title:'УК-3-4'}),null)
  assert.equal(view.roomDestination({...room,title:'409а',short_title:'409а'}),null)
  assert.equal(view.roomDestination({...room,building_short_title:'Корпус 5'}),null)
  assert.equal(view.roomDestination({...room,map_id:'demo:1:101'}),null)
})
test('group search prefers an exact name and reports duplicate names instead of choosing a campus',()=>{
  assert.equal(typeof view.resolveGroup,'function')
  const groups=[{group_id:1,group_title:'ИВТ-101',filial_title:'Уфа'},
    {group_id:2,group_title:'ИВТ-101М',filial_title:'Уфа'}]
  assert.deepEqual(view.resolveGroup('ивт-101',groups),{selection:{id:1,title:'ИВТ-101'}})
  assert.ok(view.resolveGroup('ИВТ',groups).error)
  assert.ok(view.resolveGroup('ИВТ-101',[...groups,{...groups[0],group_id:3}]).error)
  assert.equal(view.resolveGroup('ID 2',groups).selection.id,2)
})
test('day dates follow academic weeks including Sunday and month boundaries',()=>{
  assert.equal(typeof view.weekDates,'function')
  const days=view.weekDates({first_week_monday:'2026-08-31'},5)
  assert.equal(days[0].date,'2026-09-28')
  assert.equal(days[6].date,'2026-10-04')
})
test('live lesson status uses Ufa time and never marks another date as current',()=>{
  assert.equal(typeof view.lessonPhase,'function')
  const lesson={date:'2026-09-28',time:{start:'09:00',end:'10:20'}}
  assert.equal(view.lessonPhase(lesson,'Asia/Yekaterinburg',Date.parse('2026-09-28T04:30:00Z')),'current')
  assert.equal(view.lessonPhase(lesson,'Asia/Yekaterinburg',Date.parse('2026-09-28T03:30:00Z')),'upcoming')
  assert.equal(view.lessonPhase(lesson,'Asia/Yekaterinburg',Date.parse('2026-09-29T04:30:00Z')),null)
})
