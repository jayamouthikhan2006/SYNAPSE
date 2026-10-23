import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { FilePlus2 } from 'lucide-react'
import { qs, useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, BureauChip, Card, ErrorBox, PageHeader, Pager, PriorityBadge, SearchBox, Select, Spinner, StatusBadge, TierBadge, cx, fmtDate } from '../ui'

const CHIPS = [
  { id: '', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'overdue', label: 'Past deadline' },
  { id: 'pingpong', label: 'Bouncing between bureaus' }, { id: 'quarantined', label: 'Held for review' }, { id: 'campaign', label: 'Suspected fake burst' },
]

export default function Complaints() {
  const { meta, t } = useApp()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') || '')
  const [dq, setDq] = useState(q)
  const [flag, setFlag] = useState(sp.get('flag') || '')
  const [status, setStatus] = useState('')
  const [bureau, setBureau] = useState('')
  const [category, setCategory] = useState('')
  const [priority, setPriority] = useState('')
  const [offset, setOffset] = useState(0)
  const instId = Number(sp.get('institution_id') || 0)
  useEffect(() => { const h = setTimeout(() => { setDq(q); setOffset(0) }, 250); return () => clearTimeout(h) }, [q])
  useEffect(() => { setQ(sp.get('q') || ''); setFlag(sp.get('flag') || '') }, [sp])
  const limit = 25
  const { data, error } = useApi('/complaints' + qs({ q: dq, flag, status, bureau, category, priority, institution_id: instId, offset, limit }))
  return (
    <div>
      <PageHeader title={t('Complaints')} hint="Complaints from all nine channels. The Related column shows when another bureau is already handling something connected."
        >
        <Link to="/file" className="btn-primary"><FilePlus2 size={16} /> New complaint</Link>
      </PageHeader>
      <div className="mb-3 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button key={c.id} onClick={() => { setFlag(c.id); setOffset(0) }}
            className={cx('rounded-full border px-3.5 py-1.5 text-sm font-medium transition', flag === c.id ? 'border-brand bg-brand text-white' : 'border-line bg-white text-ink-soft hover:border-brand/40')}>{c.label}</button>
        ))}
        {instId > 0 && <Badge tone="blue" className="!px-3 !py-1.5">Filtered to one college <Link to="/complaints" className="ml-1 underline">clear</Link></Badge>}
      </div>
      <Card pad={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchBox className="lg:col-span-2" value={q} onChange={setQ} placeholder="Search ID, passport, college or words in the complaint" />
          <Select value={bureau} onChange={(v) => { setBureau(v); setOffset(0) }} placeholder="All bureaus" options={Object.entries(meta.bureaus).map(([value, b]) => ({ value, label: b.name }))} />
          <Select value={category} onChange={(v) => { setCategory(v); setOffset(0) }} placeholder="All issue types" options={Object.entries(meta.categories).map(([value, c]) => ({ value, label: c.label }))} />
          <Select value={priority} onChange={(v) => { setPriority(v); setOffset(0) }} placeholder="Any priority" options={['P0', 'P1', 'P2', 'P3']} />
        </div>
        {error ? <div className="p-4"><ErrorBox error={error} /></div> : !data ? <Spinner /> : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {data.items.map((c) => (
                <li key={c.id} className="cursor-pointer space-y-1.5 p-4 active:bg-brand-50/50" onClick={() => nav(`/complaints/${c.id}`)}>
                  <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-brand">{c.ref_no}</span><PriorityBadge p={c.priority} /><StatusBadge s={c.status} />
                    {c.firewall_flag === 1 && <Badge tone="purple">Held for review</Badge>}{c.campaign_flag === 1 && <Badge tone="amber">Burst</Badge>}</div>
                  <div className="font-medium">{c.category_label}</div>
                  <div className="text-sm text-ink-soft">{c.institution_name}, {c.city}</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-soft"><BureauChip id={c.bureau} /><span>Filed {fmtDate(c.filed_at)}</span>
                    {c.status !== 'Closed' && (c.sla.breached ? <b className="text-red-600">Overdue</b> : c.sla.predicted_breach ? <b className="text-amber-600">At risk</b> : <span>{c.sla.days_left}d left</span>)}
                    {c.max_tier >= 3 && <TierBadge tier={c.max_tier} />}</div>
                </li>
              ))}
              {!data.items.length && <li className="p-8 text-center text-sm text-ink-soft">No complaint matches these filters.</li>}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead><tr><th className="th">Complaint</th><th className="th">College</th><th className="th">Bureau</th><th className="th">Priority</th><th className="th">Status</th><th className="th">Deadline</th><th className="th">Related</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((c) => (
                    <tr key={c.id} className="row-link" onClick={() => nav(`/complaints/${c.id}`)}>
                      <td className="td max-w-xs">
                        <div className="flex items-center gap-2"><span className="font-mono text-xs font-semibold text-brand">{c.ref_no}</span>
                          {c.firewall_flag === 1 && <Badge tone="purple">Held for review</Badge>}{c.campaign_flag === 1 && <Badge tone="amber">Burst</Badge>}</div>
                        <div className="truncate text-sm">{c.category_label}</div>
                        <div className="text-xs text-ink-soft">Filed {fmtDate(c.filed_at)}</div>
                      </td>
                      <td className="td"><div className="max-w-[220px] truncate font-medium">{c.institution_name}</div><div className="text-xs text-ink-soft">{c.city}</div></td>
                      <td className="td"><BureauChip id={c.bureau} /></td>
                      <td className="td"><PriorityBadge p={c.priority} /></td>
                      <td className="td"><StatusBadge s={c.status} /></td>
                      <td className="td text-sm">
                        {c.status === 'Closed' ? <span className="text-ink-faint">-</span> : c.sla.breached ? <span className="font-medium text-red-600">Overdue</span>
                          : c.sla.predicted_breach ? <span className="font-medium text-amber-600">At risk · {Math.max(0, c.sla.days_left)}d left</span>
                            : <span className="text-ink-soft">{c.sla.days_left}d left</span>}
                      </td>
                      <td className="td">{c.max_tier >= 3 ? <TierBadge tier={c.max_tier} /> : <span className="text-xs text-ink-faint">-</span>}</td>
                    </tr>
                  ))}
                  {!data.items.length && <tr><td className="td py-10 text-center text-ink-soft" colSpan={7}>No complaint matches these filters.</td></tr>}
                </tbody>
              </table>
            </div>
            <Pager total={data.total} offset={offset} limit={limit} onChange={setOffset} />
          </>
        )}
      </Card>
    </div>
  )
}
