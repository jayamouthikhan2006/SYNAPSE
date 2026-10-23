import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

const COLORS = { institution: '#2f5bea', trust: '#0d9488', sister: '#94a3b8', bureau: '#7c3aed' }
const RISK_RING = { High: '#dc2626', Medium: '#d97706', Low: '#16a34a' }

export default function GraphView({ graph, height = 380 }) {
  const ref = useRef(null)
  const cyRef = useRef(null)
  const nav = useNavigate()
  useEffect(() => {
    let dead = false
    import('cytoscape').then(({ default: cytoscape }) => {
      if (dead || !ref.current) return
      const els = [
        ...graph.nodes.map((n) => ({ data: { ...n, color: n.color || COLORS[n.type], ring: RISK_RING[n.risk] || '#fff', size: n.center ? 74 : n.type === 'trust' ? 56 : 44 } })),
        ...graph.edges.map((e, i) => ({ data: { id: 'e' + i, ...e } })),
      ]
      const cy = cytoscape({
        container: ref.current, elements: els, minZoom: 0.4, maxZoom: 2.2, wheelSensitivity: 0.25,
        layout: { name: 'concentric', concentric: (n) => (n.data('center') ? 3 : n.data('type') === 'trust' ? 2 : 1), levelWidth: () => 1, minNodeSpacing: 46, padding: 30, animate: false },
        style: [
          { selector: 'node', style: { 'background-color': 'data(color)', label: 'data(label)', 'font-size': 11, 'font-family': 'Inter, sans-serif', color: '#1e2a44', 'text-valign': 'bottom', 'text-margin-y': 6, 'text-wrap': 'wrap', 'text-max-width': 120, width: 'data(size)', height: 'data(size)', 'border-width': 3, 'border-color': 'data(ring)' } },
          { selector: 'node[type = "institution"]', style: { 'font-weight': 700, 'font-size': 12 } },
          { selector: 'node[type = "bureau"]', style: { shape: 'round-rectangle' } },
          { selector: 'node[type = "trust"]', style: { shape: 'hexagon' } },
          { selector: 'edge', style: { width: 1.6, 'line-color': '#cbd5e1', 'curve-style': 'bezier', label: 'data(label)', 'font-size': 9, color: '#8a97b2', 'text-background-color': '#fff', 'text-background-opacity': 1, 'text-background-padding': 2, 'target-arrow-shape': 'triangle', 'target-arrow-color': '#cbd5e1', 'arrow-scale': 0.8 } },
          { selector: 'node:selected', style: { 'border-color': '#f59e0b' } },
        ],
      })
      cy.on('tap', 'node', (e) => { const h = e.target.data('href'); if (h && !e.target.data('center')) nav(h) })
      cy.on('mouseover', 'node', (e) => { if (e.target.data('href')) ref.current.style.cursor = 'pointer' })
      cy.on('mouseout', 'node', () => { ref.current.style.cursor = 'default' })
      cyRef.current = cy
    })
    return () => { dead = true; if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null } }
  }, [graph])
  const zoom = (f) => { const c = cyRef.current; if (c) c.zoom({ level: c.zoom() * f, renderedPosition: { x: c.width() / 2, y: c.height() / 2 } }) }
  return (
    <div className="relative rounded-xl border border-line bg-[radial-gradient(circle_at_center,#f8faff,#fff)]">
      <div ref={ref} style={{ height }} />
      <div className="absolute right-3 top-3 flex flex-col gap-1">
        <button className="btn-ghost !px-2.5 !py-1" onClick={() => zoom(1.25)} aria-label="Zoom in">+</button>
        <button className="btn-ghost !px-2.5 !py-1" onClick={() => zoom(0.8)} aria-label="Zoom out">-</button>
        <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => cyRef.current && cyRef.current.fit(undefined, 30)} aria-label="Fit">Fit</button>
      </div>
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-lg bg-white/90 px-3 py-2 text-[11px] text-ink-soft shadow-card">
        {[['institution', 'This college'], ['trust', 'Parent trust'], ['sister', 'Sister campus'], ['bureau', 'Bureau with open work']].map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLORS[k] }} />{l}</span>
        ))}
      </div>
    </div>
  )
}
