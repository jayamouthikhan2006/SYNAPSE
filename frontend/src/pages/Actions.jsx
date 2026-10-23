import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EyeOff, Plus } from 'lucide-react'
import { qs, useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, BureauChip, Callout, Card, ErrorBox, PageHeader, Select, Spinner, StatusBadge, fmtDate } from '../ui'

export default function Actions() {
  const { meta, role, t } = useApp()
  const nav = useNavigate()
  const [bureau, setBureau] = useState('')
  const [status, setStatus] = useState('')
  const { data, error } = useApi('/actions' + qs({ bureau, status }), [role])
  return (
    <div>
      <PageHeader title={t('Enforcement Actions')} hint="Warnings, notices, penalties and approvals. Each new action is checked against other bureaus' plans for the same college.">
        <Link to="/actions/new" className="btn-primary"><Plus size={16} /> New action</Link>
      </PageHeader>
      {data?.hidden > 0 && (
        <Callout tone="blue" icon={EyeOff} className="mb-4" title={`${data.hidden} action(s) from other bureaus are hidden from ${meta.roles[role]}`}>
          Draft and proposed actions stay private to their own bureau until ACE finds a clash. Switch to "Command Centre" under "Viewing as" to see everything.
        </Callout>
      )}
      <Card pad={false}>
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-3">
          <Select value={bureau} onChange={setBureau} placeholder="All bureaus" options={Object.entries(meta.bureaus).map(([value, b]) => ({ value, label: b.name }))} />
          <Select value={status} onChange={setStatus} placeholder="Any status" options={['draft', 'proposed', 'under_review', 'issued', 'withdrawn', 'closed', 'merged'].map((s) => ({ value: s, label: s.replace('_', ' ') }))} />
        </div>
        {error ? <div className="p-4"><ErrorBox error={error} /></div> : !data ? <Spinner /> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr><th className="th">Reference</th><th className="th">Action</th><th className="th">College</th><th className="th">Bureau</th><th className="th">Status</th><th className="th">Proposed</th><th className="th">ACE</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.items.map((a) => (
                  <tr key={a.id} className="row-link" onClick={() => nav(`/institutions/${a.institution_id}`)}>
                    <td className="td font-mono text-xs font-semibold">{a.ref_no}</td>
                    <td className="td"><div className="font-medium">{a.type_label}</div><div className="max-w-xs truncate text-xs text-ink-soft">{a.summary}</div></td>
                    <td className="td max-w-[220px] truncate">{a.institution_name}</td>
                    <td className="td"><BureauChip id={a.bureau} /></td>
                    <td className="td"><StatusBadge s={a.status} /></td>
                    <td className="td">{fmtDate(a.proposed_date)}</td>
                    <td className="td">{a.in_alert ? <Badge tone="red">Clash flagged</Badge> : <span className="text-xs text-ink-faint">Clear</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
