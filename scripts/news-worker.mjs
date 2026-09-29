export const HOUR = 3_600_000

export function createNewsWorker({ refresh, schedule = setInterval, cancel = clearInterval, log = console.warn }) {
  let timer, inFlight, stopped = false, started = false
  const state = { updating: false, lastAttemptAt: null, lastError: null }
  function run() {
    if (stopped) return Promise.resolve()
    if (inFlight) return inFlight
    state.updating = true
    state.lastAttemptAt = new Date().toISOString()
    // Запуск deferred исключает повторный импорт даже при синхронной ошибке refresh.
    inFlight = Promise.resolve().then(refresh).then(()=>{state.lastError=null})
      .catch(error=>{state.lastError='Не удалось обновить новости. Сохранена предыдущая лента.';log('Обновление новостей:',error.message)})
      .finally(()=>{state.updating=false;inFlight=undefined})
    return inFlight
  }
  return {
    run,
    status: ()=>({...state}),
    start() { if(started||stopped)return;started=true;timer=schedule(run,HOUR);timer?.unref?.();return run() },
    async stop() {stopped=true;if(timer!==undefined)cancel(timer);await inFlight},
  }
}
