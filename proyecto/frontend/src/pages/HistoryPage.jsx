import { useEffect, useMemo, useState } from 'react'
import { fetchHistoryFiltered, connectAlerts } from '../lib/api'
import { useToasts } from '../components/ToastHost'
import { Archive, Download, RefreshCw, Search, Calendar, Filter, Activity, AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react'

function RiskBadge({ risk }) {
  if (!risk) return <span style={{ padding: '6px 12px', borderRadius: 999, fontSize: 13, fontWeight: 800, background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', gap: 6 }}><Info size={14}/> Sin evaluar</span>

  const cfg = {
    BAJO: { bg: '#ecfdf5', fg: '#059669', border: '#a7f3d0', Icon: CheckCircle },
    MEDIO: { bg: '#fffbeb', fg: '#d97706', border: '#fde68a', Icon: AlertTriangle },
    ALTO: { bg: '#fff7ed', fg: '#ea580c', border: '#fed7aa', Icon: AlertTriangle },
    'CRÍTICO': { bg: '#fef2f2', fg: '#dc2626', border: '#fecaca', Icon: XCircle },
  }[risk] ?? { bg: '#f1f5f9', fg: '#64748b', border: '#e2e8f0', Icon: Info }

  const Icon = cfg.Icon
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600, background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.border}` }}>
      <Icon size={14} strokeWidth={2} />
      {risk}
    </span>
  )
}

export default function HistoryPage() {
  const { push } = useToasts()
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null)
  
  // Pagination
  const [page, setPage] = useState(1)
  const limitPerPage = 20

  const [filters, setFilters] = useState({
    limit: 100,
    riskLevel: '',
    soilType: '',
    from: '',
    to: '',
    q: '',
  })

  const soilTypeOptions = useMemo(() => {
    const set = new Set()
    for (const it of items) {
      if (it?.soilType) set.add(it.soilType)
    }
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b)))
  }, [items])

  async function load(nextFilters = filters) {
    setLoading(true)
    setError('')
    try {
      const r = await fetchHistoryFiltered({
        limit: nextFilters.limit,
        riskLevel: nextFilters.riskLevel || undefined,
        soilType: nextFilters.soilType || undefined,
        from: nextFilters.from || undefined,
        to: nextFilters.to || undefined,
        q: nextFilters.q || undefined,
      })
      setItems(r.items ?? [])
      setPage(1) // Reset page on new load
      setLastUpdatedAt(Date.now())
    } catch (e) {
      setError(e?.message ?? 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(filters)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      load(filters)
    }, 250)
    return () => clearTimeout(t)
  }, [filters])

  useEffect(() => {
    const id = setInterval(() => {
      load(filters)
    }, 15000)
    return () => clearInterval(id)
  }, [filters])

  useEffect(() => {
    const disconnect = connectAlerts((msg) => {
      if (msg?.type === 'risk_alert') {
        push({
          title: `Nueva alerta: ${msg.payload?.riskLevel ?? 'RIESGO'}`,
          level: msg.payload?.riskLevel,
          message: `${msg.payload?.probableCause ?? ''}`,
          timeoutMs: 5000,
        })
        load(filters)
      }
    })
    return disconnect
  }, [push, filters])

  function exportarCsv() {
    const header = ['Fecha', 'Riesgo', 'Score', 'Tipo de Suelo', 'Causa Probable', 'Sugerencia Adaptativa']
    const rows = items.map(it => [
      new Date(it.createdAt).toLocaleString(),
      it.riskLevel,
      Number(it.score).toFixed(2),
      it.soilType || 'N/A',
      `"${String(it.probableCause || '').replace(/"/g, '""')}"`,
      `"${String(it.recommendation || '').replace(/"/g, '""')}"`
    ])
    const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `historial_evaluaciones_${new Date().toISOString().slice(0,10)}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 40 }}>
      <style>{`
        .premium-input:focus { background: #ffffff !important; border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1) !important; }
        .premium-card { background: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -2px rgba(0,0,0,0.02); }
        .icon-box { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: #f8fafc; border: 1px solid #e2e8f0; }
        .btn-update { padding: 8px 14px; border-radius: 10px; background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; transition: all 0.2s; }
        .btn-update:hover { background: #f1f5f9; }
        .btn-export { padding: 8px 14px; border-radius: 10px; background: #10b981; color: #ffffff; border: none; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; transition: all 0.2s; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25); }
        .btn-export:hover { filter: brightness(1.05); transform: translateY(-1px); }
        .btn-export:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
        .table-row { transition: all 0.2s; border-bottom: 1px solid #f8fafc; }
        .table-row:hover { background: #f8fafc; }
        .filter-label { font-size: 12px; color: #64748b; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; }
        .page-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #475569; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .page-btn:hover:not(:disabled) { background: #f1f5f9; }
        .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .page-btn.active { background: #4f46e5; color: #ffffff; border-color: #4f46e5; }
      `}</style>
      
      <section className="premium-card" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #f8fafc', paddingBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="icon-box">
              <Archive size={22} color="#334155" strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.3px' }}>Historial Operativo Data</div>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 400, marginTop: 2 }}>
                {lastUpdatedAt ? `Última sincronización: ${new Date(lastUpdatedAt).toLocaleTimeString()}` : 'Última sincronización: -'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-export" onClick={exportarCsv} disabled={items.length === 0}>
              <Download size={15} strokeWidth={2} /> Exportar Data (CSV)
            </button>
            <button className="btn-update" onClick={() => load(filters)} disabled={loading} style={{ opacity: loading ? 0.7 : 1 }}>
              <RefreshCw size={15} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
              {loading ? 'Sincronizando...' : 'Actualizar'}
            </button>
          </div>
        </div>

        <div style={{ background: '#f8fafc', padding: 20, borderRadius: 16, border: '1px solid #e2e8f0', display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 16 }}>
          <div style={{ gridColumn: 'span 12', display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
            <Filter size={16} color="#4f46e5" strokeWidth={2}/> Filtros de Búsqueda
          </div>
          
          <div style={{ gridColumn: 'span 12', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div>
              <div className="filter-label"><AlertTriangle size={14}/> Nivel de Riesgo</div>
              <select className="premium-input" style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', fontWeight: 400, outline: 'none', cursor: 'pointer', appearance: 'none' }} value={filters.riskLevel} onChange={(e) => setFilters((s) => ({ ...s, riskLevel: e.target.value }))}>
                <option value="">Todos los niveles</option>
                <option value="BAJO">Bajo</option>
                <option value="MEDIO">Medio</option>
                <option value="ALTO">Alto</option>
                <option value="CRÍTICO">Crítico</option>
              </select>
            </div>
            <div>
              <div className="filter-label"><Activity size={14}/> Tipo de suelo</div>
              <select className="premium-input" style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', fontWeight: 400, outline: 'none', cursor: 'pointer', appearance: 'none' }} value={filters.soilType} onChange={(e) => setFilters((s) => ({ ...s, soilType: e.target.value }))}>
                <option value="">Todos</option>
                {soilTypeOptions.map((st) => (
                  <option key={st} value={st}>{st}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="filter-label"><Calendar size={14}/> Desde</div>
              <input type="datetime-local" className="premium-input" style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', fontWeight: 400, outline: 'none', boxSizing: 'border-box' }} value={filters.from} onChange={(e) => setFilters((s) => ({ ...s, from: e.target.value }))} />
            </div>
            <div>
              <div className="filter-label"><Calendar size={14}/> Hasta</div>
              <input type="datetime-local" className="premium-input" style={{ width: '100%', padding: '10px 14px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', fontWeight: 400, outline: 'none', boxSizing: 'border-box' }} value={filters.to} onChange={(e) => setFilters((s) => ({ ...s, to: e.target.value }))} />
            </div>
            <div style={{ gridColumn: 'span 2' }}>
              <div className="filter-label"><Search size={14}/> Buscar (Causa / Recomendación)</div>
              <div style={{ position: 'relative' }}>
                <Search size={16} color="#94a3b8" style={{ position: 'absolute', top: 12, left: 14 }}/>
                <input className="premium-input" style={{ width: '100%', padding: '10px 14px 10px 38px', borderRadius: 12, border: '1px solid #e2e8f0', background: '#ffffff', fontWeight: 400, outline: 'none', boxSizing: 'border-box' }} value={filters.q} onChange={(e) => setFilters((s) => ({ ...s, q: e.target.value }))} placeholder="Buscar palabras clave..." />
              </div>
            </div>
          </div>

          <div style={{ gridColumn: 'span 12', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
            <div style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>
              Registros encontrados: <b style={{ color: '#0f172a', fontWeight: 600 }}>{items.length}</b>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Límite:</div>
              <select className="premium-input" style={{ padding: '6px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#ffffff', fontWeight: 500, outline: 'none', cursor: 'pointer', appearance: 'none' }} value={filters.limit} onChange={(e) => setFilters((s) => ({ ...s, limit: Number(e.target.value) }))}>
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
              <button className="btn-update" onClick={() => { const next = { limit: 100, riskLevel: '', soilType: '', from: '', to: '', q: '' }; setFilters(next); load(next); }} style={{ padding: '6px 12px', background: 'transparent', border: 'none', color: '#4f46e5' }}>
                Limpiar filtros
              </button>
            </div>
          </div>
        </div>

        {error ? <div style={{ padding: '16px 20px', borderRadius: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}><AlertTriangle size={18}/> {error}</div> : null}

        <div style={{ overflowX: 'auto', borderRadius: 16, border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr>
                <th style={{ padding: '16px', background: '#f8fafc', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>Fecha Registro</th>
                <th style={{ padding: '16px', background: '#f8fafc', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>Nivel de Riesgo</th>
                <th style={{ padding: '16px', background: '#f8fafc', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>Score</th>
                <th style={{ padding: '16px', background: '#f8fafc', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>Suelo</th>
                <th style={{ padding: '16px', background: '#f8fafc', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>Causa Detonante</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontWeight: 800 }}>Sincronizando registros históricos...</td>
                </tr>
              ) : null}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8', fontWeight: 500 }}>No hay registros que coincidan con los filtros.</td>
                </tr>
              ) : null}
              {!loading ? items.slice((page - 1) * limitPerPage, page * limitPerPage).map((it) => (
                <tr key={it.id} className="table-row">
                  <td style={{ padding: '16px', fontWeight: 500, color: '#475569', whiteSpace: 'nowrap' }}>
                    {new Date(it.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td style={{ padding: '16px' }}>
                    <RiskBadge risk={it.riskLevel} />
                  </td>
                  <td style={{ padding: '16px', fontWeight: 600, color: '#0f172a' }}>
                    {Number(it.score).toFixed(2)}
                  </td>
                  <td style={{ padding: '16px', fontWeight: 500, color: '#334155', textTransform: 'capitalize' }}>
                    {it.soilType}
                  </td>
                  <td style={{ padding: '16px', color: '#334155', fontWeight: 400, minWidth: 260, lineHeight: 1.5 }}>
                    {it.probableCause}
                  </td>
                </tr>
              )) : null}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {items.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9', paddingTop: 20 }}>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
              Mostrando <b style={{ color: '#0f172a' }}>{Math.min((page - 1) * limitPerPage + 1, items.length)}</b> - <b style={{ color: '#0f172a' }}>{Math.min(page * limitPerPage, items.length)}</b> de <b style={{ color: '#0f172a' }}>{items.length}</b> resultados
            </div>
            
            <div style={{ display: 'flex', gap: 4 }}>
              <button 
                className="page-btn" 
                onClick={() => setPage(p => Math.max(1, p - 1))} 
                disabled={page === 1}
              >
                Anterior
              </button>
              
              {Array.from({ length: Math.ceil(items.length / limitPerPage) }, (_, i) => i + 1).map(p => (
                <button 
                  key={p} 
                  className={`page-btn ${page === p ? 'active' : ''}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </button>
              ))}

              <button 
                className="page-btn" 
                onClick={() => setPage(p => Math.min(Math.ceil(items.length / limitPerPage), p + 1))} 
                disabled={page >= Math.ceil(items.length / limitPerPage)}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
