import { useState, useEffect, useRef, useCallback } from 'react'

function buildAbsoluteUrl(url) {
  if (!url) return null
  if (/^wss?:\/\//i.test(url)) return url
  if (typeof window === 'undefined') return null
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const path = url.startsWith('/') ? url : `/${url}`
  return `${proto}//${window.location.host}${path}`
}

export function useWebSocket(url) {
  const [data, setData] = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef = useRef(null)

  useEffect(() => {
    const absUrl = buildAbsoluteUrl(url)
    if (!absUrl) return

    let cancelled = false
    let ws
    try {
      ws = new WebSocket(absUrl)
    } catch {
      return
    }
    wsRef.current = ws

    ws.onopen = () => { if (!cancelled) setConnected(true) }
    ws.onmessage = (e) => {
      if (cancelled) return
      try { setData(JSON.parse(e.data)) } catch { setData(e.data) }
    }
    ws.onclose = () => { if (!cancelled) setConnected(false) }
    ws.onerror = () => { if (!cancelled) setConnected(false) }

    return () => {
      cancelled = true
      wsRef.current = null
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }
  }, [url])

  const send = useCallback((payload) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
    return true
  }, [])

  return { data, connected, send }
}
