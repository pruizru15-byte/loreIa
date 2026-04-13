import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { connectAlerts, fetchAlerts, fetchProjects } from '../lib/api'
import { Map as MapIcon, RefreshCw, ExternalLink, Activity, ShieldAlert, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react'

function markerIcon(level) {
  const c = {
    BAJO: '#059669',
    MEDIO: '#d97706',
    ALTO: '#ea580c',
    'CRÍTICO': '#dc2626',
  }[level] ?? '#3b82f6'

  const isCritical = level === 'CRÍTICO'

  const html = isCritical
    ? `<div style="position:relative;width:20px;height:20px;">
         <div class="pulse-ring" style="position:absolute;left:50%;top:50%;width:20px;height:20px;border-radius:999px;background:${c};transform:translate(-50%,-50%);"></div>
         <div style="position:absolute;left:50%;top:50%;width:16px;height:16px;border-radius:999px;background:${c};border:2px solid white;transform:translate(-50%,-50%);box-shadow:0 0 12px rgba(220,38,38,0.6)"></div>
       </div>`
    : `<div style="width:16px;height:16px;border-radius:999px;background:${c};border:2px solid white;box-shadow:0 4px 8px rgba(0,0,0,0.3)"></div>`

  return L.divIcon({
    className: '',
    html,
    iconSize: isCritical ? [20, 20] : [16, 16],
    iconAnchor: isCritical ? [10, 10] : [8, 8],
  })
}

function RiskBadge({ risk }) {
  if (!risk) return <span style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 800, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Info size={14}/> Sin evaluar</span>

  const cfg = {
    BAJO: { bg: '#ecfdf5', fg: '#059669', border: '#a7f3d0', Icon: CheckCircle },
    MEDIO: { bg: '#fffbeb', fg: '#d97706', border: '#fde68a', Icon: AlertTriangle },
    ALTO: { bg: '#fff7ed', fg: '#ea580c', border: '#fed7aa', Icon: AlertTriangle },
    'CRÍTICO': { bg: '#fef2f2', fg: '#dc2626', border: '#fecaca', Icon: XCircle },
  }[risk] ?? { bg: '#f1f5f9', fg: '#64748b', border: '#e2e8f0', Icon: Info }

  const Icon = cfg.Icon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 900, background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.border}` }}>
      <Icon size={14} strokeWidth={2.5} />
      {risk}
    </span>
  )
}

const defaultCenter = [-5.1945, -80.6328]

function FixLeafletLayout({ depsKey }) {
  const map = useMap()

  useEffect(() => {
    const t = window.setTimeout(() => {
      map.invalidateSize()
    }, 150)
    return () => window.clearTimeout(t)
  }, [map, depsKey])

  useEffect(() => {
    function onResize() {
      map.invalidateSize()
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [map])

  return null
}

export default function MapPage() {
  const [projects, setProjects] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [p, a] = await Promise.all([fetchProjects(), fetchAlerts(500)])
      setProjects(p.items ?? [])
      setAlerts(a.items ?? [])
    } catch (e) {
      setError(e?.message ?? 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const disconnect = connectAlerts((msg) => {
      if (msg?.type !== 'risk_alert') return
      const p = msg?.payload
      if (!p?.alertId || !p?.projectId) return
      setAlerts((prev) => {
        const next = Array.isArray(prev) ? [...prev] : []
        const idx = next.findIndex((a) => Number(a.id) === Number(p.alertId))
        const row = {
          id: p.alertId,
          projectId: p.projectId,
          zoneId: p.zoneId ?? null,
          createdAt: p.createdAt ?? new Date().toISOString(),
          score: p.score,
          riskLevel: p.riskLevel,
          probableCause: p.probableCause,
          recommendation: p.recommendation,
          source: 'ws',
          acknowledgedAt: null,
          acknowledgedBy: null,
          resolvedAt: null,
          responseAction: null,
          responseAt: null,
          responseBy: null,
        }
        if (idx >= 0) next[idx] = { ...next[idx], ...row }
        else next.unshift(row)
        return next
      })
    })

    return () => disconnect?.()
  }, [])

  const lastByProject = useMemo(() => {
    const m = new Map()
    for (const a of alerts) {
      if (!m.has(a.projectId)) m.set(a.projectId, a)
    }
    return m
  }, [alerts])

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 40 }}>
      <style>{`
        .premium-card { background: #ffffff; border-radius: 24px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
        .btn-update { padding: 10px 16px; border-radius: 14px; background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; font-weight: 800; transition: all 0.2s; }
        .btn-update:hover { background: #e2e8f0; }
        .leaflet-popup-content-wrapper { border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); padding: 4px; }
        .leaflet-popup-content { margin: 12px 14px; }
        .pulse-ring { animation: pulseAnim 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; }
        @keyframes pulseAnim { 0% { opacity: 1; transform: translate(-50%, -50%) scale(1); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(2.5); } }
      `}</style>
      
      <section className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #f1f5f9', paddingBottom: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MapIcon size={24} color="#0f172a" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>Panel: Estado de Continuidad Operativa</div>
              <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600, marginTop: 4 }}>
                Monitoreo espacial de proyectos y factores geotécnicos (Región Piura)
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn-update" onClick={load} disabled={loading} style={{ opacity: loading ? 0.7 : 1 }}>
              <RefreshCw size={16} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Sincronizando...' : 'Actualizar Mapa'}
            </button>
          </div>
        </div>

        {error ? (
          <div style={{ padding: '16px 20px', borderRadius: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={18} /> {error}
          </div>
        ) : null}

        <div style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid #e2e8f0', position: 'relative', boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)' }}>
          <MapContainer
            center={defaultCenter}
            zoom={11}
            style={{ height: 500, width: '100%', zIndex: 1 }}
          >
            <FixLeafletLayout depsKey={projects.length} />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />

            {projects.map((p) => {
              const last = lastByProject.get(p.id)
              const level = last?.riskLevel ?? 'BAJO'
              
              return (
                <Marker key={p.id} position={[p.lat, p.lon]} icon={markerIcon(level)}>
                  <Popup>
                    <div style={{ minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ fontSize: 16, fontWeight: 900, color: '#0f172a', borderBottom: '1px solid #f1f5f9', paddingBottom: 10 }}>{p.name}</div>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        <span style={{ fontSize: 12, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Estado de Continuidad</span>
                        <RiskBadge risk={level} />
                      </div>
                      
                      {last?.createdAt && (
                        <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                           <Activity size={12} /> Última alerta: {new Date(last.createdAt).toLocaleString()}
                        </div>
                      )}
                      
                      <div style={{ marginTop: 4 }}>
                        <Link to={`/proyectos/${p.id}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: '#ffffff', background: '#4f46e5', padding: '10px 16px', borderRadius: 12, textDecoration: 'none', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}>
                          Abrir Proyecto <ExternalLink size={14} strokeWidth={2.5} />
                        </Link>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
        </div>
      </section>
    </div>
  )
}
