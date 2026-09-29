import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { settingsFromEnv } from './settings.mjs'
import { integer, ScheduleService } from './service.mjs'

try { process.loadEnvFile() } catch (error) { if (error.code !== 'ENOENT') throw error }
const service = new ScheduleService(settingsFromEnv(), { background: false })
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'group-id': { type: 'string' }, 'teacher-id': { type: 'string' }, 'room-id': { type: 'string' },
      semester: { type: 'string' }, groups: { type: 'boolean' },
      'map-id': { type: 'string' }, out: { type: 'string' },
    },
  })
  const [command] = positionals
  if (command === 'sync') {
    const kinds = ['group', 'teacher', 'room'].filter((kind) => values[`${kind}-id`] !== undefined)
    if (kinds.length + Number(Boolean(values.groups)) !== 1) throw new Error('Укажите ровно один параметр: --groups, --group-id, --teacher-id или --room-id.')
    const resource = values.groups ? { kind: 'groups' } : {
      kind: kinds[0], id: integer(values[`${kinds[0]}-id`], 'ID'),
      period: values.semester ? integer(values.semester, 'semester') : service.settings.periodId,
    }
    const payload = await service.refresh(resource)
    console.log(JSON.stringify({ resource, fetched_at: payload.fetched_at, records: payload.records.length }, null, 2))
  } else if (command === 'link-room') {
    const id = integer(values['room-id'], 'room-id')
    const mapId = values['map-id']
    if (!mapId || !/^[1-46-9]-[1-9]\d{2}$/.test(mapId)) throw new Error('--map-id должен иметь формат корпус-аудитория, например 1-304. Поддерживаются корпуса 1–4 и 6–9 на карте кампуса.')
    service.repository.linkRoom(id, mapId)
    console.log(`Аудитория ${id} связана с ${mapId}.`)
  } else if (command === 'backup') {
    if (!values.out) throw new Error('Укажите --out с именем нового файла резервной копии.')
    service.repository.backup(resolve(values.out))
    console.log(`Копия сохранена: ${resolve(values.out)}`)
  } else {
    throw new Error('Команды: sync --group-id ID | sync --groups | link-room --room-id ID --map-id 1-304 | backup --out PATH')
  }
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally { await service.close() }
