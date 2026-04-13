import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Cloud, RefreshCw, Thermometer, Droplets, Wind, Navigation, Calendar, Activity, Database, ChevronLeft, MapPin, Layers } from 'lucide-react'
import { fetchProjectById, fetchProjectClimate, refreshProjectClimate, fetchZones } from '../lib/api'
import { getUser } from '../lib/auth'

function fmtDate(x) {
  if (!x) return '-'
  try {
    return new Date(x).toLocaleString()
  } catch {
    return String(x)
  }
}

export default function ProjectClimateAdminPage() {
  const { id } = useParams()
  const projectId = Number(id)
  const user = getUser()
  const canWrite = user?.role === 'ADMIN' || user?.role === 'INGENIERO'

  const [project, setProject] = useState(null)
  const [zones, setZones] = useState([])
  const [selectedZoneId, setSelectedZoneId] = useState('')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    if (!Number.isFinite(projectId)) return
    setLoading(true)
    setError('')
    try {
      const [p, z, c] = await Promise.all([
        fetchProjectById(projectId),
        fetchZones(projectId),
        fetchProjectClimate(projectId, { limit: 50, zoneId: selectedZoneId || undefined })
      ])
      setProject(p)
      setZones(z.items ?? [])
      setItems(c.items ?? [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [projectId, selectedZoneId])

  async function handleRefresh() {
    setBusy(true)
    setError('')
    try {
      await refreshProjectClimate(projectId, selectedZoneId || null)
      await load()
    } catch (e) {
      setError('Error al capturar clima: ' + e.message)
    } finally {
      setBusy(false)
    }
  }

  const latest = items[0]

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 40, animation: 'fadeIn 0.4s ease-out' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .premium-card { background: #ffffff; border-radius: 24px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
        .btn-action { padding: 10px 18px; border-radius: 14px; font-weight: 800; font-size: 13px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all 0.2s; border: none; outline: none; }
        .btn-primary { background: #3b82f6; color: #ffffff; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3); }
        .btn-primary:hover:not(:disabled) { background: #2563eb; transform: translateY(-1px); }
        .btn-secondary { background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; }
        .weather-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 20px; }
        .stat-item { padding: 20px; border-radius: 20px; background: #f8fafc; border: 1px solid #e2e8f0; display: flex; align-items: center; gap: 16px; transition: all 0.2s; }
        .stat-item:hover { transform: translateY(-2px); border-color: #3b82f6; }
        .icon-box { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .table-row { transition: background 0.2s; border-bottom: 1px solid #f1f5f9; }
        .table-row:hover { background: #f8fafc; }
      `}</style>

      {/* HEADER */}
      <section className="premium-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: 14, background: '#eff6ff', border: '1px solid #dbeafe', display: 'flex', alignItems: 'center', justifyAndContent: 'center' }}>
            <Cloud size={24} color="#3b82f6" strokeWidth={2.5}/>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>Administración Clima</div>
            <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600, marginTop: 4 }}>
              Proyecto: <b style={{ color: '#3b82f6' }}>{project?.name ?? '-'}</b>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <Link to="/admin/proyectos" className="btn-action btn-secondary" style={{ textDecoration: 'none' }}>
            <ChevronLeft size={16}/> Volver
          </Link>
          {canWrite && (
            <button className="btn-action btn-primary" onClick={handleRefresh} disabled={busy || loading}>
              <RefreshCw size={18} className={busy ? 'spinning' : ''} />
              {busy ? 'Capturando...' : 'Capturar Ahora'}
            </button>
          )}
        </div>
      </section>

      {error ? (
        <div style={{ padding: 16, borderRadius: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 700 }}>
          {error}
        </div>
      ) : null}

      {/* CURRENT WEATHER CARDS */}
      <section className="weather-grid">
        <div className="stat-item">
          <div className="icon-box" style={{ background: '#fee2e2' }}><Thermometer color="#dc2626" /></div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>TEMPERATURA</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{latest?.tempC?.toFixed(1) ?? '--'}°C</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Sensación: {latest?.feelsLikeC?.toFixed(1) ?? '--'}°C</div>
          </div>
        </div>
        <div className="stat-item">
          <div className="icon-box" style={{ background: '#e0f2fe' }}><Droplets color="#0284c7" /></div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>HUMEDAD</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{latest?.humidityPct ?? '--'}%</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Presión: {latest?.pressureHpa ?? '--'} hPa</div>
          </div>
        </div>
        <div className="stat-item">
          <div className="icon-box" style={{ background: '#f1f5f9' }}><Wind color="#475569" /></div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>VIENTO</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{latest?.windSpeedMs?.toFixed(1) ?? '--'} m/s</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Dirección: {latest?.windDeg ?? '--'}°</div>
          </div>
        </div>
        <div className="stat-item">
          <div className="icon-box" style={{ background: '#dcfce7' }}><Activity color="#166534" /></div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b' }}>PRECIPITACIÓN</div>
            <div style={{ fontSize: 24, fontWeight: 900 }}>{latest?.precipitation24hMm ?? '0'} mm</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>Últimas 24h</div>
          </div>
        </div>
      </section>

      {/* FILTROS Y ACCIONES */}
      <section className="premium-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 300 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Layers size={20} color="#64748b" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 4 }}>FILTRAR Y CAPTURAR POR ZONA</div>
              <select 
                value={selectedZoneId} 
                onChange={e => setSelectedZoneId(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: 14, fontWeight: 600, color: '#0f172a', outline: 'none' }}
              >
                <option value="">(Toda la extensión del proyecto)</option>
                {zones.map(z => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-action btn-primary" onClick={handleRefresh} disabled={busy || loading}>
              <RefreshCw size={18} className={busy ? 'spinning' : ''} />
              {busy ? 'Capturando...' : 'Capturar Clima Ahora'}
            </button>
          </div>
        </div>
      </section>

      {/* HISTORY TABLE */}
      <section className="premium-card" style={{ padding: 0 }}>
        <div style={{ padding: 24, borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Calendar size={18} color="#3b82f6" /> Historial de Capturas
          </div>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{items.length} registros totales</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 12, fontWeight: 900, color: '#64748b' }}>FECHA Y HORA</th>
                <th style={{ padding: '16px 24px', textAlign: 'left', fontSize: 12, fontWeight: 900, color: '#64748b' }}>CONDICIÓN</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: 12, fontWeight: 900, color: '#64748b' }}>TEMP</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: 12, fontWeight: 900, color: '#64748b' }}>HUM %</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: 12, fontWeight: 900, color: '#64748b' }}>PRECIP</th>
                <th style={{ padding: '16px 24px', textAlign: 'right', fontSize: 12, fontWeight: 900, color: '#64748b' }}>VIENTO</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <tr key={item.id} className="table-row">
                  <td style={{ padding: '16px 24px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>{fmtDate(item.createdAt)}</td>
                  <td style={{ padding: '16px 24px', fontSize: 13, textTransform: 'capitalize', fontWeight: 600 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {item.conditionIcon && <img src={`https://openweathermap.org/img/wn/${item.conditionIcon}.png`} width="24" height="24" alt="icon" />}
                      {item.conditionText || 'Manual'}
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 800, color: '#ef4444' }}>{item.tempC?.toFixed(1) ?? '-'}°</td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 800, color: '#3b82f6' }}>{item.humidityPct ?? '-'}%</td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>{item.precipitation24hMm ?? '0'} mm</td>
                  <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: 700, color: '#64748b' }}>{item.windSpeedMs?.toFixed(1) ?? '-'} m/s</td>
                </tr>
              ))}
              {items.length === 0 && !loading && (
                <tr>
                  <td colSpan="6" style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>No hay datos registrados.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
