import test from 'node:test'
import assert from 'node:assert/strict'
import {execFileSync} from 'node:child_process'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {Repository} from '../repository.mjs'
import {settingsFromEnv} from '../settings.mjs'

test('the room-link command accepts the IDs used by the campus navigator',t=>{
  const root=mkdtempSync(join(tmpdir(),'pocket-room-link-'))
  t.after(()=>rmSync(root,{recursive:true,force:true}))
  const database=join(root,'cache.sqlite3')
  const env={...process.env,SCHEDULE_DATABASE:database,SCHEDULE_OFFLINE:'1'}
  const output=execFileSync(process.execPath,['services/schedule/manage.mjs','link-room','--room-id','6593','--map-id','1-304'],{env,encoding:'utf8'})
  assert.match(output,/1-304/)
  const settings=settingsFromEnv(env)
  const repo=new Repository(database,settings.namespace)
  try{assert.equal(repo.links().get(6593),'1-304')}finally{repo.close()}
})
