import { useState } from 'react'
import { queue as mockQueue } from '../mock/mockQueue'
import { useWebSocket } from './useWebSocket'

export function useQueue() {
  const [queue, setQueue] = useState(mockQueue)
  const { data } = useWebSocket(null) // wire to '/ws/queue/' in production

  return { queue }
}
