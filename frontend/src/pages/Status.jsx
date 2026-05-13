import { useState, useEffect } from 'react'
import Shell from '../components/layout/Shell'
import Topbar from '../components/layout/Topbar'

function StatusCard({ label, value }) {
  const ok = value === 'ok'
  return (
    <div style={{
      background: 'var(--bg2)',
      border: `1px solid ${ok ? 'var(--forest)' : 'var(--red)'}`,
      borderRadius: 12,
      padding: '20px 28px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
    }}>
      <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 15 }}>{label}</span>
      <span style={{
        background: ok ? 'var(--forest)' : 'var(--red)',
        color: 'white',
        borderRadius: 20,
        padding: '3px 14px',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: '0.05em',
      }}>
        {ok ? '● OK' : '● KO'}
      </span>
    </div>
  )
}

export default function Status() {
  const [data, setData] = useState(null)

  const check = () => {
    fetch('/health')
      .then(res => res.json())
      .then(json => setData(json))
      .catch(() => setData({ status: 'error', postgres: 'error', redis: 'error' }))
  }

  useEffect(() => {
    check()
    const interval = setInterval(check, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Shell>
      <Topbar title="Status" />
      <div style={{ padding: '32px 24px', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!data ? (
          <p style={{ color: 'var(--ink2)' }}>Chargement...</p>
        ) : (
          <>
            <StatusCard label="Backend"    value={data.status} />
            <StatusCard label="PostgreSQL" value={data.postgres} />
            <StatusCard label="Redis"      value={data.redis} />
          </>
        )}
      </div>
    </Shell>
  )
}