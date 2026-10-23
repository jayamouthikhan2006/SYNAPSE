import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Bot, CheckCircle2, Phone, PhoneOff, ShieldAlert, UserCheck } from 'lucide-react'
import { api, useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, BureauChip, Callout, Card, Empty, ErrorBox, Meter, PageHeader, PriorityBadge, Spinner, StatusBadge, Tabs, TierBadge, cx, fmtDate, fmtDateTime, useAction } from '../ui'

function Highlighted({ text, terms }) {
  const parts = useMemo(() => {
    if (!terms?.length) return [text]
    const rx = new RegExp(`\\b(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi')
    return text.split(rx)
  }, [text, terms])
  const set = new Set((terms || []).map((t) => t.toLowerCase()))
  return <>{parts.map((p, i) => (set.has(p.toLowerCase()) ? <mark key={i} className="hl">{p}</mark> : <span key={i}>{p}</span>))}</>
}

const ACTION_LABEL = {
  'complaint.filed': 'Complaint received', 'complaint.assigned': 'Assigned to an officer', 'complaint.transferred': 'Moved to another bureau',
  'complaint.closed': 'Closed', 'complaint.reopened': 'Reopened: complainant said not solved', 'complaint.status_changed': 'Status changed',
  'complaint.resolution_proposed': 'Officer proposed closure, waiting for complainant', 'complaint.resolution_confirmed': 'Complainant confirmed resolution',
}

export default function ComplaintDetail() {
  const { id } = useParams()
  const { notify, meta } = useApp()
  const [tab, setTab] = useState('overview')
  const [pick, setPick] = useState(0)
  const [reason, setReason] = useState('')
  const [busy, run] = useAction(notify)
  const { data: c, error, reload } = useApi(`/complaints/${id}`)
  const { data: an } = useApi(tab === 'ai' || tab === 'related' ? `/complaints/${id}/analysis?other=${pick}` : null, [id, pick, tab])
  if (error) return <ErrorBox error={error} />
  if (!c) return <Spinner />
  const closed = c.status === 'Closed'
  const officers = Array.from({ length: 8 }, (_, k) => `${c.bureau}-${String(k + 1).padStart(2, '0')}`)
  const tabs = [{ id: 'overview', label: 'Overview' }, { id: 'ai', label: 'AI analysis' }, { id: 'related', label: 'Related cases' }, { id: 'timeline', label: 'Timeline', count: c.timeline.length }, { id: 'actions', label: 'Actions' }]

  const tryClose = async () => {
    try { await api.post(`/complaints/${id}/close`, { reason }); notify('Case closed.'); reload() }
    catch (e) { notify(e.message, 'error'); reload() }
  }
  return (
    <div>
      <PageHeader back={<Link to="/complaints" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-brand"><ArrowLeft size={14} /> Back to complaints</Link>}
        title={<span className="flex flex-wrap items-center gap-3"><span className="font-mono">{c.ref_no}</span><PriorityBadge p={c.priority} /><StatusBadge s={c.status} /></span>}
        hint={c.category_label}>
        {!closed && <button className="btn-primary" disabled={busy} onClick={() => run(async () => { await api.post(`/complaints/${id}/assign`, { officer: officers[0] }); reload() }, `Assigned to ${officers[0]} after workload, language and conflict-of-interest check.`)}><UserCheck size={16} /> Assign</button>}
      </PageHeader>
      <div className="-mt-3 mb-5 text-sm text-ink-soft">
        <Link className="font-medium text-brand hover:underline" to={`/institutions/${c.institution.id}`}>{c.institution.name}</Link> · {c.institution.city} · Filed {fmtDate(c.filed_at)} · Passport <span className="font-mono">{c.passport_id}</span>
      </div>
      {c.firewall_flag === 1 && (
        <Callout tone="purple" icon={ShieldAlert} className="mb-4" title="Held for review by the LLM Firewall">
          The text contained instructions aimed at the AI ({c.firewall_reasons.map((r) => r.why).join('; ')}). The AI used only the cleaned text and took no action from it. An officer decides everything.
        </Callout>
      )}
      {c.incident && (
        <Callout tone={c.incident.kind === 'coordinated_campaign' ? 'amber' : 'blue'} className="mb-4" title={c.incident.title}>
          Part of one incident with {c.incident.complaint_count} complaints. <Link to="/incidents" className="font-semibold underline">See issue threads</Link>
        </Callout>
      )}
      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2" title="What the complainant said">
            <p className="whitespace-pre-line text-[15px] leading-relaxed">{c.text_en}</p>
            {c.lang !== 'en' && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3"><div className="lbl mb-1">Original ({c.lang.toUpperCase()})</div><p className="text-sm">{c.text_original}</p></div>
            )}
          </Card>
          <div className="space-y-4">
            <Card title="Case details">
              {[['Issue', c.category_label], ['Bureau', <BureauChip id={c.bureau} full />], ['Assigned to', c.assigned_to || 'Not yet assigned'],
                ['Channel', meta.channels[c.channel]], ['Academic year', c.academic_year], ['Institution match', `${Math.round(c.match_confidence || 100)}% confidence`],
                ['Bureau transfers', c.transfers]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-line/70 py-2 text-sm last:border-0"><span className="text-ink-soft">{k}</span><span className="text-right font-medium">{v}</span></div>
              ))}
            </Card>
            <Card title="Deadline (SLA clock)">
              <Meter value={Math.min(100, c.sla.elapsed_pct)} tone={c.sla.breached ? 'red' : c.sla.predicted_breach ? 'amber' : 'green'} label={`Due ${fmtDate(c.due_at)}`} />
              <div className="mt-2 text-sm">{closed ? 'Closed.' : c.sla.breached ? <b className="text-red-600">Past deadline</b> : c.sla.predicted_breach ? <b className="text-amber-600">Likely to be missed: act now</b> : `${c.sla.days_left} days left`}</div>
              {c.sla.flags.map((f) => <div key={f} className="mt-1 text-xs text-amber-700">⚠ {f}</div>)}
            </Card>
          </div>
        </div>
      )}

      {tab === 'ai' && (
        !an ? <Spinner label="Comparing with other cases" /> : (
          <div className="grid gap-4 lg:grid-cols-5">
            <Card className="lg:col-span-2" title="AI matching results" hint="Advisory only. Officers decide. Rules are deterministic and explained.">
              <div className="space-y-2">
                {an.matches.slice(0, 7).map((m) => (
                  <button key={m.id} onClick={() => setPick(m.id)} className={cx('w-full rounded-xl border p-3 text-left transition hover:border-brand/50', (an.comparison?.matched.ref_no === m.ref_no) ? 'border-brand bg-brand-50/40' : 'border-line')}>
                    <div className="flex items-center justify-between gap-2"><TierBadge tier={m.tier} name={m.tier_name} /><span className="text-lg font-semibold">{Math.round(m.similarity * 100)}%</span></div>
                    <div className="mt-1.5 text-sm font-medium">{m.title}</div>
                    <div className="text-xs text-ink-soft">{m.ref_no} · {fmtDate(m.filed_at)} · <BureauChip id={m.bureau} /></div>
                    <div className="mt-1 text-xs text-brand">{m.workflow}</div>
                  </button>
                ))}
                {!an.matches.length && <Empty title="No related cases found" />}
              </div>
            </Card>
            <div className="space-y-4 lg:col-span-3">
              <Card title="Similarity analysis">
                <div className="mb-2 flex items-baseline justify-between"><span className="text-sm text-ink-soft">Overall similarity to closest related case</span><span className="text-2xl font-semibold text-brand">{Math.round(an.overall * 100)}%</span></div>
                <Meter value={an.overall * 100} />
                {an.comparison && <div className="mt-3 flex flex-wrap gap-1.5">{an.comparison.shared_terms.map((t) => <Badge key={t} tone="green">{t}</Badge>)}</div>}
                <p className="mt-3 text-xs text-ink-soft">{an.method} Text engine: {an.embedding}.</p>
              </Card>
              {an.comparison && (
                <Card title="Text comparison" hint="Highlighted words appear in both complaints">
                  <div className="space-y-3 text-sm leading-relaxed">
                    <div className="rounded-lg border border-line p-3"><div className="lbl mb-1">Current ({an.comparison.current.ref_no})</div><Highlighted text={an.comparison.current.text} terms={an.comparison.shared_terms} /></div>
                    <div className="rounded-lg border border-line p-3"><div className="lbl mb-1">Matched ({an.comparison.matched.ref_no})</div><Highlighted text={an.comparison.matched.text} terms={an.comparison.shared_terms} /></div>
                  </div>
                </Card>
              )}
            </div>
          </div>
        )
      )}

      {tab === 'related' && (
        !an ? <Spinner /> : (
          <Card pad={false}>
            <table className="w-full">
              <thead><tr><th className="th">Case</th><th className="th">Relationship</th><th className="th">Why</th><th className="th">Next step</th></tr></thead>
              <tbody className="divide-y divide-line">
                {an.matches.map((m) => (
                  <tr key={m.id}>
                    <td className="td"><Link className="font-mono text-xs font-semibold text-brand" to={`/complaints/${m.id}`}>{m.ref_no}</Link><div className="text-xs text-ink-soft"><BureauChip id={m.bureau} /> · {m.institution_name}</div></td>
                    <td className="td"><TierBadge tier={m.tier} name={m.tier_name} /></td>
                    <td className="td max-w-md"><ul className="list-disc pl-4 text-xs text-ink-soft">{m.reasons.map((r, k) => <li key={k}>{r}</li>)}</ul></td>
                    <td className="td text-sm">{m.workflow}</td>
                  </tr>
                ))}
                {!an.matches.length && <tr><td colSpan={4}><Empty title="No related cases" /></td></tr>}
              </tbody>
            </table>
          </Card>
        )
      )}

      {tab === 'timeline' && (
        <Card title="Timeline" hint="Every step is also written to the tamper-evident audit ledger">
          <ol className="relative ml-2 border-l border-line">
            {c.timeline.map((t) => (
              <li key={t.ledger_id} className="mb-4 ml-5">
                <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-brand" />
                <div className="text-sm font-medium">{ACTION_LABEL[t.action] || t.action}</div>
                <div className="text-xs text-ink-soft">{fmtDateTime(t.ts)} · {t.actor}{t.model_version ? ` · ${t.model_version}` : ''} · ledger #{t.ledger_id}</div>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {tab === 'actions' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Resolution Assurance" hint="A case counts as closed only when the complainant confirms it.">
            {closed ? <Callout tone="green" icon={CheckCircle2} title="Closed">{c.resolution_confirmed ? 'The complainant confirmed the resolution.' : 'Closed without confirmation.'}{c.resolution_note ? ` Note: ${c.resolution_note}` : ''}</Callout> : (
              <div className="space-y-3">
                <label className="lbl">Reason for closure</label>
                <textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain what was done to resolve this. At least 15 characters." />
                <button className="btn-primary w-full" disabled={busy} onClick={() => run(tryClose)}>Request closure</button>
                <p className="text-xs text-ink-soft">Try it with an empty reason, then with a reason but no complainant confirmation. Both are refused.</p>
                {c.status === 'Resolved - Pending Confirmation' && (
                  <div className="rounded-xl border border-teal-200 bg-teal-50 p-3">
                    <div className="mb-2 text-sm font-medium text-teal-800">Voice callback to complainant: what did they say?</div>
                    <div className="flex gap-2">
                      <button className="btn-ghost flex-1" disabled={busy} onClick={() => run(async () => { const r = await api.post(`/complaints/${id}/callback`, { resolved: true }); reload(); return r }, 'Complainant confirmed. Case closed.')}><Phone size={15} /> "It is solved"</button>
                      <button className="btn-danger flex-1" disabled={busy} onClick={() => run(async () => { const r = await api.post(`/complaints/${id}/callback`, { resolved: false }); reload(); return r }, 'Case reopened with its original context.')}><PhoneOff size={15} /> "Not solved"</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
          <Card title="Move this case">
            <label className="lbl">Transfer to another bureau</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(meta.bureaus).filter(([k]) => k !== c.bureau).map(([k, b]) => (
                <button key={k} className="btn-ghost" disabled={busy || closed} onClick={() => run(async () => { await api.post(`/complaints/${id}/transfer`, { bureau: k }); reload() }, `Moved to ${b.name}`)}>{b.short}</button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-soft">After 3 transfers SYNAPSE marks the case as bouncing between bureaus and raises it on the dashboard.</p>
            <Link className="btn-ghost mt-4" to={`/actions/new?institution_id=${c.institution.id}&complaint_id=${c.id}`}><Bot size={15} /> Draft enforcement action with ACE check</Link>
          </Card>
        </div>
      )}
    </div>
  )
}
