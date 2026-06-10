import { useState, useEffect, useRef, useCallback } from 'react'

function buildAbsoluteUrl(url) {
  if (!url) return null
  if (/^wss?:\/\//i.test(url)) return url
  if (typeof window === 'undefined') return null
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const path = url.startsWith('/') ? url : `/${url}`
  return `${proto}//${window.location.host}${path}`
}

const BASE_DELAY = 1000
const MAX_DELAY  = 30000

export function useWebSocket(url) {
  const [data, setData] = useState(null)
  const [connected, setConnected] = useState(false)
  const wsRef       = useRef(null)
  const sendRef     = useRef(null)
  const retryTimer  = useRef(null)
  const retryDelay  = useRef(BASE_DELAY)
  const activeUrl   = useRef(null)

  useEffect(() => {
    activeUrl.current = url
    retryDelay.current = BASE_DELAY

    function connect() {
      const absUrl = buildAbsoluteUrl(activeUrl.current)
      if (!absUrl) return

      let ws
      try { ws = new WebSocket(absUrl) } catch { return }
      wsRef.current = ws

      ws.onopen = () => {
        if (activeUrl.current !== url) return
        setConnected(true)
        retryDelay.current = BASE_DELAY
      }

      ws.onmessage = (e) => {
        if (activeUrl.current !== url) return
        try { setData(JSON.parse(e.data)) } catch { setData(e.data) }
      }

      ws.onclose = () => {
        if (activeUrl.current !== url) return
        setConnected(false)
        if (activeUrl.current) {
          retryTimer.current = setTimeout(() => {
            retryDelay.current = Math.min(retryDelay.current * 2, MAX_DELAY)
            connect()
          }, retryDelay.current)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    }

    connect()

    return () => {
      activeUrl.current = null
      clearTimeout(retryTimer.current)
      const ws = wsRef.current
      wsRef.current = null
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close()
      }
      setConnected(false)
    }
  }, [url])

  const send = useCallback((payload) => {
    const ws = wsRef.current
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload))
    return true
  }, [])

  sendRef.current = send

  return { data, connected, send }
}
