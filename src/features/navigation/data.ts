import rawRooms from './rooms.json'
import type { RoomId } from '../../shared/types'

export interface Room {
  roomId: RoomId
  number: string
  building: string
  floor: string
  description: string
  sourceUrl: string | null
  checkedAt: string | null
  isDemo: boolean
}

const rooms: Room[] = rawRooms

export function getRooms(query: string): Room[] {
  const text = query.trim().toLocaleLowerCase('ru')
  return rooms.filter((room) => `${room.number} ${room.building} ${room.roomId}`.toLocaleLowerCase('ru').includes(text))
}

export function getRoom(roomId: RoomId): Room | undefined {
  return rooms.find((room) => room.roomId === roomId)
}
