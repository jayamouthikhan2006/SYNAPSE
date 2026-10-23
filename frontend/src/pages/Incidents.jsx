import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Layers, Siren } from 'lucide-react'
import { useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, BureauChip, Callout, Card, Empty, ErrorBox, Meter, PageHeader, PriorityBadge, Spinner, StatusBadge, Tabs, fmtDate } from '../ui'

export default function Incidents() {
  const { t, meta } = useApp()
  const [tab, setTab] = useState('systemic')
  const [sel, setSel] = useState(null)
  const { data, error } = useApi(`/incidents?kind=${tab === 'systemic' ? 'systemic' : 'coordinated_campaign'}`)
  const { data: d } = useApi(sel ? `/incidents/${sel}` : null, [sel])
  if (error) return <ErrorBox error={error} />
  return (
    <div>
      <PageHeader title={t('Issue Threads')} hint="Many complaints about the same problem at one college are grouped into one incident, so management sees the pattern, not 50 tickets." />
      <Tabs value={tab} onChange={(v) => { setTab(v); setSel(null) }} tabs={[{ id: 'systemic', label: 'Systemic incidents' }, { id: 'campaign', label: 'Suspected fake-complaint bursts' }]} />
      {!data ? <Spinner /> : (
        <div className="grid gap-4 lg:grid-cols-5">
          <div className="space-y-3 lg:col-span-2">
            {data.items.map((n) => (
              <button key={n.id} onClick={() => setSel(n.id)} className={`card block w-full p-4 text-left transition hover:shadow-pop ${sel === n.id ? 'ring-2 ring-brand' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${n.kind === 'systemic' ? 'bg-brand-50 text-brand' : 'bg-amber-50 text-amber-600'}`}>{n.kind === 'systemic' ? <Layers size={19} /> : <Siren size={19} />}</div>
                  <div className="min-w-0">
                    <div className="font-medium leading-snug">{n.title}</div>
                    <div className="mt-0.5 text-xs text-ink-soft">{n.institution_name} · {n.city}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5"><Badge tone="blue">{n.complaint_count} complaints</Badge><Badge>{n.complainants} complainants</Badge>
                      {n.kind === 'systemic' && <Badge tone="green">Corroboration {Math.round(n.corroboration)}</Badge>}</div>
                  </div>
                </div>
              </button>
            ))}
            {!data.items.length && <Card><Empty title="None found" /></Card>}
          </div>
          <div className="lg:col-span-3">
            {!sel ? <Card><Empty title="Select an incident" hint="You will see the evidence, the checks against AICTE's own records and the complaints inside it." /></Card> : !d ? <Spinner /> : (
              <div className="space-y-4">
                <Card title={d.title} hint={`${d.institution_name} · ${fmtDate(d.first_at)} to ${fmtDate(d.last_at)}`}>
                  {d.kind === 'coordinated_campaign' ? (
                    <Callout tone="amber" title="Looks like a coordinated burst, not independent complaints">
                      {d.complaint_count} near-identical complaints arrived within {d.checks.span_hours} hours from only {d.complainants} identities. They are grouped and marked so one person cannot swamp the triage queue. Officers decide whether any of it is genuine.
                    </Callout>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <div className="lbl mb-1">Corroboration index</div><div className="mb-2 text-3xl font-semibold">{Math.round(d.corroboration)}<span className="text-base font-normal text-ink-soft"> / 100</span></div>
                        <Meter value={d.corroboration} tone={d.corroboration >= 70 ? 'red' : 'amber'} />
                        <p className="mt-2 text-xs text-ink-soft">How strongly AICTE's own data backs these allegations.</p>
                      </div>
                      <ul className="space-y-1.5 text-sm">{d.checks.checks?.map((c, k) => <li key={k} className="flex gap-2"><span className={c.ok ? 'text-emerald-600' : 'text-ink-faint'}>{c.ok ? '✓' : '○'}</span>{c.label}</li>)}</ul>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-6 text-sm">
                    <div><div className="lbl mb-1">By bureau</div>{d.by_bureau.map((b) => <div key={b.bureau} className="flex gap-2"><BureauChip id={b.bureau} /> <b>{b.n}</b></div>)}</div>
                    <div><div className="lbl mb-1">By channel</div>{d.by_channel.slice(0, 5).map((b) => <div key={b.channel}>{meta.channels[b.channel]} <b>{b.n}</b></div>)}</div>
                    {d.checks.terms?.length > 0 && <div><div className="lbl mb-1">Common words</div><div className="flex flex-wrap gap-1">{d.checks.terms.map((x) => <Badge key={x} tone="green">{x}</Badge>)}</div></div>}
                  </div>
                </Card>
                <Card title={`Complaints in this incident (${d.complaint_count})`} pad={false}>
                  <div className="max-h-96 overflow-auto"><table className="mt-3 w-full"><tbody className="divide-y divide-line">
                    {d.complaints.map((c) => (
                      <tr key={c.id}><td className="td"><Link className="font-mono text-xs font-semibold text-brand" to={`/complaints/${c.id}`}>{c.ref_no}</Link></td>
                        <td className="td max-w-sm"><div className="line-clamp-2 text-sm">{c.text_en}</div></td><td className="td"><PriorityBadge p={c.priority} /></td><td className="td"><StatusBadge s={c.status} /></td></tr>
                    ))}
                  </tbody></table></div>
                </Card>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
