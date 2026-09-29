import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createNewsServer } from './serve.mjs'

test('the site server exposes schedule alongside news and closes the schedule service', async t => {
  const root = await mkdtemp(join(tmpdir(), 'pocket-schedule-site-'))
  const distPath = join(root, 'dist'), seedPath = join(root, 'seed.json')
  await mkdir(distPath)
  await writeFile(join(distPath, 'index.html'), '<!doctype html><title>PocketUUST</title>')
  await writeFile(seedPath, JSON.stringify({newsFetchedAt:'2026-09-27T10:00:00Z',news:[{
    id:'test',title:'Новость',summary:'Текст',group:'Кампус',tags:[],
    sourceName:'УУНиТ',sourceUrl:'https://uust.ru/news/',checkedAt:null,publishedAt:null,image:null,
  }]}))
  let closed = false
  const scheduleService = {
    middleware: () => (req, res, next) => {
      if (req.url !== '/api/schedule/v1/config') return next()
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({period_id:241}))
    },
    close: async () => { closed = true },
  }
  const app = await createNewsServer({distPath, seedPath, dataPath:join(root, 'news'),
    scheduleService, refresh:async()=>{}, log:()=>{}})
  t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true})})
  await app.listen(0,'127.0.0.1')
  const base = `http://127.0.0.1:${app.server.address().port}`
  const schedule = await fetch(base+'/api/schedule/v1/config')
  assert.equal(schedule.status,200,'schedule API must be mounted on the same site')
  assert.equal((await schedule.json()).period_id,241)
  assert.equal((await fetch(base+'/api/news')).status,200)
  assert.equal((await fetch(base+'/')).status,200)
  await app.close()
  assert.equal(closed,true)
})
