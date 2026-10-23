import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, EyeOff, MapPin, Plus, ShieldAlert, VolumeX } from 'lucide-react'
import { useApi } from '../api'
import GraphView from '../graph'
import { Badge, BureauChip, Callout, Card, Empty, ErrorBox, Meter, PageHeader, PriorityBadge, RiskBadge, Spinner, Stat, StatusBadge, Tabs, TierBadge, fmtDate } from '../ui'

const TYPES = { CFI: 'Centrally funded', GOVT: 'State government', PVT: 'Private self-financed', DEEMED: 'Deemed university' }

function Detail({ k, v }) {
  return <div className="flex justify-between gap-4 border-b border-line/70 py-2 text-sm last:border-0"><span className="text-ink-soft">{k}</span><span className="text-right font-medium">{v || '-'}</span></div>
}

export default function Institution360() {
  const { id } = useParams()
  const nav = useNavigate()
  const [tab, setTab] = useState('overview')
  const { data, error } = useApi(`/institutions/${id}`)
  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  const { institution: i, complaints, actions, incidents, alerts, indicators, silence, graph } = data
  const open = complaints.filter((c) => !['Closed'].includes(c.status))
  const tabs = [
    { id: 'overview', label: 'Overview' }, { id: 'complaints', label: 'Complaints', count: complaints.length },
    { id: 'actions', label: 'Enforcement actions', count: actions.length }, { id: 'graph', label: 'Institution graph' },
    { id: 'incidents', label: 'Issue threads', count: incidents.length },
  ]
  return (
    <div>
      <PageHeader back={<Link to="/institutions" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-brand"><ArrowLeft size={14} /> All institutions</Link>}
        title={i.name}>
        <Link to={`/actions/new?institution_id=${i.id}`} className="btn-primary"><Plus size={16} /> New enforcement action</Link>
      </PageHeader>
      <div className="-mt-3 mb-5 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
        <span className="font-mono text-xs">AICTE ID {i.aicte_id}</span><span>·</span><Badge>{TYPES[i.type]}</Badge>
        <span className="flex items-center gap-1"><MapPin size={13} />{i.city}, {i.state}</span>
        {i.source === 'demo' ? <Badge tone="amber">Simulated cases</Badge> : <Badge tone="green">Public registry entry</Badge>}
        {i.stats.total > 0 && <RiskBadge level={i.risk_level} score={i.risk} />}
      </div>

      {i.stats.total === 0 && (
        <Callout tone="blue" className="mb-5" title="No cases on this record">
          This is a real institution from the public registry. It is kept so that misspelt or transliterated names in new complaints can be matched to it. Simulated cases are attached only to fictional composite colleges.
        </Callout>
      )}

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="order-2 space-y-4 lg:order-1 lg:col-span-1">
            <Card title="Institution details">
              <Detail k="AICTE ID" v={<span className="font-mono">{i.aicte_id}</span>} />
              <Detail k="Type" v={TYPES[i.type]} /><Detail k="City" v={i.city} /><Detail k="State" v={i.state} /><Detail k="District" v={i.district} />
              <Detail k="Affiliation" v={i.affiliation} /><Detail k="Established" v={i.estd} /><Detail k="Approved intake" v={i.intake} />
              <Detail k="Parent trust" v={i.parent_name} />
              <Detail k="Last AICTE inspection" v={i.last_inspection ? `${fmtDate(i.last_inspection)} · ${i.inspection_result}` : null} />
              {i.shared_campus_with && <Detail k="Shared campus" v="Yes (see graph)" />}
            </Card>
            <Card title="Risk indicators" hint="Plain-language reasons this college is flagged">
              {indicators.length ? (
                <ul className="space-y-2.5">
                  {indicators.map((x, k) => (
                    <li key={k} className="flex gap-2.5 text-sm">
                      <AlertTriangle size={16} className={x.level === 'high' ? 'mt-0.5 shrink-0 text-red-500' : 'mt-0.5 shrink-0 text-amber-500'} />
                      <span>{x.text}</span>
                    </li>
                  ))}
                </ul>
              ) : <div className="text-sm text-ink-soft">No risk indicators.</div>}
            </Card>
            {i.stats.total > 0 && (
              <Card title="Grievance Health Index" hint="Higher is better. Based on confirmed resolutions, deadlines, reopens, incidents and honest reporting.">
                <div className="mb-2 text-3xl font-semibold">{i.health}<span className="text-base font-normal text-ink-soft"> / 100</span></div>
                <Meter value={i.health} tone={i.health >= 70 ? 'green' : i.health >= 40 ? 'amber' : 'red'} />
              </Card>
            )}
          </div>
          <div className="order-1 space-y-4 lg:order-2 lg:col-span-2">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat icon={ShieldAlert} tone="red" label="Open complaints" value={i.stats.open} sub={`${i.stats.breached} past deadline`} />
              <Stat icon={ShieldAlert} tone="purple" label="Active actions" value={i.stats.actions} sub={`${i.stats.alerts} collision(s)`} />
              <Stat icon={ShieldAlert} tone="amber" label="Systemic incidents" value={i.stats.incidents} />
            </div>
            {silence && (
              <Callout tone="amber" icon={VolumeX} title="Silence anomaly: possible under-reporting">{silence.message}</Callout>
            )}
            {data.hidden_actions > 0 && (
              <Callout tone="blue" icon={EyeOff} title={`${data.hidden_actions} action(s) from other bureaus are hidden`}>
                Draft and proposed actions of other bureaus stay private until ACE finds a clash. Change "Viewing as" to see how this works.
              </Callout>
            )}
            <Card title="Relationship graph" hint="Click a sister campus to open it" action={<button className="text-sm font-medium text-brand" onClick={() => setTab('graph')}>Open larger</button>}>
              <GraphView graph={graph} height={300} />
            </Card>
            <Card title="What the complaints are about">
              <div className="space-y-2.5">
                {data.categories.map((c) => (
                  <div key={c.category} className="flex items-center gap-3 text-sm">
                    <div className="w-60 shrink-0 truncate">{c.label}</div>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand/80" style={{ width: `${(c.count / data.categories[0].count) * 100}%` }} /></div>
                    <div className="w-8 text-right tabular-nums">{c.count}</div>
                  </div>
                ))}
                {!data.categories.length && <Empty title="No complaints" />}
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === 'complaints' && (
        <Card pad={false}>
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0"><tr><th className="th">Complaint</th><th className="th">Issue</th><th className="th">Bureau</th><th className="th">Priority</th><th className="th">Status</th><th className="th">Filed</th></tr></thead>
              <tbody className="divide-y divide-line">
                {complaints.map((c) => (
                  <tr key={c.id} className="row-link" onClick={() => nav(`/complaints/${c.id}`)}>
                    <td className="td font-mono text-xs font-semibold text-brand">{c.ref_no}</td><td className="td">{c.category_label}</td>
                    <td className="td"><BureauChip id={c.bureau} /></td><td className="td"><PriorityBadge p={c.priority} /></td>
                    <td className="td"><StatusBadge s={c.status} /></td><td className="td text-ink-soft">{fmtDate(c.filed_at)}</td>
                  </tr>
                ))}
                {!complaints.length && <tr><td colSpan={6}><Empty title="No complaints for this college" /></td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === 'actions' && (
        <div className="space-y-3">
          {alerts.filter((a) => ['open', 'joint_review'].includes(a.status)).map((a) => (
            <Callout key={a.id} tone="red" icon={ShieldAlert} title={`ACE alert ${a.alert_no}`}>
              {a.explanation} <Link className="font-semibold underline" to={`/alerts/${a.id}`}>Open alert</Link>
            </Callout>
          ))}
          <Card pad={false}>
            <table className="w-full">
              <thead><tr><th className="th">Reference</th><th className="th">Action</th><th className="th">Bureau</th><th className="th">Status</th><th className="th">Proposed date</th><th className="th">Summary</th></tr></thead>
              <tbody className="divide-y divide-line">
                {actions.map((a) => (
                  <tr key={a.id}>
                    <td className="td font-mono text-xs font-semibold">{a.ref_no}</td><td className="td">{a.type_label}</td><td className="td"><BureauChip id={a.bureau} /></td>
                    <td className="td"><StatusBadge s={a.status} /></td><td className="td">{fmtDate(a.proposed_date)}</td><td className="td max-w-sm text-sm text-ink-soft">{a.summary}</td>
                  </tr>
                ))}
                {!actions.length && <tr><td colSpan={6}><Empty title="No visible actions" hint="Actions of other bureaus may be hidden for your role." /></td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      )}

      {tab === 'graph' && (
        <Card title="Institution and relationship graph" hint="The college is the centre. Its trust, sister campuses and the bureaus working on it are connected.">
          <GraphView graph={graph} height={520} />
        </Card>
      )}

      {tab === 'incidents' && (
        <div className="grid gap-4 md:grid-cols-2">
          {incidents.map((n) => (
            <Card key={n.id} title={n.title} hint={`${n.complainants} different complainants · ${fmtDate(n.first_at)} to ${fmtDate(n.last_at)}`}>
              <div className="mb-3 flex items-center gap-3"><div className="text-3xl font-semibold">{Math.round(n.corroboration)}</div><div className="text-xs text-ink-soft">Corroboration index<br />checked against AICTE's own records</div></div>
              <ul className="space-y-1.5 text-sm">{n.checks.checks?.map((c, k) => <li key={k} className="flex gap-2"><span className={c.ok ? 'text-emerald-600' : 'text-ink-faint'}>{c.ok ? '✓' : '○'}</span>{c.label}</li>)}</ul>
            </Card>
          ))}
          {!incidents.length && <div className="md:col-span-2"><Empty title="No systemic incidents for this college" /></div>}
        </div>
      )}
    </div>
  )
}
