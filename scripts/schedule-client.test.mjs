import test from 'node:test'
import assert from 'node:assert/strict'
import {savedSchedule,savedSelection,savedConfiguration} from '../src/features/schedule/data.ts'
const prefix='pocketuust:schedule:v1:'
const snapshot={schema_version:1,entity:{type:'group',id:13650},semester_id:241,week:4,
  week_start:'2026-09-21',week_end:'2026-09-27',days:Array.from({length:7},(_,i)=>({weekday:i+1,date:`2026-09-${21+i}`})),
  lessons:[],undated_count:0,undated:[],source_url:'https://dev.uust-time.ru/api/v/852972',
  fetched_at:'2026-09-27T10:00:00Z',expires_at:'2026-09-28T10:00:00Z',stale:false,refreshing:false,refresh_error:null,offline:false}
function storage(t,key,value){
  const previous=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
  const values=new Map([[prefix+key,JSON.stringify(value)]])
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:k=>values.get(k)??null}})
  t.after(()=>{if(previous)Object.defineProperty(globalThis,'localStorage',previous);else delete globalThis.localStorage})
}
test('corrupt browser snapshots are discarded before rendering undated entries',t=>{
  storage(t,'snapshot:13650:241:4',{...snapshot,undated_count:1,undated:[null]})
  assert.equal(savedSchedule(13650,241,4),null)
})
test('valid browser snapshot stays readable for a source outage',t=>{
  storage(t,'snapshot:13650:241:4',snapshot)
  assert.deepEqual(savedSchedule(13650,241,4),snapshot)
})
test('invalid selected group IDs and invalid saved calendar dates are ignored',t=>{
  storage(t,'selection',{id:1.5,title:'Invalid'})
  assert.equal(savedSelection(),null)
})
test('invalid saved calendar timezone cannot reach date formatters',t=>{
  storage(t,'config',{period_id:241,period_label:'2026/2027',current_week:4,window_start_week:4,window_end_week:8,
    window_start_date:'2026-09-21',window_end_date:'2026-10-25',first_week_monday:'2026-08-31',today:'2026-09-27',timezone:'invalid'})
  assert.equal(savedConfiguration(),null)
})
