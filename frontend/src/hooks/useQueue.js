import { useState, useEffect } from 'react'
import { useWebSocket } from './useWebSocket'

export function useQueue() {
  const [queue, setQueue] = useState([])

  const { data } = useWebSocket('/ws/queue/')

  useEffect(() => {
    if (!data) return

    if (Array.isArray(data)) {
      setQueue(data)
    } else if (data.queue) {
      setQueue(data.queue)
    } else {
      setQueue([])
    }
  }, [data])

  return { queue }
}