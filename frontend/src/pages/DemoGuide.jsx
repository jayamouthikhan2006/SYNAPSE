import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react'
import { api, useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, Callout, Card, PageHeader, Spinner } from '../ui'

export default function DemoGuide() {
  const { t, meta, notify } = useApp()
  const nav = useNavigate()
  const { data: traps } = useApi('/demo/traps')
  const openCase = async () => {
    try { const r = await api.get('/complaints?q=C-2026-08765'); nav(`/complaints/${r.items[0].id}`) } catch (e) { notify(e.message, 'error') }
  }
  const steps = [
    { n: 1, title: 'A Tamil voice note with a misspelt college name', text: 'The college is found even though the name was spelt as it sounds, in Tamil letters. A regional-language gist is made and the case is routed.', to: '/file', cta: 'Open "File a complaint" and pick the Tamil example' },
    { n: 2, title: 'One college, three bureaus, nobody aware', text: 'The excess-fee case C-2026-08765 sits in PGRC. Open its AI analysis tab: it is a near-duplicate of a PGRC case, related to a Regulation case, and tied to a Vigilance case by a colliding action.', onClick: openCase, cta: 'Open case C-2026-08765' },
    { n: 3, title: 'Two bureaus about to contradict each other', text: 'Regulation wants a show cause notice and Vigilance wants a penalty on the same fee issue. ACE flagged it before either went out. Request a joint review, acknowledge as both bureaus, draft the single notice, resolve.', to: '/alerts', cta: 'Open the ACE alerts' },
    { n: 4, title: 'Try to cause a collision yourself', text: 'Start a new action for ABC Institute of Technology: Regulation Bureau, Show Cause Notice, subject fee. Run the ACE check and see the conflict named with its rule.', to: '/actions/new?institution_id=131', cta: 'Create an action' },
    { n: 5, title: 'A hidden instruction in a complaint', text: 'Six complaints tried to tell the AI to close cases or approve colleges. They are held by the LLM Firewall, readable by officers, and had no effect.', to: '/complaints?flag=quarantined', cta: 'See held complaints' },
    { n: 6, title: 'Reasonless closure is refused', text: 'Open any open case, go to Actions, and try closing with no reason, then with a reason but no complainant confirmation. Both are refused. Use the voice-callback buttons to close or reopen.', to: '/complaints?flag=open', cta: 'Pick an open case' },
    { n: 7, title: '50 complaints, one incident', text: 'Fee complaints at ABC arrive in different words through different channels. Clustering groups them into one systemic incident with a corroboration score. A burst of 24 identical complaints from 3 identities is separated as a fake-complaint campaign.', to: '/incidents', cta: 'Open issue threads' },
    { n: 8, title: 'A college that says it has no complaints', text: 'Three colleges report almost zero pending grievances while the intake channels show dozens.', to: '/analytics', cta: 'Open analytics' },
    { n: 9, title: 'A tampered ledger row is caught', text: 'Edit an old audit record behind the application and watch the integrity check fail at exactly that row.', to: '/ledger', cta: 'Open the audit ledger' },
  ]
  return (
    <div>
      <PageHeader title={t('Demo Guide')} hint="Nine steps showing what SYNAPSE does. Each one opens the right screen." />
      <Callout tone="blue" className="mb-5" title="About the data">{meta.data_note}</Callout>
      <div className="grid gap-4 md:grid-cols-2">
        {steps.map((s) => (
          <Card key={s.n}>
            <div className="flex gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand text-sm font-bold text-white">{s.n}</div>
              <div className="min-w-0"><div className="font-semibold leading-snug">{s.title}</div><p className="mt-1 text-sm text-ink-soft">{s.text}</p>
                {s.onClick ? <button className="btn-primary mt-3" onClick={s.onClick}>{s.cta}<ArrowRight size={15} /></button> : <Link className="btn-primary mt-3" to={s.to}>{s.cta}<ArrowRight size={15} /></Link>}</div>
            </div>
          </Card>
        ))}
      </div>
      <Card className="mt-6" title="Trap pairs: things that must NOT be flagged" hint="Live result from the classifier. A wrong flag here would be a false alarm.">
        {!traps ? <Spinner /> : (
          <div className="space-y-3">
            {traps.map((x, k) => (
              <div key={k} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3 text-sm">
                {x.flagged_wrongly ? <XCircle className="text-red-500" size={20} /> : <CheckCircle2 className="text-emerald-500" size={20} />}
                <div className="min-w-0 flex-1"><div className="font-medium">{x.a.institution} vs {x.b.institution}</div><div className="text-xs text-ink-soft">{x.why}</div></div>
                <Badge>Text similarity {Math.round(x.similarity * 100)}%</Badge><Badge tone={x.flagged_wrongly ? 'red' : 'green'}>{x.tier_name}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
