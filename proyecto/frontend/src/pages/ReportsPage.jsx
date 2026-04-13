import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchProjects, fetchReportSummary } from '../lib/api'
import { ui } from '../lib/ui'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BarChart2, Download, FileText, TrendingUp, TrendingDown, ShieldCheck, Clock, CheckCircle, AlertTriangle, FileSpreadsheet } from 'lucide-react'

function Card({ title, value, hint, icon: Icon, trend }) {
  return (
    <div style={{ background: '#ffffff', borderRadius: 20, border: '1px solid #e2e8f0', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
        {Icon && <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4f46e5' }}><Icon size={18} strokeWidth={2.5}/></div>}
      </div>
      <div>
        <div style={{ fontSize: 32, fontWeight: 700, color: '#0f172a', letterSpacing: '-1px' }}>{value}</div>
        {hint && <div style={{ marginTop: 4, fontSize: 13, color: '#64748b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>{hint}</div>}
      </div>
    </div>
  )
}

function ComparisonRow({ label, pre, post, unit = '' }) {
  const preVal = pre != null ? Number(pre) : null
  const postVal = post != null ? Number(post) : null
  const improvement = preVal != null && postVal != null && preVal !== 0
    ? ((preVal - postVal) / preVal * 100).toFixed(1)
    : null

  const isBetter = improvement > 0
  const isWorse = improvement < 0
  
  return (
    <tr className="table-row">
      <td style={{ padding: '16px 20px', fontWeight: 600, color: '#334155' }}>{label}</td>
      <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 500, color: '#64748b', background: '#f8fafc' }}>
        {preVal != null ? `${preVal.toFixed(1)}${unit}` : '-'}
      </td>
      <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 600, color: '#0f172a', background: '#f0fdf4' }}>
        {postVal != null ? `${postVal.toFixed(1)}${unit}` : '-'}
      </td>
      <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 600 }}>
        {improvement != null ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 999, background: isBetter ? '#dcfce7' : isWorse ? '#fee2e2' : '#f1f5f9', color: isBetter ? '#059669' : isWorse ? '#dc2626' : '#64748b', fontSize: 12 }}>
            {isBetter ? <TrendingDown size={14} strokeWidth={2.5}/> : <TrendingUp size={14} strokeWidth={2.5}/>}
            {Math.abs(improvement)}%
          </span>
        ) : '-'}
      </td>
    </tr>
  )
}

export default function ReportsPage() {
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState([])
  const [dataPre, setDataPre] = useState(null)
  const [dataPost, setDataPost] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const [page, setPage] = useState(1)
  const limitPerPage = 20

  const chartLevelsRef = useRef(null)
  const chartMetricsRef = useRef(null)

  async function loadProjects() {
    try {
      const r = await fetchProjects()
      setProjects(r.items ?? [])
    } catch (e) {
      // ignore
    }
  }

  async function downloadPdf() {
    setError('')
    try {
      const base = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001'
      const token = localStorage.getItem('geotech_token')
      const q = new URLSearchParams()
      if (projectId) q.set('projectId', projectId)
      const res = await fetch(`${base}/reports/summary.pdf?${q.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'No se pudo descargar el PDF')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const projectName = projects.find(p => String(p.id) === projectId)?.name || 'todos'
      a.download = `reporte_pre_post_${projectName}_${new Date().toISOString().slice(0,10)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      setError(e?.message ?? 'Error')
    }
  }

  async function load() {
    setLoading(true)
    setError('')
    try {
      const pid = projectId ? Number(projectId) : undefined
      const [pre, post] = await Promise.all([
        fetchReportSummary({ mode: 'pre', projectId: pid }),
        fetchReportSummary({ mode: 'post', projectId: pid }),
      ])
      setDataPre(pre)
      setDataPost(post)
    } catch (e) {
      setError(e?.message ?? 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProjects()
  }, [])

  useEffect(() => {
    load()
    // reset pagination if project filter changes (if applicable for broader data sets)
    setPage(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function downloadCsv() {
    setError('')
    try {
      const base = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001'
      const token = localStorage.getItem('geotech_token')
      const q = new URLSearchParams()
      if (projectId) q.set('projectId', projectId)
      const res = await fetch(`${base}/reports/alerts.csv?${q.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'No se pudo descargar el CSV')
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const projectName = projects.find(p => String(p.id) === projectId)?.name || 'todos'
      a.download = `alerts_${projectName}_${new Date().toISOString().slice(0,10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      setError(e?.message ?? 'Error')
    }
  }

  function downloadComparisonTxt() {
    const lines = [
      'REPORTE TESIS PRE/POST - Sistema Geotécnico de Riesgo',
      `Fecha: ${new Date().toLocaleString()}`,
      `Proyecto: ${projects.find(p => String(p.id) === projectId)?.name || 'Todos los proyectos'}`,
      '',
      'MÉTRICAS COMPARATIVAS:',
      '----------------------',
      `Alertas totales - Sin LORE-IA: ${dataPre?.totalAlerts ?? 0} | Con LORE-IA: ${dataPost?.totalAlerts ?? 0}`,
      `Alertas reconocidas - Sin LORE-IA: ${dataPre?.acknowledgedAlerts ?? 0} | Con LORE-IA: ${dataPost?.acknowledgedAlerts ?? 0}`,
      `Acciones correctivas registradas - Sin LORE-IA: ${dataPre?.respondedAlerts ?? 0} | Con LORE-IA: ${dataPost?.respondedAlerts ?? 0}`,
      `Tiempo respuesta promedio (min) - Sin LORE-IA: ${dataPre?.avgResponseMinutes?.toFixed(1) ?? '-'} | Con LORE-IA: ${dataPost?.avgResponseMinutes?.toFixed(1) ?? '-'}`,
      `Tiempo acción correctiva (min) - Sin LORE-IA: ${dataPre?.avgActionMinutes?.toFixed(1) ?? '-'} | Con LORE-IA: ${dataPost?.avgActionMinutes?.toFixed(1) ?? '-'}`,
      `Horas paralización - Sin LORE-IA: ${dataPre?.downtimeHours?.toFixed(1) ?? '-'} | Con LORE-IA: ${dataPost?.downtimeHours?.toFixed(1) ?? '-'}`,
      '',
      'ALERTAS POR NIVEL:',
      '------------------',
      `BAJO - Sin LORE-IA: ${dataPre?.countsByLevel?.BAJO ?? 0} | Con LORE-IA: ${dataPost?.countsByLevel?.BAJO ?? 0}`,
      `MEDIO - Sin LORE-IA: ${dataPre?.countsByLevel?.MEDIO ?? 0} | Con LORE-IA: ${dataPost?.countsByLevel?.MEDIO ?? 0}`,
      `ALTO - Sin LORE-IA: ${dataPre?.countsByLevel?.ALTO ?? 0} | Con LORE-IA: ${dataPost?.countsByLevel?.ALTO ?? 0}`,
      `CRÍTICO - Sin LORE-IA: ${dataPre?.countsByLevel?.['CRÍTICO'] ?? 0} | Con LORE-IA: ${dataPost?.countsByLevel?.['CRÍTICO'] ?? 0}`,
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const projectName = projects.find(p => String(p.id) === projectId)?.name || 'todos'
    a.download = `comparacion_pre_post_${projectName}_${new Date().toISOString().slice(0,10)}.txt`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.URL.revokeObjectURL(url)
  }

  const preCounts = dataPre?.countsByLevel ?? {}
  const postCounts = dataPost?.countsByLevel ?? {}

  const chartLevelsData = useMemo(() => {
    const levels = ['BAJO', 'MEDIO', 'ALTO', 'CRÍTICO']
    return levels.map((level) => ({
      level,
      PRE: preCounts[level] ?? 0,
      POST: postCounts[level] ?? 0,
    }))
  }, [preCounts, postCounts])

  const chartMetricsData = useMemo(() => {
    return [
      { name: 'Alertas', PRE: dataPre?.totalAlerts ?? 0, POST: dataPost?.totalAlerts ?? 0 },
      { name: 'Reconocidas', PRE: dataPre?.acknowledgedAlerts ?? 0, POST: dataPost?.acknowledgedAlerts ?? 0 },
      { name: 'Acciones', PRE: dataPre?.respondedAlerts ?? 0, POST: dataPost?.respondedAlerts ?? 0 },
      { name: 'Paralización (h)', PRE: Number(dataPre?.downtimeHours ?? 0), POST: Number(dataPost?.downtimeHours ?? 0) },
    ]
  }, [dataPre, dataPost])

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 40 }}>
      <style>{`
        .premium-card { background: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -2px rgba(0,0,0,0.02); }
        .premium-input:focus { background: #ffffff !important; border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1) !important; }
        .btn-action { padding: 8px 14px; border-radius: 10px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: 13px; transition: all 0.2s; border: none; }
        .btn-txt { background: #f8fafc; color: #475569; border: 1px solid #e2e8f0; } .btn-txt:hover { background: #f1f5f9; }
        .btn-csv { background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; } .btn-csv:hover { background: #d1fae5; }
        .btn-pdf { background: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe; box-shadow: 0 2px 8px rgba(79,70,229,0.15); } .btn-pdf:hover { background: #e0e7ff; transform: translateY(-1px); }
        .icon-box { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: #eef2ff; border: 1px solid #c7d2fe; color: #4f46e5; }
        .table-row { transition: all 0.2s; border-bottom: 1px solid #f8fafc; }
        .table-row:hover { background: #f8fafc; }
        .recharts-cartesian-grid-horizontal line, .recharts-cartesian-grid-vertical line { stroke: #e2e8f0; }
        .page-btn { padding: 6px 12px; border-radius: 8px; border: 1px solid #e2e8f0; background: #ffffff; color: #475569; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
        .page-btn:hover:not(:disabled) { background: #f1f5f9; }
        .page-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .page-btn.active { background: #4f46e5; color: #ffffff; border-color: #4f46e5; }
      `}</style>

      <section className="premium-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className="icon-box">
              <BarChart2 size={24} strokeWidth={2} />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>Reporte de Eficiencia (Sin / Con LORE-IA)</div>
              <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500, marginTop: 4 }}>
                Métricas comparativas antes y después de implementar LORE-IA en obra.
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-end', background: '#f8fafc', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 12, color: '#475569', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Filtro de Proyecto:</div>
              <select className="premium-input" value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid #cbd5e1', background: '#ffffff', fontWeight: 500, outline: 'none', cursor: 'pointer', minWidth: 240 }}>
                <option value="">Todos los proyectos (Global)</option>
                {projects.map((p) => (
                  <option key={p.id} value={String(p.id)}>{p.name}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn-action btn-txt" onClick={downloadComparisonTxt} disabled={!dataPre && !dataPost}>
                <FileText size={15} strokeWidth={2} /> TXT
              </button>
              <button className="btn-action btn-csv" onClick={downloadCsv}>
                <FileSpreadsheet size={15} strokeWidth={2} /> CSV
              </button>
              <button className="btn-action btn-pdf" onClick={downloadPdf}>
                <Download size={15} strokeWidth={2} /> Exportar PDF Académico
              </button>
            </div>
          </div>
        </div>

        {error ? <div style={{ marginTop: 20, padding: '16px 20px', borderRadius: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}><AlertTriangle size={18}/> {error}</div> : null}
        {loading ? <div style={{ marginTop: 20, padding: '16px', textAlign: 'center', color: '#64748b', fontWeight: 800, background: '#f8fafc', borderRadius: 16 }}>Calculando métricas...</div> : null}
      </section>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
        <section className="premium-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <AlertTriangle size={18} color="#ea580c" /> Distribución de Alertas por Riesgo
          </div>
          <div ref={chartLevelsRef} style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartLevelsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="level" tick={{ fill: '#64748b', fontWeight: 500, fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fill: '#64748b', fontWeight: 500, fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontWeight: 500 }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: 20, fontWeight: 500, fontSize: 13 }} />
                <Bar dataKey="PRE" name="Sin LORE-IA" fill="#94a3b8" radius={[6, 6, 0, 0]} maxBarSize={40} />
                <Bar dataKey="POST" name="Con LORE-IA" fill="#4f46e5" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="premium-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
            <TrendingUp size={18} color="#10b981" /> Resumen de Impacto Operativo
          </div>
          <div ref={chartMetricsRef} style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartMetricsData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontWeight: 500, fontSize: 12 }} axisLine={false} tickLine={false} dy={10} />
                <YAxis tick={{ fill: '#64748b', fontWeight: 500, fontSize: 12 }} axisLine={false} tickLine={false} dx={-10} />
                <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', fontWeight: 500 }} />
                <Legend iconType="circle" wrapperStyle={{ paddingTop: 20, fontWeight: 500, fontSize: 13 }} />
                <Bar dataKey="PRE" name="Sin LORE-IA" fill="#94a3b8" radius={[6, 6, 0, 0]} maxBarSize={40} />
                <Bar dataKey="POST" name="Con LORE-IA" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>

      <div style={{ display: 'grid', gap: 24, gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))' }}>
        <section className="premium-card" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 600, fontSize: 16, color: '#64748b', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#94a3b8' }}></div> Fase Control (Sin LORE-IA)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <Card title="Alertas Totales" value={dataPre?.totalAlerts ?? '-'} hint={<>Reconocidas: <b style={{color: '#0f172a'}}>{dataPre?.acknowledgedAlerts ?? '-'}</b></>} icon={AlertTriangle} />
            <Card title="Eficiencia Respuesta" value={dataPre?.avgResponseMinutes != null ? `${Number(dataPre.avgResponseMinutes).toFixed(1)} min` : '-'} icon={Clock} />
            <Card title="Índice Mitigación" value={`${dataPre?.respondedPct?.toFixed(0) ?? '-'}%`} hint={<>Acciones: <b style={{color: '#0f172a'}}>{dataPre?.respondedAlerts ?? '-'}</b></>} icon={ShieldCheck} />
            <Card title="Downtime Horas" value={dataPre?.downtimeHours != null ? `${Number(dataPre.downtimeHours).toFixed(1)} h` : '-'} icon={TrendingDown} />
          </div>
        </section>

        <section className="premium-card" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, right: 0, width: 200, height: 200, background: 'radial-gradient(circle, rgba(16,185,129,0.1) 0%, rgba(255,255,255,0) 70%)', transform: 'translate(30%, -30%)' }}></div>
          <div style={{ fontWeight: 600, fontSize: 16, color: '#059669', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, position: 'relative' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px rgba(16,185,129,0.6)' }}></div> Fase Experimental (Con LORE-IA)
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, position: 'relative' }}>
            <Card title="Alertas Totales" value={dataPost?.totalAlerts ?? '-'} hint={<>Reconocidas: <b style={{color: '#0f172a'}}>{dataPost?.acknowledgedAlerts ?? '-'}</b></>} icon={AlertTriangle} />
            <Card title="Eficiencia Respuesta" value={dataPost?.avgResponseMinutes != null ? `${Number(dataPost.avgResponseMinutes).toFixed(1)} min` : '-'} icon={Clock} />
            <Card title="Índice Mitigación" value={`${dataPost?.respondedPct?.toFixed(0) ?? '-'}%`} hint={<>Acciones: <b style={{color: '#0f172a'}}>{dataPost?.respondedAlerts ?? '-'}</b></>} icon={ShieldCheck} />
            <Card title="Paralización Evitada" value={dataPost?.downtimeHours != null && dataPre?.downtimeHours != null ? `↓ ${(dataPre.downtimeHours - dataPost.downtimeHours).toFixed(1)} h` : '-'} hint={<>Actual: <b style={{color: '#059669'}}>{dataPost?.downtimeHours != null ? Number(dataPost.downtimeHours).toFixed(1) : '-'} h</b></>} icon={CheckCircle} />
          </div>
        </section>
      </div>

      <section className="premium-card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 24, borderBottom: '1px solid #e2e8f0', background: '#fafaf9' }}>
          <div style={{ fontWeight: 600, fontSize: 16, color: '#0f172a' }}>Cuadro Comparativo Detallado</div>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500, marginTop: 4 }}>Demostración objetiva del incremento en la Eficiencia Operativa (Sin vs Con LORE-IA)</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                <th style={{ padding: '16px 20px', textAlign: 'left', fontWeight: 600, color: '#475569', textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.5, borderBottom: '2px solid #cbd5e1' }}>Indicador de Rendimiento</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.5, borderBottom: '2px solid #cbd5e1', background: '#f8fafc', width: '20%' }}>Sin LORE-IA</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 600, color: '#059669', textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.5, borderBottom: '2px solid #10b981', background: '#f0fdf4', width: '20%' }}>Con LORE-IA</th>
                <th style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 600, color: '#475569', textTransform: 'uppercase', fontSize: 12, letterSpacing: 0.5, borderBottom: '2px solid #cbd5e1', width: '15%' }}>Variación (%)</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: 'Frecuencia de Alertas Geotécnicas', pre: dataPre?.totalAlerts, post: dataPost?.totalAlerts },
                { label: 'Tasa de Reconocimiento Operativo', pre: dataPre?.acknowledgedAlerts, post: dataPost?.acknowledgedAlerts },
                { label: 'Índice de Mitigación (Acciones Correctivas)', pre: dataPre?.respondedPct, post: dataPost?.respondedPct, unit: '%' },
                { label: 'Eficiencia en Tiempo de Respuesta Analítica', pre: dataPre?.avgResponseMinutes, post: dataPost?.avgResponseMinutes, unit: ' min' },
                { label: 'Tiempo de Ejecución de Medidas Correctivas', pre: dataPre?.avgActionMinutes, post: dataPost?.avgActionMinutes, unit: ' min' },
                { label: 'Horas Acumuladas de Paralización Constructiva', pre: dataPre?.downtimeHours, post: dataPost?.downtimeHours, unit: ' h' },
              ].slice((page - 1) * limitPerPage, page * limitPerPage).map((r, i) => (
                <ComparisonRow key={i} label={r.label} pre={r.pre} post={r.post} unit={r.unit} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {true && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
              Mostrando <b style={{ color: '#0f172a' }}>{Math.min((page - 1) * limitPerPage + 1, 6)}</b> - <b style={{ color: '#0f172a' }}>{Math.min(page * limitPerPage, 6)}</b> de <b style={{ color: '#0f172a' }}>6</b> resultados
            </div>
            
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}> Anterior </button>
              {Array.from({ length: Math.ceil(6 / limitPerPage) }, (_, i) => i + 1).map(p => (
                <button key={p} className={`page-btn ${page === p ? 'active' : ''}`} onClick={() => setPage(p)}> {p} </button>
              ))}
              <button className="page-btn" onClick={() => setPage(p => Math.min(Math.ceil(6 / limitPerPage), p + 1))} disabled={page >= Math.ceil(6 / limitPerPage)}> Siguiente </button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
