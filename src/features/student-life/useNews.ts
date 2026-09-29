import { useEffect, useState } from 'react'
import { bundledNewsUpdatedAt, content } from './data'
import { parseNewsPayload } from './news-client'

const initialState = { news: content.news, updatedAt: bundledNewsUpdatedAt, live: false, stale: false }
export function useNews() {
  const [state,setState] = useState(initialState)
  useEffect(()=>{
    let stopped=false
    let controller: AbortController | null=null
    let timer: ReturnType<typeof setTimeout> | undefined
    async function readFeed() {
      controller=new AbortController()
      const timeout=setTimeout(()=>controller?.abort(),10000)
      try {
        const response=await fetch('/api/news',{cache:'no-store',signal:controller.signal})
        if(!response.ok)throw new Error('Feed unavailable')
        const payload=parseNewsPayload(await response.json())
        if(!payload)throw new Error('Invalid feed')
        if(!stopped)setState({news:payload.news,updatedAt:payload.newsFetchedAt,live:true,stale:payload.stale||Boolean(payload.lastError)})
      }catch{
        // Сбой/отсутствие API не удаляет ни встроенную, ни уже полученную ленту.
        if(!stopped)setState(previous=>({...previous,stale:true}))
      }finally{
        clearTimeout(timeout)
        if(!stopped)timer=setTimeout(readFeed,60000)
      }
    }
    void readFeed()
    return ()=>{stopped=true;clearTimeout(timer);controller?.abort()}
  },[])
  return state
}
