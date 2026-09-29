import type { LifeItem } from './model'

export interface NewsPayload { news: LifeItem[]; newsFetchedAt: string; stale: boolean; lastError: string | null }
const validDate = (value: unknown): value is string => typeof value==='string' && !Number.isNaN(Date.parse(value))
const text = (value: unknown, max = 1000): value is string => typeof value==='string' && value.length>0 && value.length<=max
function httpsUrl(value: unknown) {
  if(typeof value!=='string') return false
  try {const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password&&url.hostname.includes('.')&&!/^[\d.]+$/.test(url.hostname)&&!url.hostname.includes(':')}catch{return false}
}
export function parseNewsPayload(value: unknown): NewsPayload | null {
  if(!value||typeof value!=='object')return null
  const data=value as Record<string,unknown>
  if(!Array.isArray(data.news)||!data.news.length||data.news.length>100||!validDate(data.newsFetchedAt))return null
  const ids=new Set<string>()
  const news: LifeItem[]=[]
  for(const entry of data.news){
    if(!entry||typeof entry!=='object')return null
    const item=entry as Record<string,unknown>
    if(!text(item.id,100)||ids.has(item.id)||!text(item.title,600)||!text(item.summary)||!text(item.group,100)||!text(item.sourceName,150)||!httpsUrl(item.sourceUrl))return null
    if(!Array.isArray(item.tags)||item.tags.length>20||!item.tags.every(tag=>text(tag,100)))return null
    if(item.checkedAt!==null&&!validDate(item.checkedAt))return null
    if(item.publishedAt!==null&&!validDate(item.publishedAt))return null
    if(item.image!==null&&(typeof item.image!=='string'||!/^\/news-assets\/news-[a-f0-9]{16}\.(jpg|png|webp)$/.test(item.image)))return null
    ids.add(item.id)
    news.push({id:item.id,title:item.title,summary:item.summary,group:item.group,tags:item.tags,sourceUrl:item.sourceUrl as string,sourceName:item.sourceName,checkedAt:item.checkedAt as string|null,publishedAt:item.publishedAt as string|null,image:item.image as string|null,imageAlt:typeof item.imageAlt==='string'?item.imageAlt:undefined,imageKind:typeof item.imageKind==='string'?item.imageKind:undefined})
  }
  return {news,newsFetchedAt:data.newsFetchedAt,stale:data.stale===true,lastError:typeof data.lastError==='string'?data.lastError:null}
}
