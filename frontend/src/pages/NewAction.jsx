import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Loader2, ShieldAlert } from 'lucide-react'
import { api, useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, BureauChip, Callout, Card, PageHeader, Select, StatusBadge, TierBadge, cx, fmtDate } from '../ui'

const SUBJECTS = ['fee', 'documents', 'approval', 'faculty', 'infrastructure', 'finance', 'ragging', 'admission', 'advertising', 'general']

export default function NewAction() {
  const { meta, role, notify } = useApp()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { data: insts } = useApi('/institutions?source=demo&limit=100&sort=name')
  const [step, setStep] = useState(1)
  const [f, setF] = useState({ institution_id: sp.get('institution_id') || '', bureau: role === 'ADMIN' ? 'RB' : role, type: 'show_cause', subject: 'fee', summary: '',
    proposed_date: new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), complaint_ids: sp.get('complaint_id') ? [Number(sp.get('complaint_id'))] : [] })
  const [check, setCheck] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  useEffect(() => { if (role !== 'ADMIN') setF((x) => ({ ...x, bureau: role })) }, [role])
  const set = (k, v) => { setF((x) => ({ ...x, [k]: v })); setCheck(null) }
  const inst = insts?.items.find((i) => String(i.id) === String(f.institution_id))
  const valid = f.institution_id && f.type && f.bureau

  const runCheck = async () => {
    setBusy(true)
    try { setCheck(await api.post('/actions/check', { ...f, institution_id: Number(f.institution_id) })); setStep(2) }
    catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }
  const submit = async () => {
    setBusy(true)
    try {
      const r = await api.post('/actions', { ...f, institution_id: Number(f.institution_id), summary: f.summary || `${meta.action_types[f.type]} for ${inst?.name}` })
      setDone(r); setStep(4)
    } catch (e) { notify(e.message, 'error') } finally { setBusy(false) }
  }
  const steps = ['Action details', 'ACE check', 'Review and submit']
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<Link to="/actions" className="mb-2 inline-flex items-center gap-1 text-sm text-ink-soft hover:text-brand"><ArrowLeft size={14} /> Back to actions</Link>}
        title="Create enforcement action" hint="Fill the details. SYNAPSE then compares your plan with what every other bureau has planned for this college, before anything is sent." />
      <ol className="mb-5 flex items-center gap-3">
        {steps.map((s, k) => (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold', step > k + 1 || step === 4 ? 'bg-emerald-500 text-white' : step === k + 1 ? 'bg-brand text-white' : 'bg-slate-200 text-ink-soft')}>{step > k + 1 || step === 4 ? <Check size={14} /> : k + 1}</span>
            <span className={cx('text-sm font-medium', step === k + 1 ? 'text-ink' : 'text-ink-soft')}>{s}</span>
            {k < 2 && <span className="h-px flex-1 bg-line" />}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className="lbl">College</label>
              <Select className="mt-1" value={f.institution_id} onChange={(v) => set('institution_id', v)} placeholder="Choose a college" options={(insts?.items || []).map((i) => ({ value: i.id, label: `${i.name} (${i.city})` }))} /></div>
            <div><label className="lbl">Your bureau</label>
              <Select className="mt-1" value={f.bureau} onChange={(v) => set('bureau', v)} options={Object.entries(meta.bureaus).map(([value, b]) => ({ value, label: b.name }))} />
              {role !== 'ADMIN' && <p className="mt-1 text-xs text-ink-soft">Fixed to the role you are viewing as.</p>}</div>
            <div><label className="lbl">Action type</label>
              <Select className="mt-1" value={f.type} onChange={(v) => set('type', v)} options={Object.entries(meta.action_types).map(([value, label]) => ({ value, label }))} /></div>
            <div><label className="lbl">What is it about?</label>
              <Select className="mt-1" value={f.subject} onChange={(v) => set('subject', v)} options={SUBJECTS} /></div>
            <div><label className="lbl">Proposed date</label><input type="date" className="input mt-1" value={f.proposed_date} onChange={(e) => set('proposed_date', e.target.value)} /></div>
            <div className="sm:col-span-2"><label className="lbl">Summary</label>
              <textarea className="input mt-1 min-h-20" value={f.summary} onChange={(e) => set('summary', e.target.value)} placeholder="Describe the action in a line or two (optional)" /></div>
          </div>
          <div className="mt-5 flex justify-end"><button className="btn-primary" disabled={!valid || busy} onClick={runCheck}>{busy && <Loader2 size={15} className="spin" />}Run ACE check</button></div>
        </Card>
      )}

      {step === 2 && check && (
        <div className="space-y-4">
          {check.ok ? (
            <Callout tone="green" icon={CheckCircle2} title="No conflict found">No other bureau has a pending action on {inst?.name} that contradicts this one. {check.rules_checked} rules checked.</Callout>
          ) : (
            <Callout tone="red" icon={ShieldAlert} title="Potential conflict found">{check.verdict} Please review before proceeding.</Callout>
          )}
          {check.collisions.map((h) => (
            <Card key={h.rule_id + h.other_action.id}>
              <div className="mb-2 flex flex-wrap items-center gap-2"><TierBadge tier={h.tier} /><Badge>Rule {h.rule_id}</Badge><Badge tone={h.severity === 'hard' ? 'red' : 'amber'}>{h.severity === 'hard' ? 'Cannot both stand' : 'Overlap'}</Badge></div>
              <p className="text-sm">{h.why}</p>
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
                <div className="lbl mb-1">The other action</div>
                <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold">{h.other_action.ref_no}</span><BureauChip id={h.other_action.bureau} full /><StatusBadge s={h.other_action.status} /></div>
                <div className="mt-1 text-ink-soft">{meta.action_types[h.other_action.type]} · proposed {fmtDate(h.other_action.proposed_date)}</div>
              </div>
              <div className="mt-2 text-xs text-ink-soft">Basis: {h.ref}</div>
            </Card>
          ))}
          <div className="flex justify-between"><button className="btn-ghost" onClick={() => setStep(1)}>Back and edit</button><button className="btn-primary" onClick={() => setStep(3)}>Continue</button></div>
        </div>
      )}

      {step === 3 && (
        <Card title="Review">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="lbl">College</dt><dd className="font-medium">{inst?.name}</dd></div><div><dt className="lbl">Bureau</dt><dd><BureauChip id={f.bureau} full /></dd></div>
            <div><dt className="lbl">Action</dt><dd className="font-medium">{meta.action_types[f.type]}</dd></div><div><dt className="lbl">Proposed date</dt><dd>{fmtDate(f.proposed_date)}</dd></div>
            <div className="sm:col-span-2"><dt className="lbl">Summary</dt><dd>{f.summary || '(auto-filled)'}</dd></div>
          </dl>
          {!check?.ok && <Callout tone="amber" icon={AlertTriangle} className="mt-4" title="This will raise an ACE alert">Submitting opens a Potential Action Collision. Both bureaus will be asked for a joint review before either action can be issued.</Callout>}
          <div className="mt-5 flex justify-between"><button className="btn-ghost" onClick={() => setStep(2)}>Back</button><button className="btn-primary" disabled={busy} onClick={submit}>{busy && <Loader2 size={15} className="spin" />}Submit action</button></div>
        </Card>
      )}

      {step === 4 && done && (
        <Card>
          <div className="text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-600"><CheckCircle2 size={28} /></div>
            <div className="h-sec">Action {done.action.ref_no} submitted</div>
            {done.alerts.length ? <p className="mt-1 text-sm text-ink-soft">ACE raised {done.alerts.length} alert(s). Neither action can be issued until the joint review is done.</p> : <p className="mt-1 text-sm text-ink-soft">No conflicts. The action is recorded in the audit ledger.</p>}
            <div className="mt-5 flex justify-center gap-2">
              {done.alerts[0] && <button className="btn-primary" onClick={() => nav(`/alerts/${done.alerts[0].id}`)}>Open the ACE alert</button>}
              <button className="btn-ghost" onClick={() => nav(`/institutions/${f.institution_id}`)}>Back to college</button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
