import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertCircle, AlertTriangle, ArrowUpRight, BarChart2, CheckCircle, ExternalLink, FolderOpen, Info, RefreshCw, XCircle, Activity } from 'lucide-react'
import { connectAlerts, fetchProjects, fetchReportSummary } from '../lib/api'
import { useToasts } from '../components/ToastHost'

function StatCard({ label, value, sub, color }) {
  const cfg = {
    blue: { iconBg: 'rgba(59, 130, 246, 0.12)', iconColor: '#3b82f6', border: 'rgba(59, 130, 246, 0.25)', gradient: 'linear-gradient(135deg, rgba(59,130,246,0.05) 0%, transparent 100%)' },
    red: { iconBg: 'rgba(239, 68, 68, 0.12)', iconColor: '#ef4444', border: 'rgba(239, 68, 68, 0.25)', gradient: 'linear-gradient(135deg, rgba(239,68,68,0.05) 0%, transparent 100%)' },
    orange: { iconBg: 'rgba(249, 115, 22, 0.12)', iconColor: '#f97316', border: 'rgba(249, 115, 22, 0.25)', gradient: 'linear-gradient(135deg, rgba(249,115,22,0.05) 0%, transparent 100%)' },
    indigo: { iconBg: 'rgba(99, 102, 241, 0.12)', iconColor: '#6366f1', border: 'rgba(99, 102, 241, 0.25)', gradient: 'linear-gradient(135deg, rgba(99,102,241,0.05) 0%, transparent 100%)' },
  }[color] ?? { iconBg: '#f1f5f9', iconColor: '#64748b', border: '#e2e8f0', gradient: 'none' }

  return (
    <div className="stat-card" style={{
      background: '#ffffff',
      backgroundImage: cfg.gradient,
      borderRadius: 24,
      border: `1px solid ${cfg.border}`,
      padding: 24,
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.03)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      position: 'relative',
      overflow: 'hidden'
    }}>
      <div style={{ position: 'absolute', top: 0, right: 0, width: 120, height: 120, background: cfg.iconBg, filter: 'blur(30px)', borderRadius: '50%', transform: 'translate(20%, -20%)', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
      </div>
      <span style={{ fontSize: 44, fontWeight: 600, color: '#1e293b', lineHeight: 1, position: 'relative', zIndex: 1, letterSpacing: '-0.5px' }}>{value}</span>
      <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600, position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        {sub}
      </span>
    </div>
  )
}

function RiskBadge({ risk }) {
  if (!risk)
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '6px 10px',
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 800,
          background: '#F8FAFC',
          color: '#94A3B8',
          border: '1px solid rgba(226,232,240,0.9)',
        }}
      >
        <Info size={12} strokeWidth={2} />
        Sin datos
      </span>
    )

  const cfg =
    {
      BAJO: { bg: '#ECFDF5', fg: '#047857', border: 'rgba(167,243,208,0.9)', Icon: CheckCircle },
      MEDIO: { bg: '#FFFBEB', fg: '#B45309', border: 'rgba(253,230,138,0.9)', Icon: AlertCircle },
      ALTO: { bg: '#FFF7ED', fg: '#C2410C', border: 'rgba(254,215,170,0.9)', Icon: AlertTriangle },
      'CRÍTICO': { bg: '#FEF2F2', fg: '#B91C1C', border: 'rgba(254,202,202,0.95)', Icon: XCircle },
    }[risk] ?? { bg: '#F1F5F9', fg: '#0F172A', border: 'rgba(226,232,240,0.9)', Icon: Info }

  const Icon = cfg.Icon
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: cfg.bg,
        color: cfg.fg,
        border: `1px solid ${cfg.border}`,
      }}
    >
      <Icon size={12} strokeWidth={2.4} />
      {risk}
    </span>
  )
}

export default function DashboardPage() {
  const { push } = useToasts()
  const [projects, setProjects] = useState([])
  const [summaryBoth, setSummaryBoth] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastAlertByProject, setLastAlertByProject] = useState({})

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [p, s] = await Promise.all([fetchProjects(), fetchReportSummary({ mode: 'both' })])
      setProjects(p.items ?? [])
      setSummaryBoth(s)
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
      if (!p?.projectId || !p?.alertId) return
      setLastAlertByProject((prev) => ({
        ...(prev ?? {}),
        [String(p.projectId)]: {
          id: p.alertId,
          createdAt: p.createdAt ?? new Date().toISOString(),
          riskLevel: p.riskLevel,
          score: p.score,
        },
      }))

      if (p.riskLevel === 'ALTO' || p.riskLevel === 'CRÍTICO') {
        push({
          title: `Alerta Geotécnica: ${p.riskLevel}`,
          level: p.riskLevel,
          message: `${p.probableCause ?? 'Condiciones inestables detectadas en el terreno.'}`,
          actionUrl: p.projectId ? `/proyectos/${p.projectId}` : null,
          timeoutMs: 15000
        })
      }
    })
    return () => disconnect?.()
  }, [])

  const counts = useMemo(() => {
    const items = Array.isArray(projects) ? projects : []
    let critical = 0
    let high = 0
    for (const pr of items) {
      const last = lastAlertByProject?.[String(pr.id)]
      const level = last?.riskLevel
      if (level === 'CRÍTICO') critical += 1
      if (level === 'ALTO') high += 1
    }
    return { total: items.length, critical, high }
  }, [projects, lastAlertByProject])

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <style>{`
        .stat-card:hover { transform: translateY(-4px); box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important; }
        .project-row { transition: all 0.2s; border-bottom: 1px solid #f1f5f9; }
        .project-row:hover { background: #f8fafc; transform: scale(1.002); border-radius: 12px; }
      `}</style>
      
      <section style={{
        background: '#ffffff',
        borderRadius: 24,
        border: '1px solid #e2e8f0',
        padding: '20px 24px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e2e8f0' }}>
            <Activity size={22} color="#0f172a" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 500, color: '#1e293b', letterSpacing: '0px' }}>Resumen Operativo en Tiempo Real</div>
            <div style={{ marginTop: 4, fontSize: 13, color: '#64748b', fontWeight: 600 }}>Monitorización continua de estabilidad y eficiencia adaptativa</div>
          </div>
        </div>
        
        {error ? (
          <div style={{ padding: '8px 12px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 700, fontSize: 13 }}>{error}</div>
        ) : null}
        
        <button
          onClick={load}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 20px',
            borderRadius: 14,
            border: 'none',
            background: loading ? '#94a3b8' : '#0f172a',
            color: '#ffffff',
            fontWeight: 800,
            cursor: loading ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
          onMouseOver={(e) => !loading && (e.currentTarget.style.background = '#334155')}
          onMouseOut={(e) => !loading && (e.currentTarget.style.background = '#0f172a')}
        >
          <RefreshCw size={16} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
          Sincronizar Panel
        </button>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <StatCard label="Proyectos Activos" value={counts.total} sub="Terrenos monitoreados" color="blue" />
        <StatCard label="Riesgo Crítico" value={counts.critical} sub="Paralización Inminente" color="red" />
        <StatCard label="Riesgo Alto" value={counts.high} sub="Atención Requerida" color="orange" />
        <StatCard label="Alertas Emitidas" value={summaryBoth?.totalAlerts ?? '-'} sub="Histórico acumulado" color="indigo" />
      </section>

      <section style={{
        background: '#ffffff',
        borderRadius: 24,
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex',
          justifyContent: 'space-between',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
          background: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#ffffff', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FolderOpen size={18} strokeWidth={2} color="#64748b" />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 500, color: '#1e293b', letterSpacing: '0px' }}>Proyectos Registrados</div>
              <div style={{ marginTop: 2, fontSize: 13, color: '#64748b', fontWeight: 600 }}>Desglose de {(projects ?? []).length} registros activos</div>
            </div>
          </div>
          <Link to="/admin/proyectos" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4f46e5', fontWeight: 800, padding: '8px 16px', borderRadius: 999, background: 'rgba(79, 70, 229, 0.1)' }}>
            Abrir administración completa
            <ExternalLink size={14} strokeWidth={2.5} />
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '4fr 2fr 3fr 2fr 1fr', padding: '16px 24px', background: '#ffffff', borderBottom: '1px solid #f1f5f9' }}>
          {['Proyecto', 'Cod', 'Coordenadas (Lat/Lon)', 'Estado Continuidad', ''].map((h) => (
            <div key={h} style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1, color: '#94a3b8', textTransform: 'uppercase' }}>
              {h}
            </div>
          ))}
        </div>

        {loading ? <div style={{ padding: 32, textAlign: 'center', color: '#64748b', fontWeight: 800 }}>Cargando datos espaciales...</div> : null}

        <div style={{ padding: '8px 12px' }}>
          {(projects ?? []).slice(0, 20).map((p) => {
            const last = lastAlertByProject?.[String(p.id)]
            const coords = p.locationLat != null && p.locationLon != null ? `${Number(p.locationLat).toFixed(4)} / ${Number(p.locationLon).toFixed(4)}` : '— Pendiente'
            return (
              <Link key={p.id} to={`/proyectos/${p.id}`} className="project-row" style={{ textDecoration: 'none', color: 'inherit', display: 'grid', gridTemplateColumns: '4fr 2fr 3fr 2fr 1fr', padding: '16px 12px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <BarChart2 size={16} strokeWidth={2.5} color="#475569" />
                  </div>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 14 }}>{p.name}</div>
                </div>
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 800 }}>#{p.id}</div>
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, fontFamily: 'monospace' }}>{coords}</div>
                <div><RiskBadge risk={last?.riskLevel} /></div>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#4f46e5', fontWeight: 800 }}>
                    Monitorizar <ArrowUpRight size={16} strokeWidth={2.5} />
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
  )
}
