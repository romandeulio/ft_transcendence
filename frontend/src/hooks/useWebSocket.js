import { useState, useEffect, useRef } from 'react'

export function useWebSocket(url) {
  const [data, setData] = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)

  useEffect(() => {
    if (!url) return
    try {
      const ws = new WebSocket(url)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onmessage = (e) => {
        try { setData(JSON.parse(e.data)) } catch { setData(e.data) }
      }
      ws.onclose = () => setConnected(false)
      return () => ws.close()
    } catch {
      // WebSocket unavailable in dev
    }
  }, [url])

  return { data, connected }
}
