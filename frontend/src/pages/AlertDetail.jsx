import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, BookOpen, MessageSquare, Users2, X } from 'lucide-react'
import { api, useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, BureauChip, Callout, Card, ErrorBox, Modal, PageHeader, PriorityBadge, Spinner, StatusBadge, TierBadge, fmtDate, fmtDateTime, useAction } from '../ui'

function ActionCard({ n, a }) {
  return (
    <div className="card flex-1 overflow-hidden border-red-100">
      <div className="flex items-center justify-between border-b border-red-100 bg-red-50/60 px-4 py-2.5">
        <div className="text-sm font-semibold text-red-700">Action {n} · <BureauChip id={a.bureau} full /></div><StatusBadge s={a.status} />
      </div>
      <dl className="space-y-2.5 p-4 text-sm">
        {[['Action type', a.type_label], ['Reference', <span className="font-mono">{a.ref_no}</span>], ['Subject', a.subject], ['Proposed date', fmtDate(a.proposed_date)], ['Clause', a.clause]].map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3"><dt className="text-ink-soft">{k}</dt><dd className="text-right font-medium">{v}</dd></div>
        ))}
        <div><dt className="mb-0.5 text-ink-soft">Summary</dt><dd>{a.summary}</dd></div>
      </dl>
    </div>
  )
}

export default function AlertDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { notify } = useApp()
  const [busy, run] = useAction(notify)
  const { data: a, error, reload } = useApi(`/alerts/${id}`)
  const [dismiss, setDismiss] = useState(false)
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [showC, setShowC] = useState(false)
  if (error) return <ErrorBox error={error} />
  if (!a) return <Spinner />
  const active = ['open', 'joint_review'].includes(a.status)
  return (
    <div>
      <PageHeader back={<Link to="/alerts" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-brand"><ArrowLeft size={14} /> All alerts</Link>}
        title={<span className="flex flex-wrap items-center gap-3"><AlertTriangle className="text-red-600" size={24} /> ACE Alert <span className="font-mono text-xl">{a.alert_no}</span><TierBadge tier={a.tier} /><StatusBadge s={a.status} /></span>}
        hint={`${a.institution.name}, ${a.institution.city}. ACE found that two bureaus propose actions that may collide. Nothing has been executed yet.`} />

      <div className="mb-5 flex flex-col items-stretch gap-4 lg:flex-row">
        <ActionCard n={1} a={a.action_a_full} />
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 px-2 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-red-50 text-red-600"><AlertTriangle size={26} /></div>
          <div className="text-sm font-semibold text-red-700">{a.severity === 'hard' ? 'Cannot both stand' : 'Overlap'}</div><div className="text-xs text-ink-soft">Rule {a.rule_id}</div>
        </div>
        <ActionCard n={2} a={a.action_b_full} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Callout tone="amber" icon={AlertTriangle} title="Why ACE flagged this">
            <p>{a.explanation}</p>
            <p className="mt-2 font-medium">Recommendation: {a.recommendation}</p>
          </Callout>
          {a.complaints.length > 0 && (
            <Card title="Complaints behind these actions" pad={false}>
              <table className="mt-3 w-full">
                <tbody className="divide-y divide-line">
                  {a.complaints.map((c) => (
                    <tr key={c.id} className="row-link" onClick={() => nav(`/complaints/${c.id}`)}>
                      <td className="td font-mono text-xs font-semibold text-brand">{c.ref_no}</td><td className="td">{c.category_label}</td>
                      <td className="td"><BureauChip id={c.bureau} /></td><td className="td"><PriorityBadge p={c.priority} /></td><td className="td"><StatusBadge s={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          <Card title="History">
            <ol className="space-y-2 text-sm">
              {a.timeline.map((t) => <li key={t.ledger_id} className="flex gap-3"><span className="w-28 shrink-0 text-xs text-ink-soft">{fmtDateTime(t.ts)}</span><span>{t.action.replace('.', ' · ').replace(/_/g, ' ')} <span className="text-ink-soft">({t.actor})</span>{t.payload.comment ? `: ${t.payload.comment}` : ''}{t.payload.reason ? `: ${t.payload.reason}` : ''}</span></li>)}
            </ol>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Related rules">
            <div className="flex gap-2.5 text-sm"><BookOpen size={17} className="mt-0.5 shrink-0 text-brand" /><div>{a.refs.map((r) => <div key={r}>{r}</div>)}<div className="mt-1 text-xs text-ink-soft">Matrix rule {a.rule_id}: deterministic and auditable.</div></div></div>
          </Card>
          {active && (
            <Card title="What would you like to do?">
              <div className="space-y-2">
                {a.room ? <Link className="btn-primary w-full" to={`/rooms/${a.room.id}`}><Users2 size={16} /> Open Coordination Room</Link> : (
                  <button className="btn-primary w-full" disabled={busy} onClick={() => run(async () => { const r = await api.post(`/alerts/${id}/joint-review`); nav(`/rooms/${r.room_id}`) }, 'Coordination Room opened.')}><Users2 size={16} /> Request joint review</button>
                )}
                <button className="btn-ghost w-full" onClick={() => setDismiss(true)}><X size={16} /> Dismiss alert</button>
                <button className="btn-ghost w-full" onClick={() => setShowC(true)}><MessageSquare size={16} /> Add comment</button>
              </div>
              <p className="mt-3 text-xs text-ink-soft">While the alert is open, neither action can be issued.</p>
            </Card>
          )}
        </div>
      </div>

      <Modal open={dismiss} onClose={() => setDismiss(false)} title="Dismiss this alert">
        <p className="mb-2 text-sm text-ink-soft">A written reason is required. It is stored permanently in the audit ledger.</p>
        <textarea className="input min-h-24" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this not a real conflict?" />
        <div className="mt-3 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setDismiss(false)}>Cancel</button>
          <button className="btn-primary" disabled={busy} onClick={() => run(async () => { await api.post(`/alerts/${id}/dismiss`, { reason }); setDismiss(false); reload() }, 'Alert dismissed and logged.')}>Dismiss with reason</button></div>
      </Modal>
      <Modal open={showC} onClose={() => setShowC(false)} title="Add comment">
        <textarea className="input min-h-24" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Visible to both bureaus" />
        <div className="mt-3 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setShowC(false)}>Cancel</button>
          <button className="btn-primary" disabled={busy || !comment.trim()} onClick={() => run(async () => { await api.post(`/alerts/${id}/comment`, { body: comment }); setShowC(false); setComment(''); reload() }, 'Comment added.')}>Post</button></div>
      </Modal>
    </div>
  )
}
