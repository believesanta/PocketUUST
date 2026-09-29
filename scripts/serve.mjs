#!/usr/bin/env node
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir, access, rename, copyFile, unlink, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { refreshNews } from './fetch-news.mjs'
import { createNewsWorker, HOUR } from './news-worker.mjs'
import { parseNewsPayload } from '../src/features/student-life/news-client.ts'
import { acquireNewsLock } from './news-lock.mjs'
import { ScheduleService } from '../services/schedule/service.mjs'
import { settingsFromEnv } from '../services/schedule/settings.mjs'
import { CampusService } from '../services/campus/service.mjs'
import { AssistantService } from '../services/assistant/service.mjs'

const root = fileURLToPath(new URL('../',import.meta.url))
const sourcePath = path.join(root,'src/features/student-life/student-life.json')
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.ttf':'font/ttf'}
async function snapshot(file) {
  const bytes=await readFile(file)
  if(bytes.length>2_000_000)throw new Error('Лента слишком большая')
  const result=parseNewsPayload(JSON.parse(bytes.toString('utf8')))
  if(!result)throw new Error('Некорректная лента новостей')
  return result
}
async function prepareData(dataPath,seedPath) {
  const original=JSON.parse(await readFile(seedPath,'utf8'))
  const news=original.news.map(item=>({...item,image:item.image?.startsWith('./assets/news-')?'/news-assets/'+path.basename(item.image):item.image}))
  const seed=parseNewsPayload({news,newsFetchedAt:original.newsFetchedAt})
  if(!seed)throw new Error('Начальная лента отсутствует или некорректна')
  await mkdir(path.join(dataPath,'assets'),{recursive:true})
  const jsonPath=path.join(dataPath,'student-life.json')
  try {await access(jsonPath)} catch(error){
    if(error.code!=='ENOENT')throw error
    const lockPath=path.join(dataPath,'.fetch-news.lock')
    const releaseLock=await acquireNewsLock(lockPath)
    try {
      // Повторная проверка после блокировки: другой процесс мог уже создать ленту.
      try{await access(jsonPath);return seed}catch(error){if(error.code!=='ENOENT')throw error}
      for(const item of original.news){
        if(!/^\.\/assets\/news-[a-f0-9]{16}\.(jpg|png|webp)$/.test(item.image??''))continue
        const filename=path.basename(item.image)
        await copyFile(path.join(path.dirname(seedPath),'assets',filename),path.join(dataPath,'assets',filename))
      }
      await writeFile(jsonPath+'.tmp',JSON.stringify(seed,null,2)+'\n')
      await rename(jsonPath+'.tmp',jsonPath)
    }finally{await unlink(jsonPath+'.tmp').catch(()=>{});await releaseLock()}
  }
  return seed
}
async function publicFile(directory,relative) {
  const target=await realpath(path.resolve(directory,relative)),base=await realpath(directory)
  if(!target.startsWith(base+path.sep))throw new Error('Not public')
  const type=types[path.extname(target)]
  if(!type)throw new Error('Not public')
  return {bytes:await readFile(target),type}
}

export async function createNewsServer({distPath=path.join(root,'dist'),dataPath=process.env.NEWS_DATA_DIR?path.resolve(process.env.NEWS_DATA_DIR):path.join(root,'.runtime/news'),seedPath=sourcePath,refresh,log=console.warn,scheduleService=null,campusService=null,assistantService=new AssistantService({scheduleService})}={}) {
  await access(path.join(distPath,'index.html')).catch(()=>{throw new Error('Сначала выполните npm run build: папка dist отсутствует')})
  const seed=await prepareData(dataPath,seedPath)
  const jsonPath=path.join(dataPath,'student-life.json')
  let cache=await snapshot(jsonPath).catch(()=>snapshot(path.join(dataPath,'student-life.last-success.json')).catch(()=>seed))
  const controller=new AbortController()
  const worker=createNewsWorker({refresh:refresh??(()=>refreshNews({featurePath:dataPath,imagePrefix:'/news-assets/',signal:controller.signal,log})),log})
  const scheduleMiddleware=scheduleService?.middleware()
  const campusMiddleware=campusService?.middleware()
  const assistantMiddleware=assistantService?.middleware()
  const server=createServer((request,response)=>{
    const next=()=>handle(request,response).catch(()=>{if(!response.headersSent){response.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});response.end('Не удалось обработать запрос')}else response.destroy()})
    const afterSchedule=()=>{if(assistantMiddleware) assistantMiddleware(request,response,next);else next()}
    const afterCampus=()=>{if(scheduleMiddleware) scheduleMiddleware(request,response,afterSchedule);else afterSchedule()}
    if(campusMiddleware) campusMiddleware(request,response,afterCampus)
    else afterCampus()
  })
  async function handle(request,response) {
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405,{Allow:'GET, HEAD'});response.end();return}
    const send=(code,body,type,cacheControl='no-store')=>{
      response.writeHead(code,{'Content-Type':type,'Cache-Control':cacheControl,'X-Content-Type-Options':'nosniff'})
      response.end(request.method==='HEAD'?undefined:body)
    }
    let pathname
    try{pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname)}catch{send(400,'Некорректный адрес','text/plain; charset=utf-8');return}
    if(pathname==='/api/news'){
      let unreadable=false
      try{cache=await snapshot(jsonPath)}catch{unreadable=true}
      const status=worker.status()
      const stale=unreadable||Boolean(status.lastError)||Date.now()-Date.parse(cache.newsFetchedAt)>2*HOUR
      send(200,JSON.stringify({...cache,...status,stale}),'application/json; charset=utf-8');return
    }
    let file
    try{
      if(/^\/news-assets\/news-[a-f0-9]{16}\.(jpg|png|webp)$/.test(pathname))file=await publicFile(path.join(dataPath,'assets'),path.basename(pathname))
      else if(pathname==='/'||pathname==='/index.html')file=await publicFile(distPath,'index.html')
      else if(pathname.startsWith('/assets/')&&!pathname.includes('..')&&!pathname.includes('\\')&&!pathname.includes('\0'))file=await publicFile(distPath,pathname.slice(1))
    }catch{/* Недоступные/непубличные файлы возвращают одинаковый ответ. */}
    if(!file){send(404,'Не найдено','text/plain; charset=utf-8');return}
    send(200,file.bytes,file.type,pathname.startsWith('/assets/')?'public, max-age=31536000, immutable':pathname.startsWith('/news-assets/')?'public, max-age=3600':'no-cache')
  }
  let closing
  return {
    server,worker,
    async listen(port=Number(process.env.PORT??3000),host=process.env.HOST??'0.0.0.0') {
      if(!Number.isInteger(port)||port<0||port>65535)throw new Error('PORT должен быть числом от 0 до 65535')
      await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.off('error',reject);resolve()})})
      worker.start()
    },
    close() {
      if(closing)return closing
      controller.abort()
      closing=(async()=>{
        const stopServer=server.listening?new Promise(resolve=>server.close(resolve)):Promise.resolve()
        const force=setTimeout(()=>server.closeAllConnections(),5000);force.unref()
        await Promise.all([worker.stop(),scheduleService?.close(),stopServer]);campusService?.close();clearTimeout(force)
      })()
      return closing
    },
  }
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  let scheduleService
  let campusService
  try{
    try{process.loadEnvFile()}catch(error){if(error.code!=='ENOENT')throw error}
    scheduleService=new ScheduleService(settingsFromEnv(),{bulkImport:false})
    campusService=new CampusService()
    const app=await createNewsServer({scheduleService,campusService})
    await app.listen()
    console.log(`PocketUUST: порт ${app.server.address().port}; обновление новостей при старте и раз в час.`)
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{app.close().catch(error=>{console.error(error.message);process.exitCode=1})})
  }catch(error){await scheduleService?.close();campusService?.close();console.error('Сервер не запущен:',error.message);process.exitCode=1}
}
