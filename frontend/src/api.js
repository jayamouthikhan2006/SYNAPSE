import { useEffect, useState, useCallback } from 'react'

export const getRole = () => {
  try { return localStorage.getItem('synapse.role') || 'RB' } catch { return 'RB' }
}

async function call(method, url, body) {
  const res = await fetch('/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Role': getRole() },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let data = null
  try { data = await res.json() } catch { /* empty body */ }
  if (!res.ok) {
    const msg = (data && (data.detail || data.message)) || res.statusText
    const err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
    err.status = res.status
    throw err
  }
  return data
}

export const api = {
  get: (u) => call('GET', u),
  post: (u, b = {}) => call('POST', u, b),
}

export const qs = (o) => {
  const p = new URLSearchParams()
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v !== undefined && v !== null && v !== 0) p.set(k, v) })
  const s = p.toString()
  return s ? '?' + s : ''
}

/** Fetch hook. `deps` re-trigger the load; `reload()` refreshes on demand. */
export function useApi(url, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (url === null) return
    let live = true
    setLoading(true)
    api.get(url).then((d) => { if (live) { setData(d); setError(null) } })
      .catch((e) => { if (live) setError(e) })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  return { data, error, loading, reload }
}
