import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, CheckCircle2, FileText, Send } from 'lucide-react'
import { api, useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, BureauChip, Callout, Card, ErrorBox, PageHeader, Spinner, StatusBadge, TierBadge, ago, cx, fmtDateTime, useAction } from '../ui'

export default function RoomDetail() {
  const { id } = useParams()
  const { notify, meta, role } = useApp()
  const [busy, run] = useAction(notify)
  const [msg, setMsg] = useState('')
  const { data: r, error, reload } = useApi(`/rooms/${id}`)
  if (error) return <ErrorBox error={error} />
  if (!r) return <Spinner />
  const resolved = r.status === 'resolved'
  const a = r.alert
  const acted = (b) => r.acks.includes(b)
  const complete = r.participants.every(acted)
  return (
    <div>
      <PageHeader back={<Link to="/rooms" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-brand"><ArrowLeft size={14} /> All rooms</Link>}
        title={<span className="flex flex-wrap items-center gap-3">Coordination Room #{r.id}<StatusBadge s={r.status} /><TierBadge tier={a.tier} /></span>}
        hint={`${r.institution.name}, ${r.institution.city} · from ${a.alert_no}`}>
        <Link to={`/alerts/${a.id}`} className="btn-ghost">View alert</Link>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Step 1 · Both bureaus acknowledge the joint review" hint="Neither action can advance until both have acknowledged.">
            <div className="grid gap-3 sm:grid-cols-2">
              {r.participants.map((b) => {
                const act = a.action_a_full.bureau === b ? a.action_a_full : a.action_b_full
                return (
                  <div key={b} className={cx('rounded-xl border p-3', acted(b) ? 'border-emerald-200 bg-emerald-50/50' : 'border-line')}>
                    <div className="flex items-center justify-between"><BureauChip id={b} full />{b === r.lead_bureau && <Badge tone="blue">Proposed lead</Badge>}</div>
                    <div className="mt-1 text-sm text-ink-soft">{act.type_label} · {act.ref_no}</div>
                    <div className="mt-3">
                      {acted(b) ? <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CheckCircle2 size={16} /> Acknowledged</div> : (
                        <button className="btn-primary !py-1.5" disabled={busy || resolved} onClick={() => run(async () => { await api.post(`/rooms/${id}/ack`, { bureau: b }); reload() }, `${meta.bureaus[b].short} acknowledged.`)}>Acknowledge as {meta.bureaus[b].short}</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card title="Step 2 · One consolidated notice" hint="Instead of two notices, the college receives a single window notice.">
            {r.notice ? <pre className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-sans text-sm leading-relaxed">{r.notice}</pre> : (
              <button className="btn-ghost" disabled={busy || resolved} onClick={() => run(async () => { await api.post(`/rooms/${id}/notice`); reload() }, 'Consolidated notice drafted.')}><FileText size={16} /> Draft single-window notice</button>
            )}
          </Card>

          <Card title="Step 3 · Resolve">
            {resolved ? <Callout tone="green" icon={CheckCircle2} title="Resolved">The lead action stands, the other is merged into it, and the alert is closed. Recorded in the audit ledger.</Callout> : (
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn-primary" disabled={busy || !complete || !r.notice} onClick={() => run(async () => { await api.post(`/rooms/${id}/resolve`); reload() }, 'Conflict resolved. Actions consolidated.')}><Check size={16} /> Resolve and consolidate</button>
                {(!complete || !r.notice) && <span className="text-sm text-ink-soft">{!complete ? 'Waiting for both acknowledgements.' : 'Draft the notice first.'}</span>}
              </div>
            )}
          </Card>

          <Card title="Merged timeline" hint="Everything either bureau did on this matter, in one place">
            <ol className="max-h-80 space-y-2 overflow-auto text-sm">
              {r.timeline.map((t) => <li key={t.ledger_id} className="flex gap-3"><span className="w-28 shrink-0 text-xs text-ink-soft">{fmtDateTime(t.ts)}</span><span>{t.action.replace(/[._]/g, ' ')} <span className="text-ink-soft">· {t.actor}</span></span></li>)}
            </ol>
          </Card>
        </div>

        <Card title="Discussion" className="h-fit" hint="Messages pass through the LLM Firewall">
          <div className="max-h-96 space-y-3 overflow-auto">
            {r.messages.map((m) => (
              <div key={m.id} className={cx('rounded-lg p-3 text-sm', m.author === 'SYNAPSE' ? 'bg-brand-50 text-brand-700' : 'bg-slate-50')}>
                <div className="mb-0.5 flex justify-between text-xs"><b>{m.author}</b><span className="text-ink-soft">{ago(m.ts)}</span></div>{m.body}
              </div>
            ))}
          </div>
          {!resolved && (
            <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!msg.trim()) return; await run(async () => { await api.post(`/rooms/${id}/message`, { body: msg, author: role === 'ADMIN' ? 'Command Centre' : meta.bureaus[role].short }); setMsg(''); reload() }) }}>
              <input className="input" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Write a message" />
              <button className="btn-primary !px-3" aria-label="Send"><Send size={16} /></button>
            </form>
          )}
        </Card>
      </div>
    </div>
  )
}
