import { createContext, useContext, useState, useEffect } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { useAuth } from '../hooks/useAuth'

const QueueContext = createContext(null)

export function QueueProvider({ children }) {
  const { user } = useAuth()
  const [queue, setQueue] = useState([])
  const { data, connected, send } = useWebSocket(user ? '/ws/queue/' : null)

  // Sync WebSocket messages to queue state
  useEffect(() => {
    if (data?.type === 'queue_state' && data?.queue) {
      setQueue(data.queue)
    }
  }, [data])

  const joinQueue = (slot) => {
    send({
      action: 'join',
      slot: slot
    })
  }

  const leaveQueue = (slotId) => {
    send({
      action: 'leave',
      slotId: slotId
    })
  }

  const updateSlot = (slotId, updates) => {
    send({
      action: 'update',
      slotId: slotId,
      updates: updates
    })
  }

  return (
    <QueueContext.Provider value={{ 
      queue, 
      setQueue,
      joinQueue, 
      leaveQueue, 
      updateSlot,
      connected 
    }}>
      {children}
    </QueueContext.Provider>
  )
}

export const useQueue = () => {
  const context = useContext(QueueContext)
  if (!context) {
    throw new Error('useQueue must be used within QueueProvider')
  }
  return context
}
