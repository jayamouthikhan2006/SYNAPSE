import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, ShieldAlert } from 'lucide-react'
import { useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, BureauChip, Card, Empty, ErrorBox, PageHeader, Spinner, StatusBadge, TierBadge, Tabs, ago } from '../ui'

export default function Alerts() {
  const { t, meta } = useApp()
  const nav = useNavigate()
  const [tab, setTab] = useState('open')
  const { data, error } = useApi('/alerts')
  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  const f = { open: ['open', 'joint_review'], done: ['resolved', 'dismissed'] }[tab]
  const rows = data.items.filter((a) => f.includes(a.status))
  return (
    <div>
      <PageHeader title={t('ACE Alerts')} hint="ACE reads every bureau's pending actions on a college and raises an alert when two of them clash, before either goes out." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'open', label: 'Needs review', count: data.items.filter((a) => ['open', 'joint_review'].includes(a.status)).length }, { id: 'done', label: 'Resolved or dismissed' }]} />
      <div className="space-y-3">
        {rows.map((a) => (
          <button key={a.id} onClick={() => nav(`/alerts/${a.id}`)} className="card block w-full p-4 text-left transition hover:-translate-y-0.5 hover:shadow-pop">
            <div className="flex flex-wrap items-center gap-2">
              <ShieldAlert size={18} className={a.severity === 'hard' ? 'text-red-600' : 'text-amber-600'} />
              <span className="font-mono text-sm font-semibold">{a.alert_no}</span><TierBadge tier={a.tier} /><StatusBadge s={a.status} /><Badge>Rule {a.rule_id}</Badge>
              <span className="ml-auto text-xs text-ink-soft">{ago(a.created_at)}</span>
            </div>
            <div className="mt-2 font-medium">{a.institution.name} <span className="font-normal text-ink-soft">· {a.institution.city}</span></div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <div className="rounded-lg bg-slate-50 px-3 py-2"><BureauChip id={a.action_a_full.bureau} /> <span className="text-ink-soft">proposes</span> <b>{a.action_a_full.type_label}</b></div>
              <ArrowRight size={16} className="text-ink-faint" />
              <div className="rounded-lg bg-slate-50 px-3 py-2"><BureauChip id={a.action_b_full.bureau} /> <span className="text-ink-soft">proposes</span> <b>{a.action_b_full.type_label}</b></div>
            </div>
          </button>
        ))}
        {!rows.length && <Card><Empty title="No alerts here" hint="Alerts appear here when two bureaus plan conflicting actions on one college." /></Card>}
      </div>
    </div>
  )
}
