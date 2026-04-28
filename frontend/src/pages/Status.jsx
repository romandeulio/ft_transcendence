import { useState, useEffect } from 'react'

function Status() {
    const [data, setData] = useState(null)

    const check = () => {
        fetch('/health')
            .then(res => res.json())
            .then(json => setData(json))
    }

    useEffect(() => {
        check()
        const interval = setInterval(check, 10000)
        return () => clearInterval(interval)
    }, [])

    if (!data) return <p>Chargement...</p>

    const color = (val) => val === 'ok' ? 'green' : 'red'

    return (
        <div>
            <h1>Status</h1>
            <p style={{color: color(data.status)}}>Backend : {data.status}</p>
            <p style={{color: color(data.postgres)}}>Postgres : {data.postgres}</p>
            <p style={{color: color(data.redis)}}>Redis : {data.redis}</p>
        </div>
    )
}

export default Status