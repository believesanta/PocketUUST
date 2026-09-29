import { link, readFile, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { hostname } from 'node:os'

// Проверка восстановления сериализована внутри единственного серверного процесса.
const recoveries=new Map()
async function recoverDeadOwner(lockPath) {
  if(recoveries.has(lockPath))return recoveries.get(lockPath)
  const recovering=(async()=>{
    try{
      const original=await readFile(lockPath,'utf8'),owner=JSON.parse(original)
      if(owner.host!==hostname()||!Number.isSafeInteger(owner.pid)||owner.pid<=0||typeof owner.token!=='string')return
      try{process.kill(owner.pid,0);return}catch(error){if(error.code!=='ESRCH')return}
      // Нельзя удалять блокировку, если владелец или содержимое уже изменились.
      if(await readFile(lockPath,'utf8')===original)await unlink(lockPath)
    }catch{/* Старые/неизвестные блокировки автоматически не удаляем. */}
  })().finally(()=>recoveries.delete(lockPath))
  recoveries.set(lockPath,recovering)
  return recovering
}
export async function acquireNewsLock(lockPath) {
  const token=randomUUID(),candidate=`${lockPath}.${token}.candidate`
  // Готовые метаданные публикуются атомарно через hard link: нет пустой блокировки
  // даже при завершении процесса между созданием файла и записью владельца.
  await writeFile(candidate,JSON.stringify({pid:process.pid,host:hostname(),token}),{flag:'wx'})
  try{
    for(let attempt=0;attempt<2;attempt++){
      try{await link(candidate,lockPath);return async()=>{
        const owner=JSON.parse(await readFile(lockPath,'utf8'))
        if(owner.token===token)await unlink(lockPath)
      }}catch(error){
        if(error.code!=='EEXIST')throw error
        if(attempt===0)await recoverDeadOwner(lockPath)
      }
    }
    throw new Error('Другой импорт уже запущен или владелец блокировки неизвестен. Дождитесь завершения.')
  }finally{await unlink(candidate).catch(()=>{})}
}
