import { useEffect, useRef, useState, type FormEvent } from 'react'
import { errorText, loadAvailableGroups, loadConfiguration, loadSchedule, savedConfiguration,
  savedSchedule, savedSelection, saveSelection, type AvailableGroups, type Configuration,
  type ScheduleData, type Selection } from './data'
import { resolveGroup } from './schedule-view'

export function useSchedule() {
  const [config, setConfig] = useState<Configuration | null>(null)
  const [configError, setConfigError] = useState('')
  const [groups, setGroups] = useState<AvailableGroups | null>(null)
  const [catalogError, setCatalogError] = useState('')
  const [searchError, setSearchError] = useState('')
  const [selection, setSelection] = useState<Selection | null>(savedSelection)
  const [groupInput, setGroupInput] = useState(() => savedSelection()?.title ?? '')
  const [searching, setSearching] = useState(false)
  const [week, setWeek] = useState<number | null>(null)
  const [weekday, setWeekday] = useState(1)
  const [snapshot, setSnapshot] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [localCopy, setLocalCopy] = useState(false)
  const [retry, setRetry] = useState(0)
  const [refreshRequest, setRefreshRequest] = useState(0)
  const calendarInitialized = useRef(false)
  const completedRefresh = useRef(0)

  useEffect(() => {
    const controller = new AbortController()
    function apply(value: Configuration) {
      setConfig(previous => JSON.stringify(previous) === JSON.stringify(value) ? previous : value)
      setWeek(previous => previous ?? value.current_week)
      if (!calendarInitialized.current) {
        setWeekday(new Date(`${value.today}T12:00:00`).getDay() || 7)
        calendarInitialized.current = true
      }
    }
    loadConfiguration(controller.signal).then(value => {
      if (!controller.signal.aborted) { apply(value); setConfigError('') }
    }).catch(error => {
      if (controller.signal.aborted) return
      const saved = savedConfiguration()
      if (saved) apply(saved)
      setConfigError(errorText(error))
    })
    return () => controller.abort()
  }, [retry])

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>
    async function update() {
      try {
        const value = await loadAvailableGroups(controller.signal)
        if (controller.signal.aborted) return
        setGroups(value); setCatalogError('')
        if (!value.catalog_loaded || value.refreshing) timer = setTimeout(update, 5000)
      } catch (error) {
        if (!controller.signal.aborted) setCatalogError(errorText(error))
      }
    }
    void update()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [retry])

  useEffect(() => {
    if (!selection || !config || week === null) return
    const controller = new AbortController()
    const manual = refreshRequest > completedRefresh.current
    let timer: ReturnType<typeof setTimeout>
    const saved = savedSchedule(selection.id, config.period_id, week)
    setSnapshot(saved); setLocalCopy(saved !== null); setLoadError(''); setLoading(true)
    async function update(force: boolean, attempt = 0) {
      try {
        const value = await loadSchedule(selection!.id, config!.period_id, week!, controller.signal, force)
        if (controller.signal.aborted) return
        setSnapshot(value); setLocalCopy(false); setLoadError('')
        if (manual) completedRefresh.current = refreshRequest
        // Read the completed background refresh; never force another source request here.
        if (value.refreshing && !value.refresh_error && !value.offline && attempt < 12) {
          timer = setTimeout(()=>{void update(false,attempt+1)},5000)
        }
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(errorText(error))
      } finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void update(manual)
    return () => { controller.abort(); clearTimeout(timer) }
  }, [selection, config, week, retry, refreshRequest])

  function chooseGroup(value: Selection) {
    setSnapshot(null); setLoadError(''); setSearchError(''); setSearching(false)
    setGroupInput(value.title); setSelection(value); saveSelection(value)
  }
  function openGroup(event: FormEvent) {
    event.preventDefault()
    const result = resolveGroup(groupInput, groups?.groups ?? [])
    if (result.selection) chooseGroup(result.selection)
    else { setSearchError(result.error ?? 'Выберите группу.'); setSearching(true) }
  }
  const current = snapshot && selection && config && snapshot.entity.id === selection.id
    && snapshot.semester_id === config.period_id && snapshot.week === week ? snapshot : null
  return { config, configError, groups, catalogError, searchError, selection, groupInput,
    setGroupInput, searching, setSearching, week, setWeek, weekday, setWeekday, current,
    loading, loadError, localCopy, chooseGroup, openGroup,
    retry: () => setRetry(value => value + 1), refresh: () => setRefreshRequest(value => value + 1) }
}
