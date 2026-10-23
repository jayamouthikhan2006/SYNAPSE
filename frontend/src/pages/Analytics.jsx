import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Network, Repeat, ShieldAlert, VolumeX } from 'lucide-react'
import { qs, useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, Callout, Card, Chart, ErrorBox, Meter, PageHeader, RiskBadge, Select, Spinner, Stat } from '../ui'

export default function Analytics() {
  const { t } = useApp()
  const nav = useNavigate()
  const [state, setState] = useState('')
  const [type, setType] = useState('')
  const { data, error } = useApi('/analytics' + qs({ state, type }))
  const catOpt = useMemo(() => data && {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' }, legend: { show: false },
    color: ['#2f5bea', '#7c3aed', '#0d9488', '#d97706', '#dc2626', '#64748b', '#0891b2', '#be185d', '#65a30d', '#9333ea', '#ea580c', '#475569'],
    series: [{ type: 'pie', radius: ['55%', '80%'], label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 4 }, data: data.categories.map((c) => ({ name: c.label, value: c.count })) }],
  }, [data])
  const volOpt = useMemo(() => data && {
    grid: { left: 8, right: 30, top: 4, bottom: 4, containLabel: true }, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef1f6' } }, axisLabel: { color: '#8a97b2' } },
    yAxis: { type: 'category', inverse: true, data: data.top_volume.map((r) => r.name), axisLabel: { color: '#1e2a44', width: 180, overflow: 'truncate' }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{ name: 'All complaints', type: 'bar', barWidth: 14, data: data.top_volume.map((r) => r.total), itemStyle: { color: '#bfd0ff', borderRadius: 4 } },
      { name: 'Still open', type: 'bar', barWidth: 14, data: data.top_volume.map((r) => r.open), itemStyle: { color: '#2f5bea', borderRadius: 4 } }],
    legend: { top: 0, right: 0, icon: 'circle', textStyle: { color: '#5b6b8c' } },
  }, [data])
  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  const k = data.kpis
  return (
    <div>
      <PageHeader title={t('Reports & Analytics')} hint="Patterns across colleges: repeat offenders, trusts running several risky colleges, and colleges not reporting honestly.">
        <Select className="!w-44" value={state} onChange={setState} placeholder="All states" options={data.states} />
        <Select className="!w-44" value={type} onChange={setType} placeholder="All types" options={[{ value: 'PVT', label: 'Private' }, { value: 'GOVT', label: 'State government' }, { value: 'DEEMED', label: 'Deemed' }, { value: 'CFI', label: 'Centrally funded' }]} />
      </PageHeader>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Building2} tone="red" label="High-risk institutions" value={k.high_risk} sub="Risk score 55 or more" />
        <Stat icon={ShieldAlert} tone="amber" label="With 2+ active actions" value={k.multi_action} sub="Several bureaus acting at once" />
        <Stat icon={Network} tone="purple" label="Parent trusts to watch" value={k.trusts_watch} sub="Risky college under a multi-college trust" />
        <Stat icon={Repeat} tone="blue" label="Repeat complainants" value={k.repeat_complainants} sub="Filed more than once" />
      </div>
      <div className="mb-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Top colleges by complaint volume"><Chart option={volOpt} height={340} onClick={undefined} /></Card>
        <Card className="lg:col-span-2" title="Complaint categories">
          <Chart option={catOpt} height={170} />
          <ul className="mt-2 grid grid-cols-1 gap-1 text-sm">
            {data.categories.slice(0, 7).map((c) => <li key={c.category} className="flex justify-between"><span className="text-ink-soft">{c.label}</span><b className="tabular-nums">{c.pct}%</b></li>)}
          </ul>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Card title="Trusts with risky colleges" hint="Repeat violators across colleges under the same management are invisible to complaint-centric systems">
          <div className="space-y-3">
            {data.watch.map((w) => (
              <div key={w.trust} className="rounded-xl border border-line p-3">
                <div className="flex items-center justify-between"><div className="font-medium">{w.trust}</div><Badge tone="red">{w.high} high-risk</Badge></div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {w.colleges.map((c) => <button key={c.id} onClick={() => nav(`/institutions/${c.id}`)} className="rounded-md bg-slate-50 px-2 py-1 text-xs hover:bg-brand-50"><span className={c.level === 'High' ? 'text-red-600' : c.level === 'Medium' ? 'text-amber-600' : 'text-emerald-600'}>●</span> {c.name}</button>)}
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Silence anomaly detector" hint="Colleges reporting almost no pending complaints, against what AICTE's own intake shows">
          {data.silence.length ? (
            <div className="space-y-3">
              {data.silence.map((s) => (
                <button key={s.institution_id} onClick={() => nav(`/institutions/${s.institution_id}`)} className="block w-full rounded-xl border border-amber-200 bg-amber-50/50 p-3 text-left hover:shadow-card">
                  <div className="flex items-center gap-2 font-medium"><VolumeX size={16} className="text-amber-600" />{s.name}</div>
                  <div className="mt-1 text-sm text-ink-soft">{s.message}</div>
                  <div className="mt-2 flex gap-4 text-xs"><span>Reported <b>{s.self_reported}</b></span><span>Observed (90 days) <b>{s.observed_90d}</b></span><span>Peer median <b>{s.peer_median}</b></span></div>
                </button>
              ))}
            </div>
          ) : <Callout tone="green" title="No under-reporting detected">Reported figures match the intake data.</Callout>}
        </Card>
      </div>

      <Card title="Institutional risk table" hint="Top 15 colleges by composite risk score" pad={false}>
        <div className="overflow-x-auto"><table className="mt-3 w-full">
          <thead><tr><th className="th">College</th><th className="th">Risk</th><th className="th text-right">Open</th><th className="th text-right">Collisions</th><th className="th w-48">Grievance health</th></tr></thead>
          <tbody className="divide-y divide-line">
            {data.risk_table.map((r) => (
              <tr key={r.id} className="row-link" onClick={() => nav(`/institutions/${r.id}`)}>
                <td className="td"><div className="font-medium">{r.name}</div><div className="text-xs text-ink-soft">{r.city}, {r.state}</div></td>
                <td className="td"><RiskBadge level={r.level} score={r.risk} /></td><td className="td text-right tabular-nums">{r.open}</td><td className="td text-right tabular-nums">{r.alerts || '-'}</td>
                <td className="td"><Meter value={r.ghi} tone={r.ghi >= 70 ? 'green' : r.ghi >= 40 ? 'amber' : 'red'} label={undefined} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </div>
  )
}
