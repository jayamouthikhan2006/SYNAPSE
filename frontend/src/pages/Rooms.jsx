import { Link, useNavigate } from 'react-router-dom'
import { Users2 } from 'lucide-react'
import { useApi } from '../api'
import { useApp } from '../ctx'
import { Badge, BureauChip, Card, Empty, ErrorBox, PageHeader, Spinner, StatusBadge, fmtDateTime } from '../ui'

export default function Rooms() {
  const { t } = useApp()
  const nav = useNavigate()
  const { data, error } = useApi('/rooms')
  if (error) return <ErrorBox error={error} />
  if (!data) return <Spinner />
  return (
    <div>
      <PageHeader title={t('Coordination Rooms')} hint="Two bureaus sort out an overlap together and send the college one notice instead of two." />
      <div className="grid gap-4 md:grid-cols-2">
        {data.items.map((r) => (
          <button key={r.id} onClick={() => nav(`/rooms/${r.id}`)} className="card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-pop">
            <div className="flex items-center gap-2"><Users2 size={18} className="text-brand" /><span className="font-semibold">Room #{r.id}</span><StatusBadge s={r.status} /><Badge>{r.alert_no}</Badge></div>
            <div className="mt-2 font-medium">{r.institution_name}</div>
            <div className="mt-1 flex items-center gap-2 text-sm text-ink-soft">Lead: <BureauChip id={r.lead_bureau} full /></div>
            <div className="mt-2 text-xs text-ink-soft">Opened {fmtDateTime(r.created_at)} · {r.acks.length}/2 bureaus acknowledged</div>
          </button>
        ))}
      </div>
      {!data.items.length && <Card><Empty title="No coordination rooms yet" hint="Open an ACE alert and choose 'Request joint review' to create one." />
        <div className="text-center"><Link to="/alerts" className="btn-primary">Go to ACE alerts</Link></div></Card>}
    </div>
  )
}
