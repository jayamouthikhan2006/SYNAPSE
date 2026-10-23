import { Download } from 'lucide-react'
import { Card, PageHeader } from '../ui'

const CHAPTERS = ['Dashboard', 'Institution 360', 'File a complaint', 'LLM firewall', 'AI matching', 'Issue threads', 'Enforcement actions', 'ACE alerts',
  'Coordination room', 'Private by default', 'Resolution assurance', 'Complaint passport', 'Analytics', 'Audit ledger', 'Demo guide']

export default function Film() {
  return (
    <div>
      <PageHeader title="Watch the film" hint="A 75-second tour of everything SYNAPSE does, from the first complaint to the tamper-proof ledger." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card overflow-hidden bg-black">
            <video className="aspect-video w-full bg-black" controls preload="metadata" poster="/synapse-ad-poster.jpg" playsInline>
              <source src="/synapse-ad.mp4" type="video/mp4" />
              Your browser cannot play this video. <a href="/synapse-ad.mp4">Download it instead.</a>
            </video>
          </div>
          <a className="btn-ghost mt-3" href="/synapse-ad.mp4" download="SYNAPSE-ad.mp4"><Download size={16} /> Download the video (17 MB)</a>
        </div>
        <Card title="What you will see" hint="15 chapters, in order">
          <ol className="space-y-1.5 text-sm">
            {CHAPTERS.map((c, i) => <li key={c} className="flex gap-3"><span className="w-6 text-right font-mono text-xs text-ink-faint">{String(i + 1).padStart(2, '0')}</span><span>{c}</span></li>)}
          </ol>
        </Card>
      </div>
    </div>
  )
}
