import { useState } from 'react'
import { ShieldCheck, ShieldX } from 'lucide-react'
import { api, qs, useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, Callout, Card, ErrorBox, PageHeader, Pager, SearchBox, Spinner, fmtDateTime, num, useAction } from '../ui'

export default function Ledger() {
  const { t, notify } = useApp()
  const [q, setQ] = useState('')
  const [offset, setOffset] = useState(0)
  const [verify, setVerify] = useState(null)
  const [busy, run] = useAction(notify)
  const limit = 25
  const { data, error, reload } = useApi('/ledger' + qs({ ref: q, offset, limit }))
  const { data: v0, reload: rv } = useApi('/ledger/verify')
  const v = verify || v0
  const after = (r) => { setVerify(r.verify); reload() }
  if (error) return <ErrorBox error={error} />
  return (
    <div>
      <PageHeader title={t('Audit Ledger')} hint="Every step is recorded with a fingerprint linked to the row before it. Edit one old row and every later fingerprint stops matching." />
      <div className="mb-5 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          {!v ? <Spinner /> : (
            <div className="text-center">
              <div className={`mx-auto mb-3 grid h-16 w-16 place-items-center rounded-2xl ${v.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{v.ok ? <ShieldCheck size={32} /> : <ShieldX size={32} />}</div>
              <div className="h-sec">{v.ok ? 'Chain intact' : 'Tampering detected'}</div>
              <div className="mt-1 text-sm text-ink-soft">{v.ok ? `${num(v.checked)} records verified` : `Broken at record #${v.broken_at}: ${v.reason}`}</div>
              <button className="btn-ghost mt-4" disabled={busy} onClick={() => run(async () => { setVerify(await api.get('/ledger/verify')) }, 'Verification finished.')}>Verify now</button>
            </div>
          )}
        </Card>
        <Card className="lg:col-span-2" title="Try the tamper test" hint="Demo only: edits one old record directly in the database, bypassing the application.">
          <div className="flex flex-wrap gap-2">
            <button className="btn-danger" disabled={busy} onClick={() => run(async () => after(await api.post('/ledger/tamper-demo')), 'A record was edited behind the application. Look at the status.')}>1. Edit a record secretly</button>
            <button className="btn-ghost" disabled={busy} onClick={() => run(async () => after(await api.post('/ledger/restore-demo')), 'Original record restored.')}>2. Restore it</button>
          </div>
          {v && !v.ok && <Callout tone="red" className="mt-4" title="Caught">The check walked the chain, recomputed each fingerprint and found record #{v.broken_at} no longer matches. In production this would page the security team.</Callout>}
        </Card>
      </div>
      <Card pad={false}>
        <div className="border-b border-line p-4"><SearchBox className="max-w-sm" value={q} onChange={(x) => { setQ(x); setOffset(0) }} placeholder="Filter by reference (complaint, action, alert)" /></div>
        {!data ? <Spinner /> : (
          <>
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr><th className="th">#</th><th className="th">Time</th><th className="th">Who</th><th className="th">What</th><th className="th">Reference</th><th className="th">Fingerprint</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.items.map((r) => (
                  <tr key={r.id} className={v && !v.ok && r.id === v.broken_at ? 'bg-red-50' : ''}>
                    <td className="td font-mono text-xs">{r.id}</td><td className="td whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(r.ts)}</td><td className="td text-sm">{r.actor}</td>
                    <td className="td"><Badge tone={r.action.startsWith('ace') ? 'red' : r.action.startsWith('room') ? 'amber' : 'blue'}>{r.action}</Badge>{r.model_version && <Badge className="ml-1">{r.model_version}</Badge>}</td>
                    <td className="td font-mono text-xs">{r.ref}</td><td className="td font-mono text-[11px] text-ink-faint" title={r.hash}>{r.hash.slice(0, 12)}...</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pager total={data.total} offset={offset} limit={limit} onChange={setOffset} />
          </>
        )}
      </Card>
    </div>
  )
}
