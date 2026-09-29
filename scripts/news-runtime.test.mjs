import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import { refreshNews } from './fetch-news.mjs'
import { createNewsWorker } from './news-worker.mjs'
import { createNewsServer } from './serve.mjs'
import { acquireNewsLock } from './news-lock.mjs'

const official='<article><a href="/news/get/test"><h3 class="article-card__title">Новость</h3></a><img src="/media/test.jpg"><time datetime="2026-09-26T10:00:00Z"></time></article>'
const rss='<rss><item><title>СМИ</title><link>https://news.google.com/articles/test</link><pubDate>Sat, 26 Sep 2026 11:00:00 GMT</pubDate></item></rss>'
const picture=Buffer.from([255,216,255,217])
const goodFetch=async url=>new Response(url.includes('rss/search')?rss:url.endsWith('test.jpg')?picture:official)
const seed={news:[],newsFetchedAt:null,clubs:[{id:'keep'}],resources:[{id:'guide'}],events:[{id:'event'}]}
async function fixture(t){const root=await mkdtemp(path.join(os.tmpdir(),'pocket-news-'));t.after(()=>rm(root,{recursive:true,force:true}));await writeFile(path.join(root,'student-life.json'),JSON.stringify(seed));return root}

test('confirmed dead lock is recovered; live/foreign/unknown owners stay protected',async t=>{
  const root=await fixture(t),file=path.join(root,'.fetch-news.lock')
  const child=spawnSync(process.execPath,['-e','process.stdout.write(String(process.pid))'])
  assert.equal(child.status,0)
  const dead={pid:Number(child.stdout.toString()),host:os.hostname(),token:'test-dead'}
  await writeFile(file,JSON.stringify(dead))
  const release=await acquireNewsLock(file);await release()
  for(const owner of [{...dead,pid:process.pid},{...dead,host:'another-host'},{}]){
    const original=JSON.stringify(owner);await writeFile(file,original)
    await assert.rejects(acquireNewsLock(file),/Другой импорт/)
    assert.equal(await readFile(file,'utf8'),original)
  }
})

test('runtime import writes fresh public photos and backup, preserves other content',async t=>{
  const root=await fixture(t)
  await refreshNews({featurePath:root,fetchImpl:goodFetch,imagePrefix:'/news-assets/'})
  const data=JSON.parse(await readFile(path.join(root,'student-life.json')))
  assert.equal(data.news.length,2);assert.deepEqual(data.clubs,seed.clubs);assert.deepEqual(data.resources,seed.resources);assert.deepEqual(data.events,seed.events)
  assert.match(data.news[0].image,/^\/news-assets\/news-[a-f0-9]+\.jpg$/)
  assert.deepEqual(await readFile(path.join(root,'assets',path.basename(data.news[0].image))),picture)
  assert.deepEqual(JSON.parse(await readFile(path.join(root,'student-life.last-success.json'))),seed)
})
test('empty RSS and network failure leave last successful JSON untouched',async t=>{
  const root=await fixture(t),original=await readFile(path.join(root,'student-life.json'),'utf8')
  for(const fetchImpl of [async()=>{throw new Error('offline')},async url=>new Response(url.includes('rss/search')?'<rss/>':official)]){
    await assert.rejects(refreshNews({featurePath:root,fetchImpl}))
    assert.equal(await readFile(path.join(root,'student-life.json'),'utf8'),original)
  }
})
test('file lock rejects overlapping import; concurrent content edits are preserved',async t=>{
  const root=await fixture(t)
  let release,started
  const gate=new Promise(resolve=>{release=resolve}),ready=new Promise(resolve=>{started=resolve})
  const first=refreshNews({featurePath:root,fetchImpl:async url=>{started();await gate;return goodFetch(url)}})
  await ready
  await assert.rejects(refreshNews({featurePath:root,fetchImpl:goodFetch}),/Другой импорт/)
  await writeFile(path.join(root,'student-life.json'),JSON.stringify({...seed,clubs:[{id:'new-edit'}]}))
  const rejected=assert.rejects(first,/изменены/);release();await rejected
  assert.deepEqual(JSON.parse(await readFile(path.join(root,'student-life.json'))).clubs,[{id:'new-edit'}])
  await refreshNews({featurePath:root,fetchImpl:goodFetch})
})
test('hourly worker has immediate refresh, skips overlap, survives failure and stops',async()=>{
  let callback,delay,calls=0,release
  const gate=new Promise(resolve=>{release=resolve})
  const worker=createNewsWorker({refresh:async()=>{calls++;if(calls===1)await gate;else if(calls===2)throw new Error('offline')},schedule:(fn,ms)=>{callback=fn;delay=ms;return 42},cancel:id=>assert.equal(id,42),log:()=>{}})
  worker.start();await Promise.resolve();assert.equal(calls,1);assert.equal(delay,3_600_000)
  callback();assert.equal(calls,1);release();await worker.run()
  await worker.run();assert.equal(calls,2);assert.ok(worker.status().lastError)
  await worker.run();assert.equal(calls,3);assert.equal(worker.status().lastError,null)
  await worker.stop();callback();assert.equal(calls,3)
})
test('aborted refresh releases lock and preserves last successful JSON',async t=>{
  const root=await fixture(t),controller=new AbortController()
  let started
  const ready=new Promise(resolve=>{started=resolve})
  const running=refreshNews({featurePath:root,signal:controller.signal,fetchImpl:async(_url,{signal})=>{
    started();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))
  }})
  const rejected=assert.rejects(running)
  await ready;controller.abort();await rejected
  assert.deepEqual(JSON.parse(await readFile(path.join(root,'student-life.json'))),seed)
  await refreshNews({featurePath:root,fetchImpl:goodFetch})
})
test('server delivers new runtime JSON without build; stale cache/static/path restrictions work',async t=>{
  const root=await fixture(t),dist=path.join(root,'dist');await mkdir(dist);await writeFile(path.join(dist,'index.html'),'<html>site</html>')
  await refreshNews({featurePath:root,fetchImpl:goodFetch,imagePrefix:'/news-assets/'})
  const app=await createNewsServer({distPath:dist,dataPath:root,seedPath:path.join(root,'student-life.json'),refresh:async()=>{throw new Error('offline')},log:()=>{}})
  await app.listen(0,'127.0.0.1');t.after(()=>app.close())
  const base=`http://127.0.0.1:${app.server.address().port}`
  assert.match(await (await fetch(base)).text(),/site/)
  const initial=await (await fetch(base+'/api/news')).json()
  const next={...initial,news:initial.news.map(item=>({...item,title:'Новая порция без build'})),newsFetchedAt:new Date().toISOString()}
  await writeFile(path.join(root,'student-life.json'),JSON.stringify(next))
  assert.equal((await (await fetch(base+'/api/news')).json()).news[0].title,'Новая порция без build')
  await writeFile(path.join(root,'student-life.json'),'{broken')
  const cached=await (await fetch(base+'/api/news')).json();assert.equal(cached.news[0].title,'Новая порция без build');assert.equal(cached.stale,true)
  assert.equal((await fetch(base+initial.news[0].image)).status,200)
  for(const route of ['/student-life.json','/.env','/scripts/serve.mjs','/news-assets/%2e%2e%2fstudent-life.json','/news-assets/.fetch-news.lock']) assert.equal((await fetch(base+route)).status,404,route)
  assert.equal((await fetch(base+'/api/news',{method:'POST'})).status,405)
})
