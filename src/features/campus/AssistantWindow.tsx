import type { RefObject } from 'react'
import { AssistantPanel } from './AssistantPanel'
import { FloatingWindow } from './FloatingWindow'

export function AssistantWindow(props: {
  visible: boolean
  launcher: RefObject<HTMLButtonElement | null>
  onMinimize: () => void
  onClose: () => void
}) {
  return (
    <FloatingWindow language="ru" title="Помощник" titleId="campus-assistant-title" closeLabel="Закрыть помощника" {...props}>
      <AssistantPanel />
    </FloatingWindow>
  )
}
