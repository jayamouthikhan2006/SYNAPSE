import { useEffect, useRef, useState } from 'react'
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { Activity, BarChart3, Bell, Building2, FileSearch, FilePlus2, Gauge, Layers, Menu, MessageSquareWarning, PlayCircle, Clapperboard, ScrollText, Search, ShieldAlert, Swords, Users2, X } from 'lucide-react'
import { useApp } from './ctx'
import { useApi } from './api'
import { Spinner, Toast, cx } from './ui'
import Dashboard from './pages/Dashboard'
import Institutions from './pages/Institutions'
import Institution360 from './pages/Institution360'
import Complaints from './pages/Complaints'
import ComplaintDetail from './pages/ComplaintDetail'
import Actions from './pages/Actions'
import NewAction from './pages/NewAction'
import Alerts from './pages/Alerts'
import AlertDetail from './pages/AlertDetail'
import Rooms from './pages/Rooms'
import RoomDetail from './pages/RoomDetail'
import Incidents from './pages/Incidents'
import Analytics from './pages/Analytics'
import FileComplaint from './pages/FileComplaint'
import Track from './pages/Track'
import Ledger from './pages/Ledger'
import DemoGuide from './pages/DemoGuide'
import Film from './pages/Film'

const NAV = [
  { group: 'Overview', items: [{ to: '/', label: 'Dashboard', icon: Gauge, end: true }] },
  { group: 'Cases', items: [
    { to: '/institutions', label: 'Institutions', icon: Building2 },
    { to: '/complaints', label: 'Complaints', icon: MessageSquareWarning },
    { to: '/actions', label: 'Enforcement Actions', icon: Swords },
    { to: '/alerts', label: 'ACE Alerts', icon: ShieldAlert, badge: 'alerts' },
    { to: '/rooms', label: 'Coordination Rooms', icon: Users2, badge: 'rooms' },
    { to: '/incidents', label: 'Issue Threads', icon: Layers },
  ] },
  { group: 'Insights', items: [{ to: '/analytics', label: 'Reports & Analytics', icon: BarChart3 }] },
  { group: 'Citizen side', items: [
    { to: '/file', label: 'File a Complaint', icon: FilePlus2 },
    { to: '/track', label: 'Track Complaint', icon: FileSearch },
  ] },
  { group: 'Trust', items: [
    { to: '/ledger', label: 'Audit Ledger', icon: ScrollText },
    { to: '/film', label: 'Watch the Film', icon: Clapperboard },
    { to: '/demo', label: 'Demo Guide', icon: PlayCircle },
  ] },
]

function Logo() {
  return (
    <div className="flex items-center gap-3 px-2">
      <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand shadow-lg shadow-brand/30">
        <svg width="24" height="24" viewBox="0 0 32 32" fill="none"><circle cx="16" cy="16" r="4" fill="#fff" /><circle cx="7" cy="9" r="2.4" fill="#fff" /><circle cx="25" cy="9" r="2.4" fill="#fff" /><circle cx="16" cy="26" r="2.4" fill="#fff" /><path d="M8.7 10.6L13 14M23.3 10.6L19 14M16 20v4" stroke="#fff" strokeWidth="1.7" /></svg>
      </div>
      <div className="leading-tight">
        <div className="text-[17px] font-bold tracking-wide text-white">SYNAPSE</div>
        <div className="text-[10.5px] text-slate-400">AICTE Institutional Accountability</div>
      </div>
    </div>
  )
}

function SidebarContent({ counts, onNavigate }) {
  const { t, meta, role, setRole, lang, setLang } = useApp()
  return (
    <>
      <Logo />
      <div className="px-2 lg:hidden">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{t('Viewing as')}</div>
        <select className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white focus:outline-none" value={role} onChange={(e) => setRole(e.target.value)}>
          {meta && Object.entries(meta.roles).map(([k, v]) => <option key={k} value={k} className="text-ink">{v}</option>)}
        </select>
        <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="mt-2 w-full rounded-lg border border-white/10 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/5">{lang === 'en' ? 'भाषा: हिन्दी में देखें' : 'Language: view in English'}</button>
      </div>
      <nav className="flex flex-col gap-4">
        {NAV.map((g) => (
          <div key={g.group}>
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{g.group}</div>
            <div className="flex flex-col gap-0.5">
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} end={it.end} onClick={onNavigate} className={({ isActive }) => cx('nav-item', isActive && 'active')}>
                  <it.icon size={17} />
                  <span className="flex-1">{t(it.label)}</span>
                  {it.badge && counts?.[it.badge] > 0 && <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{counts[it.badge]}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="mt-auto rounded-xl bg-white/5 p-3 text-[11px] leading-relaxed text-slate-400">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-slate-200"><Activity size={13} /> Prototype data</div>
        College names come from a public registry. Cases are simulated from published AICTE and UGC grievance categories.
      </div>
    </>
  )
}

function Sidebar({ counts }) {
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-5 overflow-y-auto bg-gradient-to-b from-navy-900 to-navy-950 px-3 py-5 lg:flex">
      <SidebarContent counts={counts} />
    </aside>
  )
}

function Drawer({ open, onClose, counts }) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return (
    <div className={cx('fixed inset-0 z-50 lg:hidden', open ? '' : 'pointer-events-none')} aria-hidden={!open}>
      <div className={cx('absolute inset-0 bg-navy-950/60 transition-opacity', open ? 'opacity-100' : 'opacity-0')} onClick={onClose} />
      <aside className={cx('absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-5 overflow-y-auto bg-gradient-to-b from-navy-900 to-navy-950 px-3 py-5 transition-transform duration-200', open ? 'translate-x-0' : '-translate-x-full')}>
        <button onClick={onClose} className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 hover:bg-white/10" aria-label="Close menu"><X size={18} /></button>
        <SidebarContent counts={counts} onNavigate={onClose} />
      </aside>
    </div>
  )
}

function Topbar({ counts, onMenu }) {
  const { meta, role, setRole, lang, setLang, t } = useApp()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const go = (e) => {
    e.preventDefault()
    const v = q.trim()
    if (!v) return
    if (/^(c-|syn-)/i.test(v)) nav(`/complaints?q=${encodeURIComponent(v)}`)
    else nav(`/institutions?q=${encodeURIComponent(v)}`)
    setQ('')
  }
  return (
    <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-white/90 px-3 py-3 backdrop-blur sm:gap-3 sm:px-5">
      <button onClick={onMenu} className="rounded-lg p-2 text-ink hover:bg-slate-100 lg:hidden" aria-label="Open menu"><Menu size={20} /></button>
      <form onSubmit={go} className="relative min-w-0 max-w-md flex-1">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <input className="input bg-slate-50 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`${t('Search')} college or complaint ID`} />
      </form>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-3">
        <button onClick={() => setLang(lang === 'en' ? 'hi' : 'en')} className="btn-ghost hidden !px-2.5 !py-1.5 text-xs sm:inline-flex" title="Switch language (GIGW bilingual)">{lang === 'en' ? 'EN | हिं' : 'हिं | EN'}</button>
        <NavLink to="/alerts" className="relative rounded-lg p-2 text-ink-soft hover:bg-slate-100" title="Open ACE alerts">
          <Bell size={18} />
          {counts?.alerts > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">{counts.alerts}</span>}
        </NavLink>
        <div className="hidden items-center gap-2 border-l border-line pl-3 md:flex">
          <div className="text-right leading-tight">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint">{t('Viewing as')}</div>
            <select className="cursor-pointer bg-transparent text-sm font-semibold text-ink focus:outline-none" value={role} onChange={(e) => setRole(e.target.value)}>
              {meta && Object.entries(meta.roles).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
      </div>
    </header>
  )
}

export default function App() {
  const { meta } = useApp()
  const loc = useLocation()
  const [menu, setMenu] = useState(false)
  const scroller = useRef(null)
  const { data: counts } = useApi('/counts', [loc.pathname])
  useEffect(() => { scroller.current && scroller.current.scrollTo(0, 0); setMenu(false) }, [loc.pathname])
  if (meta === null) return <div className="grid h-full place-items-center"><Spinner label="Starting SYNAPSE" /></div>
  if (meta === false) return (
    <div className="grid h-full place-items-center p-6">
      <div className="card max-w-md p-6 text-center"><div className="h-sec">Cannot reach the SYNAPSE API</div>
        <p className="mt-2 text-sm text-ink-soft">Start the backend first:</p>
        <pre className="mt-2 rounded-lg bg-slate-900 p-3 text-left text-xs text-slate-100">cd backend{'\n'}python -m uvicorn app.main:app --port 8000</pre>
        <button className="btn-primary mt-4" onClick={() => location.reload()}>Try again</button></div>
    </div>
  )
  return (
    <div className="flex h-full">
      <Sidebar counts={counts} />
      <Drawer open={menu} onClose={() => setMenu(false)} counts={counts} />
      <div ref={scroller} className="flex min-w-0 flex-1 flex-col overflow-y-auto" key={loc.pathname.split('/')[1]}>
        <Topbar counts={counts} onMenu={() => setMenu(true)} />
        <main className="mx-auto w-full max-w-[1280px] flex-1 px-3 py-5 sm:px-5 sm:py-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/institutions" element={<Institutions />} />
            <Route path="/institutions/:id" element={<Institution360 />} />
            <Route path="/complaints" element={<Complaints />} />
            <Route path="/complaints/:id" element={<ComplaintDetail />} />
            <Route path="/actions" element={<Actions />} />
            <Route path="/actions/new" element={<NewAction />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/alerts/:id" element={<AlertDetail />} />
            <Route path="/rooms" element={<Rooms />} />
            <Route path="/rooms/:id" element={<RoomDetail />} />
            <Route path="/incidents" element={<Incidents />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/file" element={<FileComplaint />} />
            <Route path="/track" element={<Track />} />
            <Route path="/track/:pid" element={<Track />} />
            <Route path="/ledger" element={<Ledger />} />
            <Route path="/film" element={<Film />} />
            <Route path="/demo" element={<DemoGuide />} />
            <Route path="*" element={<div className="py-20 text-center text-ink-soft">Page not found</div>} />
          </Routes>
        </main>
      </div>
      <Toast />
    </div>
  )
}
