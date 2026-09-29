import type { RouteSuccess } from './routing'

/** Labels describe a schematic step, never a surveyed floor plan. */
export function describeStage(route:RouteSuccess,index:number) {
  const step=route.steps[index]
  const previousFloor=route.steps.slice(0,index).findLast(item=>item.floor!==undefined)?.floor
  const fromBuilding=index>0?route.steps[index-1].building:step.building
  const level=step.kind==='stairs'&&previousFloor&&step.floor
    ?`${previousFloor} → ${step.floor} этаж`
    :step.kind==='outdoor'?'Через двор':step.floor?`${step.floor} этаж`:step.kind==='finish'&&step.building&&!route.to.id.startsWith('entry-')?'Этаж уточнить':'У входа'
  const location=step.kind==='passage'&&fromBuilding&&step.building
    ?`Корпуса ${fromBuilding} → ${step.building}`
    :step.building?`Корпус ${step.building}`:'Кампус'
  return {level,location,title:step.title,kind:step.kind,floor:step.floor}
}
