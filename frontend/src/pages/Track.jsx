import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, Search } from 'lucide-react'
import { api, useApi } from '../api'
import { Callout, Card, PageHeader, StatusBadge, fmtDate, fmtDateTime } from '../ui'

export default function Track() {
  const { pid } = useParams()
  const nav = useNavigate()
  const [v, setV] = useState(pid || '')
  const [res, setRes] = useState(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: sample } = useApi('/complaints?flag=open&limit=3')
  const look = async (id) => {
    setBusy(true); setErr(''); setRes(null)
    try { setRes(await api.get(`/passport/${encodeURIComponent(id.trim())}`)) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  useEffect(() => { if (pid) { setV(pid); look(pid) } }, [pid])
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Track your complaint" hint="This is what a citizen sees by SMS or WhatsApp. One ID, in plain words, with no officer details." />
      <Card>
        <form onSubmit={(e) => { e.preventDefault(); nav(`/track/${v.trim()}`) }} className="flex gap-2">
          <input className="input font-mono" value={v} onChange={(e) => setV(e.target.value)} placeholder="Complaint Passport, e.g. SYN-1A2B3C4D" />
          <button className="btn-primary" disabled={busy || !v.trim()}>{busy ? <Loader2 size={15} className="spin" /> : <Search size={15} />}Check</button>
        </form>
        {sample && <div className="mt-3 text-xs text-ink-soft">Try one: {sample.items.map((c) => <button key={c.id} className="mr-2 font-mono text-brand underline" onClick={() => nav(`/track/${c.passport_id}`)}>{c.passport_id}</button>)}</div>}
      </Card>
      {err && <Callout tone="red" className="mt-4" title="Not found">{err}</Callout>}
      {res && (
        <Card className="mt-4" title={res.issue} action={<StatusBadge s={res.status} />} hint={`${res.institution} · ${res.ref_no}`}>
          <div className="mb-4 grid grid-cols-3 gap-3 text-sm"><div><div className="lbl">Filed</div>{fmtDate(res.filed_at)}</div><div><div className="lbl">Expected by</div>{fmtDate(res.due_at)}</div><div><div className="lbl">With</div>{res.bureau}</div></div>
          <ol className="relative ml-2 border-l border-line">
            {res.steps.map((s, k) => (
              <li key={k} className="mb-4 ml-5"><span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-brand" /><div className="text-sm font-medium">{s.label}</div><div className="text-xs text-ink-soft">{fmtDateTime(s.ts)}</div></li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-ink-soft">{res.message}</p>
        </Card>
      )}
    </div>
  )
}
