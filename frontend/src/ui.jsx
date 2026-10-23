import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Info, Loader2, Search, X } from 'lucide-react'
import { useApp } from './ctx'

export const cx = (...a) => a.filter(Boolean).join(' ')

export const fmtDate = (s, opts = { day: '2-digit', month: 'short', year: 'numeric' }) => {
  if (!s) return '-'
  const d = new Date(s)
  return isNaN(d) ? s : d.toLocaleDateString('en-IN', opts)
}
export const fmtDateTime = (s) => {
  if (!s) return '-'
  const d = new Date(s)
  return isNaN(d) ? s : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
export const ago = (s) => {
  if (!s) return ''
  const m = (Date.now() - new Date(s).getTime()) / 60000
  if (m < 1) return 'just now'
  if (m < 60) return `${Math.floor(m)}m ago`
  if (m < 1440) return `${Math.floor(m / 60)}h ago`
  return `${Math.floor(m / 1440)}d ago`
}
export const num = (n) => (n ?? 0).toLocaleString('en-IN')

// ---------------------------------------------------------------- badges
const TONES = {
  gray: 'bg-slate-100 text-slate-600', blue: 'bg-brand-50 text-brand-700', green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700', orange: 'bg-orange-50 text-orange-700', red: 'bg-red-50 text-red-700',
  redSolid: 'bg-red-600 text-white', purple: 'bg-violet-50 text-violet-700', teal: 'bg-teal-50 text-teal-700',
}
export const Badge = ({ tone = 'gray', children, className, title }) => (
  <span title={title} className={cx('badge', TONES[tone], className)}>{children}</span>
)

export const PRIORITY_TONE = { P0: 'redSolid', P1: 'orange', P2: 'blue', P3: 'gray' }
export const PRIORITY_LABEL = { P0: 'P0 Critical', P1: 'P1 High', P2: 'P2 Normal', P3: 'P3 Low' }
export const PriorityBadge = ({ p }) => <Badge tone={PRIORITY_TONE[p]}>{PRIORITY_LABEL[p] || p}</Badge>

const STATUS_TONE = {
  New: 'blue', 'Under Review': 'purple', 'Awaiting Institution': 'amber', Escalated: 'red', 'Resolved - Pending Confirmation': 'teal',
  Closed: 'green', Reopened: 'orange', proposed: 'blue', under_review: 'purple', draft: 'gray', issued: 'green', withdrawn: 'gray',
  closed: 'green', merged: 'gray', open: 'red', joint_review: 'amber', resolved: 'green', dismissed: 'gray',
}
const STATUS_LABEL = { under_review: 'Under review', joint_review: 'Joint review', 'Resolved - Pending Confirmation': 'Awaiting complainant' }
export const StatusBadge = ({ s }) => (
  <Badge tone={STATUS_TONE[s] || 'gray'}>{STATUS_LABEL[s] || (s ? s.charAt(0).toUpperCase() + s.slice(1) : '-')}</Badge>
)

export const TIER_TONE = { 1: 'gray', 2: 'blue', 3: 'amber', 4: 'orange', 5: 'redSolid' }
export const TierBadge = ({ tier, name }) => (
  <Badge tone={TIER_TONE[tier]} title={`Tier ${tier}`}>{name || ['', 'Same institution only', 'Potentially related', 'Potential duplicate', 'Potential action collision', 'Confirmed conflict'][tier]}</Badge>
)

export const RISK_TONE = { High: 'red', Medium: 'amber', Low: 'green' }
export const RiskBadge = ({ level, score }) => (
  <Badge tone={RISK_TONE[level]}>{level}{score !== undefined ? ` · ${score}` : ''}</Badge>
)

export function BureauChip({ id, full }) {
  const { meta } = useApp()
  const b = meta?.bureaus?.[id]
  if (!b) return <span>{id}</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink">
      <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />
      {full ? b.name : b.short}
    </span>
  )
}

// ---------------------------------------------------------------- layout bits
export const PageHeader = ({ title, hint, children, back }) => (
  <div className="mb-5 flex flex-wrap items-start justify-between gap-3 fade-up">
    <div>
      {back}
      <h1 className="h-page">{title}</h1>
      {hint && <p className="mt-1 max-w-3xl text-sm text-ink-soft">{hint}</p>}
    </div>
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </div>
)

export const Card = ({ title, action, children, className, pad = true, hint }) => (
  <section className={cx('card min-w-0', className)}>
    {(title || action) && (
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-5">
        <div>
          <h2 className="h-sec">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
        </div>
        {action}
      </header>
    )}
    <div className={pad ? 'p-4 sm:p-5' : 'overflow-x-auto'}>{children}</div>
  </section>
)

export const Stat = ({ icon: Icon, label, value, sub, tone = 'blue', to }) => {
  const tones = { blue: 'bg-brand-50 text-brand', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', green: 'bg-emerald-50 text-emerald-600', purple: 'bg-violet-50 text-violet-600' }
  const body = (
    <div className={cx('card flex items-center gap-4 p-4 transition', to && 'hover:shadow-pop hover:-translate-y-0.5')}>
      <div className={cx('grid h-12 w-12 shrink-0 place-items-center rounded-xl', tones[tone])}>{Icon && <Icon size={22} />}</div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-ink-soft">{label}</div>
        <div className="text-[26px] font-semibold leading-tight tracking-tight">{value}</div>
        {sub && <div className="truncate text-xs text-ink-soft">{sub}</div>}
      </div>
    </div>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={cx('relative whitespace-nowrap px-4 py-2.5 text-sm font-medium transition', value === t.id ? 'text-brand' : 'text-ink-soft hover:text-ink')}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-ink-soft">{t.count}</span>}
          {value === t.id && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-brand" />}
        </button>
      ))}
    </div>
  )
}

export const Spinner = ({ label = 'Loading' }) => (
  <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-soft"><Loader2 size={18} className="spin" />{label}...</div>
)

export const ErrorBox = ({ error }) => (
  <div className="card flex items-start gap-3 border-red-200 bg-red-50 p-4 text-sm text-red-700">
    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
    <div><b>Something went wrong.</b> {error?.message}<div className="mt-1 text-xs text-red-600/80">Is the SYNAPSE API running on port 8000?</div></div>
  </div>
)

export const Empty = ({ title = 'Nothing here', hint }) => (
  <div className="py-12 text-center">
    <div className="mx-auto mb-2 grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-ink-faint"><Info size={18} /></div>
    <div className="text-sm font-medium text-ink">{title}</div>
    {hint && <div className="mt-1 text-xs text-ink-soft">{hint}</div>}
  </div>
)

export function Callout({ tone = 'blue', title, children, icon: Icon = Info, className }) {
  const t = { blue: 'border-brand/20 bg-brand-50 text-brand-700', amber: 'border-amber-200 bg-amber-50 text-amber-800', red: 'border-red-200 bg-red-50 text-red-700', green: 'border-emerald-200 bg-emerald-50 text-emerald-800' }
  return (
    <div className={cx('flex gap-3 rounded-xl border p-4 text-sm', t[tone], className)}>
      <Icon size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{title && <div className="font-semibold">{title}</div>}<div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div></div>
    </div>
  )
}

export function SearchBox({ value, onChange, placeholder = 'Search', className }) {
  return (
    <div className={cx('relative', className)}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
      <input className="input pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

export function Select({ value, onChange, options, className, placeholder }) {
  return (
    <select className={cx('input pr-8', className)} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
    </select>
  )
}

export function Pager({ total, offset, limit, onChange }) {
  if (total <= limit) return null
  const page = Math.floor(offset / limit) + 1
  const pages = Math.ceil(total / limit)
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-ink-soft">
      <span>Showing {offset + 1}-{Math.min(offset + limit, total)} of {num(total)}</span>
      <div className="flex items-center gap-2">
        <button className="btn-ghost !py-1" disabled={page <= 1} onClick={() => onChange(offset - limit)}>Previous</button>
        <span>Page {page} / {pages}</span>
        <button className="btn-ghost !py-1" disabled={page >= pages} onClick={() => onChange(offset + limit)}>Next</button>
      </div>
    </div>
  )
}

export function Toast() {
  const { toast } = useApp()
  if (!toast) return null
  const bad = toast.kind === 'error'
  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md fade-up">
      <div className={cx('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-pop', bad ? 'border-red-200 bg-white text-red-700' : 'border-emerald-200 bg-white text-emerald-800')}>
        {bad ? <AlertTriangle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
        <span>{toast.msg}</span>
      </div>
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-navy-950/50 p-4" onClick={onClose}>
      <div className={cx('card w-full p-5 fade-up', width)} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between"><h3 className="h-sec">{title}</h3>
          <button onClick={onClose} className="rounded-md p-1 text-ink-faint hover:bg-slate-100" aria-label="Close"><X size={18} /></button></div>
        {children}
      </div>
    </div>
  )
}

/** Small ECharts wrapper. option is a plain ECharts option object. */
export function Chart({ option, height = 260, onClick }) {
  const ref = useRef(null)
  const inst = useRef(null)
  useEffect(() => {
    let disposed = false
    import('echarts').then((echarts) => {
      if (disposed || !ref.current) return
      inst.current = echarts.getInstanceByDom(ref.current) || echarts.init(ref.current)
      inst.current.setOption(option, true)
      if (onClick) { inst.current.off('click'); inst.current.on('click', onClick) }
    })
    return () => { disposed = true }
  }, [option, onClick])
  useEffect(() => {
    const r = () => inst.current && inst.current.resize()
    window.addEventListener('resize', r)
    return () => { window.removeEventListener('resize', r); inst.current && inst.current.dispose(); inst.current = null }
  }, [])
  return <div ref={ref} style={{ height, width: '100%' }} />
}

export function Meter({ value, tone = 'brand', label }) {
  const col = { brand: 'bg-brand', green: 'bg-emerald-500', red: 'bg-red-500', amber: 'bg-amber-500' }[tone]
  return (
    <div>
      {label && <div className="mb-1 flex justify-between text-xs text-ink-soft"><span>{label}</span><span>{Math.round(value)}%</span></div>}
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={cx('h-full rounded-full transition-all', col)} style={{ width: `${Math.min(100, value)}%` }} /></div>
    </div>
  )
}

export function Confirm({ title, children, onConfirm, onCancel, confirmLabel = 'Confirm', busy }) {
  return (
    <Modal open onClose={onCancel} title={title}>
      <div className="text-sm text-ink-soft">{children}</div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={busy} onClick={onConfirm}>{busy && <Loader2 size={14} className="spin" />}{confirmLabel}</button>
      </div>
    </Modal>
  )
}

export function useAction(notify) {
  const [busy, setBusy] = useState(false)
  const run = async (fn, okMsg) => {
    setBusy(true)
    try { const r = await fn(); if (okMsg) notify(okMsg); return r }
    catch (e) { notify(e.message, 'error'); return null }
    finally { setBusy(false) }
  }
  return [busy, run]
}
