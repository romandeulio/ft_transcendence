import { useState } from 'react'
import { useWebSocket } from './useWebSocket'

export function useQueue() {
  const [queue, setQueue] = useState([])
  const { data } = useWebSocket(null) // wire to '/ws/queue/' in production

  return { queue }
}
