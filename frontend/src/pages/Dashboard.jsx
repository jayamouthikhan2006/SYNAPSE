import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Building2, Clock, FileWarning, MessageSquareWarning, ShieldAlert, ShieldCheck, Swords, VolumeX } from 'lucide-react'
import { useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, Card, Chart, ErrorBox, PageHeader, RiskBadge, Select, Spinner, Stat, StatusBadge, ago, num } from '../ui'

function Attention({ to, icon: Icon, n, title, text, tone }) {
  const tones = { red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', purple: 'bg-violet-50 text-violet-600', blue: 'bg-brand-50 text-brand' }
  return (
    <Link to={to} className="card group flex items-start gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-pop">
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${tones[tone]}`}><Icon size={19} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2"><span className="shrink-0 whitespace-nowrap text-2xl font-semibold leading-tight">{n}</span><span className="text-sm font-medium">{title}</span></div>
        <div className="mt-0.5 text-xs text-ink-soft">{text}</div>
      </div>
      <ArrowRight size={16} className="mt-1 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-brand" />
    </Link>
  )
}

export default function Dashboard() {
  const { meta, role, t } = useApp()
  const nav = useNavigate()
  const [period, setPeriod] = useState('year')
  const { data, error, loading } = useApi(`/dashboard?period=${period}`, [])
  const bureauOpt = useMemo(() => {
    if (!data) return {}
    return {
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      series: [{ type: 'pie', radius: ['58%', '82%'], avoidLabelOverlap: true, label: { show: false }, itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 4 },
        data: data.by_bureau.map((b) => ({ name: b.name, value: b.count, itemStyle: { color: b.color } })) }],
      graphic: [{ type: 'text', left: 'center', top: '42%', style: { text: num(data.by_bureau.reduce((a, b) => a + b.count, 0)), fontSize: 26, fontWeight: 700, fill: '#1e2a44', textAlign: 'center' } },
        { type: 'text', left: 'center', top: '56%', style: { text: 'Total', fontSize: 12, fill: '#8a97b2', textAlign: 'center' } }],
    }
  }, [data])
  const trendOpt = useMemo(() => {
    if (!data) return {}
    return {
      tooltip: { trigger: 'axis' }, legend: { top: 0, right: 0, textStyle: { color: '#5b6b8c' }, icon: 'circle' },
      grid: { left: 36, right: 12, top: 34, bottom: 24 },
      xAxis: { type: 'category', data: data.trend.map((x) => x.month), axisLine: { lineStyle: { color: '#e6eaf2' } }, axisLabel: { color: '#8a97b2' } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#eef1f6' } }, axisLabel: { color: '#8a97b2' } },
      series: [
        { name: 'Complaints', type: 'line', smooth: true, symbolSize: 7, data: data.trend.map((x) => x.complaints), itemStyle: { color: '#2f5bea' }, areaStyle: { color: 'rgba(47,91,234,.10)' } },
        { name: 'Enforcement actions', type: 'line', smooth: true, symbolSize: 7, data: data.trend.map((x) => x.actions), itemStyle: { color: '#7c3aed' } },
      ],
    }
  }, [data])
  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  const k = data.kpis
  const roleName = meta.roles[role]
  return (
    <div>
      <PageHeader title={`${t('Welcome')}, ${roleName}`} hint="All bureaus' complaints and actions, grouped by college. Start with what needs attention.">
        <div className="text-right text-xs text-ink-soft">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
      </PageHeader>

      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">{t('Needs your attention')}</div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Attention to="/alerts" icon={ShieldAlert} tone="red" n={k.open_alerts} title="clashing actions" text="Two bureaus are about to act on one college in conflicting ways." />
        <Attention to="/complaints?flag=overdue" icon={Clock} tone="amber" n={k.sla_predicted} title="likely to miss deadline" text={`${k.sla_breached} are already overdue. ${k.ping_pong} bounced between bureaus 3+ times.`} />
        <Attention to="/complaints?flag=quarantined" icon={FileWarning} tone="purple" n={k.quarantined} title="held for review" text="Complaints that tried to give the AI instructions. Officers check them." />
        <Attention to="/analytics" icon={VolumeX} tone="blue" n={k.silence_anomalies} title="colleges under-reporting" text="They report almost no pending complaints, but our intake shows many." />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Building2} label={t('Total institutions')} value={num(k.institutions)} sub={`${k.institutions_with_cases} have open matters`} to="/institutions" />
        <Stat icon={MessageSquareWarning} tone="red" label={t('Open complaints')} value={num(k.open_complaints)} sub={`${k.complaints_change_pct >= 0 ? '+' : ''}${k.complaints_change_pct}% filed vs previous 30 days`} to="/complaints?flag=open" />
        <Stat icon={Swords} tone="purple" label={t('Active enforcement actions')} value={num(k.active_actions)} sub={`Across ${k.bureaus_with_actions} bureaus`} to="/actions" />
        <Stat icon={ShieldCheck} tone="green" label="Closed with complainant's OK" value={`${k.resolution_confirmed_pct}%`} sub="Resolution Assurance" to="/analytics" />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-2" title={t('Complaints by bureau')} action={<Select className="!w-36 !py-1 text-xs" value={period} onChange={setPeriod} options={[{ value: 'month', label: 'Last 30 days' }, { value: 'quarter', label: 'Last 90 days' }, { value: 'year', label: 'Last 12 months' }, { value: 'all', label: 'All time' }]} />}>
          <div className="flex items-center gap-4">
            <div className="w-1/2"><Chart option={bureauOpt} height={210} /></div>
            <ul className="flex-1 space-y-2 text-sm">
              {data.by_bureau.map((b) => (
                <li key={b.bureau} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} />{b.name}</span>
                  <span className="font-medium tabular-nums">{num(b.count)}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
        <Card className="lg:col-span-3" title={t('Monthly trend')} hint="New complaints and new enforcement actions each month">
          <Chart option={trendOpt} height={230} />
        </Card>
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title={t('Institutions to watch')} hint="Ranked by open cases, SLA breaches, collisions, systemic incidents and parent-trust heat" pad={false}
          action={<Link className="text-sm font-medium text-brand" to="/institutions">{t('View all')}</Link>}>
          <table className="mt-3 w-full">
            <thead><tr><th className="th">College</th><th className="th">Risk</th><th className="th text-right">Open cases</th><th className="th text-right">Collisions</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data.risky.map((r) => (
                <tr key={r.id} className="row-link" onClick={() => nav(`/institutions/${r.id}`)}>
                  <td className="td"><div className="font-medium">{r.name}</div><div className="text-xs text-ink-soft">{r.city}</div></td>
                  <td className="td"><RiskBadge level={r.level} score={r.risk} /></td>
                  <td className="td text-right tabular-nums">{r.open}</td>
                  <td className="td text-right tabular-nums">{r.alerts || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card className="lg:col-span-2" title={t('Recent ACE alerts')} hint="Detected before either action was executed" action={<Link className="text-sm font-medium text-brand" to="/alerts">{t('View all')}</Link>}>
          <ul className="space-y-3">
            {data.recent_alerts.map((a) => (
              <li key={a.id}>
                <Link to={`/alerts/${a.id}`} className="flex items-start gap-3 rounded-lg p-2 -m-2 hover:bg-slate-50">
                  <div className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${a.severity === 'hard' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}><ShieldAlert size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.institution_name}</div>
                    <div className="text-xs text-ink-soft">{a.alert_no} · rule {a.rule_id} · {ago(a.created_at)}</div>
                  </div>
                  <StatusBadge s={a.status} />
                </Link>
              </li>
            ))}
            {!data.recent_alerts.length && <li className="py-6 text-center text-sm text-ink-soft">No open collisions. All clear.</li>}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3" title="Where complaints come from" hint="Nine intake channels feed one system">
          <div className="space-y-2.5">
            {data.channels.map((c) => {
              const max = data.channels[0].count
              return (
                <div key={c.channel} className="flex items-center gap-3 text-sm">
                  <div className="w-52 shrink-0 truncate text-ink-soft">{c.label}</div>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand/80" style={{ width: `${(c.count / max) * 100}%` }} /></div>
                  <div className="w-10 text-right tabular-nums">{c.count}</div>
                </div>
              )
            })}
          </div>
        </Card>
        <Card className="lg:col-span-2" title="Audit ledger" hint="Every action is written to a tamper-evident chain">
          <div className="flex items-center gap-3">
            <div className={`grid h-11 w-11 place-items-center rounded-xl ${data.ledger.ok ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}><ShieldCheck size={22} /></div>
            <div>
              <div className="font-semibold">{data.ledger.ok ? 'Chain intact' : 'Tampering detected'}</div>
              <div className="text-xs text-ink-soft">{num(data.ledger.checked)} records verified</div>
            </div>
            <Link to="/ledger" className="btn-ghost ml-auto">Open ledger</Link>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-semibold">{k.incidents}</div><div className="text-ink-soft">systemic incidents</div></div>
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-semibold">{k.campaigns}</div><div className="text-ink-soft">fake-burst campaigns</div></div>
            <div className="rounded-lg bg-slate-50 p-2"><div className="text-lg font-semibold">{k.rooms_open}</div><div className="text-ink-soft">open joint rooms</div></div>
          </div>
        </Card>
      </div>
    </div>
  )
}
