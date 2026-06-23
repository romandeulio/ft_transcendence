import { useState, useEffect, useRef, useCallback } from 'react'
import { killAuthSession } from '../services/api'

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

const SUPERSEDED_CODE = 4001
const ACCOUNT_DELETED_CODE = 4002

export function useWebSocket(url, onMessage) {
  const [data, setData] = useState(null)
  const [connected, setConnected] = useState(false)
  const [superseded, setSuperseded] = useState(false)
  const [accountDeleted, setAccountDeleted] = useState(false)
  const wsRef       = useRef(null)
  const sendRef     = useRef(null)
  const retryTimer  = useRef(null)
  const retryDelay  = useRef(BASE_DELAY)
  const activeUrl   = useRef(null)

  const supersededRef = useRef(false)
  // Always points to the latest handler: each message is delivered once,
  // synchronously per onmessage event -- immune to React batching.
  // (A single `data` slot drops burst messages, e.g. the queue_state +
  //  deferred invite_received salvo on (re)connection.)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    activeUrl.current = url
    retryDelay.current = BASE_DELAY
    supersededRef.current = false
    setSuperseded(false)
    setAccountDeleted(false)

    function connect() {
      const absUrl = buildAbsoluteUrl(activeUrl.current)
      if (!absUrl) return

      let ws
      try { ws = new WebSocket(absUrl) } catch { return }
      wsRef.current = ws

      ws.onopen = () => {
        if (activeUrl.current !== url || wsRef.current !== ws) return
        setConnected(true)
        retryDelay.current = BASE_DELAY
      }

      ws.onmessage = (e) => {
        if (activeUrl.current !== url || wsRef.current !== ws) return
        let msg
        try { msg = JSON.parse(e.data) } catch { msg = e.data }
        // Direct delivery (no loss); `data` stays exposed for compatibility.
        if (onMessageRef.current) onMessageRef.current(msg)
        setData(msg)
      }

      ws.onclose = (e) => {
        if (activeUrl.current !== url || wsRef.current !== ws) return
        setConnected(false)
        if (e && e.code === ACCOUNT_DELETED_CODE) {
          // Account deleted: stop reconnecting (reuse the `supersededRef` lock)
          // and signal the deletion to the consumer. killAuthSession() sets the
          // `sessionDead` lock SYNCHRONOUSLY (before the React re-render
          // triggered by setAccountDeleted): if another WS (e.g. bets ->
          // market_closed) triggers a poll right after, authFetch is already
          // short-circuited -> no 401 in the console.
          killAuthSession()
          supersededRef.current = true
          setAccountDeleted(true)
          return
        }
        if (e && e.code === SUPERSEDED_CODE) {
          supersededRef.current = true
          setSuperseded(true)
          return
        }
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

    // Reconnect immediately when the network/tab comes back, instead of waiting
    // for the backoff (up to 30s) -- otherwise the user thinks they must refresh
    // (e.g. an invite received offline only arrives on reconnection).
    function reconnectNow() {
      if (!activeUrl.current || supersededRef.current) return
      const ws = wsRef.current
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return
      clearTimeout(retryTimer.current)
      retryDelay.current = BASE_DELAY
      connect()
    }
    const onVisible = () => { if (document.visibilityState === 'visible') reconnectNow() }
    window.addEventListener('online', reconnectNow)
    window.addEventListener('focus', reconnectNow)
    document.addEventListener('visibilitychange', onVisible)

    connect()

    return () => {
      window.removeEventListener('online', reconnectNow)
      window.removeEventListener('focus', reconnectNow)
      document.removeEventListener('visibilitychange', onVisible)
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

  return { data, connected, send, superseded, accountDeleted }
}
