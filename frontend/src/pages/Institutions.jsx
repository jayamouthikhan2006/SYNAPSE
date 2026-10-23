import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { VolumeX } from 'lucide-react'
import { qs, useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, Card, ErrorBox, Meter, PageHeader, Pager, RiskBadge, SearchBox, Select, Spinner, num } from '../ui'

const TYPES = { CFI: 'Centrally funded', GOVT: 'State government', PVT: 'Private', DEEMED: 'Deemed university' }

export default function Institutions() {
  const { t } = useApp()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState(sp.get('q') || '')
  const [state, setState] = useState('')
  const [type, setType] = useState('')
  const [risk, setRisk] = useState('')
  const [source, setSource] = useState(sp.get('source') || '')
  const [sort, setSort] = useState('risk')
  const [offset, setOffset] = useState(0)
  const [dq, setDq] = useState(q)
  useEffect(() => { const h = setTimeout(() => { setDq(q); setOffset(0) }, 250); return () => clearTimeout(h) }, [q])
  useEffect(() => { setQ(sp.get('q') || '') }, [sp])
  const limit = 25
  const { data, error, loading } = useApi('/institutions' + qs({ q: dq, state, type, risk, source, sort, offset, limit }))
  return (
    <div>
      <PageHeader title={t('Institutions')} hint="One row per college. Open a college to see every complaint and action from every bureau." />
      <Card pad={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-6">
          <SearchBox className="lg:col-span-2" value={q} onChange={setQ} placeholder="Search name, city, abbreviation or AICTE ID" />
          <Select value={state} onChange={(v) => { setState(v); setOffset(0) }} placeholder="All states" options={data?.states || []} />
          <Select value={type} onChange={(v) => { setType(v); setOffset(0) }} placeholder="All types" options={Object.entries(TYPES).map(([value, label]) => ({ value, label }))} />
          <Select value={risk} onChange={(v) => { setRisk(v); setOffset(0) }} placeholder="Any risk" options={['High', 'Medium', 'Low']} />
          <Select value={source} onChange={(v) => { setSource(v); setOffset(0) }} placeholder="All records" options={[{ value: 'demo', label: 'With simulated cases' }, { value: 'registry', label: 'Registry only' }]} />
        </div>
        {error ? <div className="p-4"><ErrorBox error={error} /></div> : !data ? <Spinner /> : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {data.items.map((r) => (
                <li key={r.id} className="cursor-pointer space-y-1.5 p-4 active:bg-brand-50/50" onClick={() => nav(`/institutions/${r.id}`)}>
                  <div className="flex items-start justify-between gap-2"><div className="font-medium leading-snug">{r.name}</div>{r.stats.total ? <RiskBadge level={r.risk_level} score={r.risk} /> : null}</div>
                  <div className="text-xs text-ink-soft">{r.city}, {r.state}{r.parent_name ? ` · ${r.parent_name}` : ''}</div>
                  {r.stats.total ? <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft"><span><b className="text-ink">{r.stats.open}</b> open cases</span><span><b className="text-ink">{r.stats.actions}</b> actions</span>{r.silent && <span className="text-amber-700">Under-reporting</span>}</div>
                    : <div className="text-xs text-ink-faint">Registry entry, no cases</div>}
                </li>
              ))}
              {!data.items.length && <li className="p-8 text-center text-sm text-ink-soft">No college matches these filters.</li>}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full">
                <thead><tr>
                  <th className="th">College</th><th className="th">AICTE ID</th><th className="th">Type</th>
                  <th className="th">Risk</th><th className="th text-right">Open</th><th className="th text-right">Actions</th><th className="th">Grievance health</th>
                </tr></thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((r) => (
                    <tr key={r.id} className="row-link" onClick={() => nav(`/institutions/${r.id}`)}>
                      <td className="td">
                        <div className="flex items-center gap-2 font-medium">{r.name}{r.silent && <span title="Under-reports pending grievances"><VolumeX size={14} className="text-amber-600" /></span>}</div>
                        <div className="text-xs text-ink-soft">{r.city}, {r.state}{r.parent_name ? ` · ${r.parent_name}` : ''}</div>
                      </td>
                      <td className="td font-mono text-xs text-ink-soft">{r.aicte_id}</td>
                      <td className="td"><Badge>{TYPES[r.type]}</Badge></td>
                      <td className="td">{r.stats.total ? <RiskBadge level={r.risk_level} score={r.risk} /> : <span className="text-xs text-ink-faint">No cases</span>}</td>
                      <td className="td text-right tabular-nums">{r.stats.open || '-'}</td>
                      <td className="td text-right tabular-nums">{r.stats.actions || '-'}</td>
                      <td className="td w-40">{r.stats.total ? <Meter value={r.health} tone={r.health >= 70 ? 'green' : r.health >= 40 ? 'amber' : 'red'} /> : <span className="text-xs text-ink-faint">-</span>}</td>
                    </tr>
                  ))}
                  {!data.items.length && <tr><td className="td py-10 text-center text-ink-soft" colSpan={7}>No institution matches these filters.</td></tr>}
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
