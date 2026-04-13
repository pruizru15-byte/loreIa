import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ackAlert,
  connectAlerts,
  createParalizacionEvent,
  createProjectActivity,
  deleteProjectActivity,
  fetchProjectAlerts,
  fetchProjectActivities,
  fetchProjectById,
  fetchProjectGeotech,
  fetchProjectParalizaciones,
  fetchReportSummary,
  fetchZones,
  respondToAlert,
  resolveAlert,
  startProjectBaseline,
  stopParalizacionEvent,
  updateProjectActivity,
  updateProject,
} from '../lib/api'
import { useToasts } from '../components/ToastHost'
import './ProjectPage.css'

function badge(level) {
  const map = {
    BAJO: { bg: '#dcfce7', fg: '#166534' },
    MEDIO: { bg: '#fef9c3', fg: '#854d0e' },
    ALTO: { bg: '#ffedd5', fg: '#9a3412' },
    'CRÍTICO': { bg: '#fee2e2', fg: '#991b1b' },
  }
  return map[level] ?? { bg: '#f1f5f9', fg: '#475569' }
}

function Card({ title, value, hint, right }) {
  return (
    <div className="premium-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
        <div className="card-title">{title}</div>
        {right}
      </div>
      <div className="card-value">{value}</div>
      {hint ? <div className="card-hint">{hint}</div> : null}
    </div>
  )
}

function fmtDate(x) {
  if (!x) return '-'
  try {
    return new Date(x).toLocaleString()
  } catch {
    return String(x)
  }
}

export default function ProjectPage() {
  const { id } = useParams()
  const projectId = Number(id)
  const toasts = useToasts()

  const [project, setProject] = useState(null)
  const [zones, setZones] = useState([])
  const [geotech, setGeotech] = useState([])
  const [alerts, setAlerts] = useState([])
  const [summaryBoth, setSummaryBoth] = useState(null)
  const [summaryPre, setSummaryPre] = useState(null)
  const [summaryPost, setSummaryPost] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [busy, setBusy] = useState('')

  const [responseDraft, setResponseDraft] = useState({})

  const [paralizaciones, setParalizaciones] = useState([])
  const [activeParalizacion, setActiveParalizacion] = useState(null)
  const [paralizacionTick, setParalizacionTick] = useState(0)

  const [activities, setActivities] = useState([])
  const [actName, setActName] = useState('')
  const [actPlannedStart, setActPlannedStart] = useState('')
  const [actPlannedEnd, setActPlannedEnd] = useState('')

  const [pzZoneId, setPzZoneId] = useState('')
  const [pzNotes, setPzNotes] = useState('')

  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetDraft, setBudgetDraft] = useState('')

  const [alertsPage, setAlertsPage] = useState(1)
  const [selectedAlertForModal, setSelectedAlertForModal] = useState(null)
  
  const ALERTS_PER_PAGE = 5

  const lastAlert = useMemo(() => {
    const sorted = [...(alerts ?? [])].sort((a, b) => Number(b.id) - Number(a.id))
    return sorted[0] ?? null
  }, [alerts])

  async function load() {
    if (!Number.isFinite(projectId)) {
      setError('Invalid projectId')
      return
    }

    setLoading(true)
    setError('')

    try {
      const [p, z, g, a, sBoth, sPre, sPost, pz, acts] = await Promise.all([
        fetchProjectById(projectId),
        fetchZones(projectId),
        fetchProjectGeotech(projectId),
        fetchProjectAlerts(projectId, 1000),
        fetchReportSummary({ mode: 'both', projectId }),
        fetchReportSummary({ mode: 'pre', projectId }),
        fetchReportSummary({ mode: 'post', projectId }),
        fetchProjectParalizaciones(projectId),
        fetchProjectActivities(projectId, { limit: 2000 }),
      ])

      setProject(p)
      setZones(z.items ?? [])
      setGeotech(g.items ?? [])
      setAlerts(a.items ?? [])
      setSummaryBoth(sBoth)
      setSummaryPre(sPre)
      setSummaryPost(sPost)
      setParalizaciones(pz.items ?? [])
      setActivities(acts.items ?? [])
      const active = (pz.items ?? []).find((x) => x.isActive) ?? null
      setActiveParalizacion(active)
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
    if (!Number.isFinite(projectId)) return
    const disconnect = connectAlerts((msg) => {
      if (msg?.type !== 'risk_alert') return
      const p = msg?.payload
      if (!p?.alertId || Number(p.projectId) !== projectId) return

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

      Promise.all([
        fetchReportSummary({ mode: 'both', projectId }),
        fetchReportSummary({ mode: 'pre', projectId }),
        fetchReportSummary({ mode: 'post', projectId }),
      ])
        .then(([sBoth, sPre, sPost]) => {
          setSummaryBoth(sBoth)
          setSummaryPre(sPre)
          setSummaryPost(sPost)
        })
        .catch(() => {})
    })

    return () => disconnect?.()
  }, [projectId])

  useEffect(() => {
    if (!activeParalizacion) return
    const interval = setInterval(() => setParalizacionTick((t) => t + 1), 60000)
    return () => clearInterval(interval)
  }, [activeParalizacion])

  async function doAck(alertId) {
    setBusy('ack')
    try {
      await ackAlert(alertId)
      toasts.push({ level: 'MEDIO', title: 'Alerta reconocida', message: `Alerta #${alertId} marcada como reconocida.` })
      await load()
    } catch (e) {
      toasts.push({ level: 'CRÍTICO', title: 'Error', message: e?.message ?? 'Error' })
    } finally {
      setBusy('')
    }
  }

  async function doCreateActivity() {
    const name = actName.trim()
    if (!name) {
      toasts.push({ level: 'CRÍTICO', title: 'Falta nombre', message: 'Escribe el nombre de la actividad.' })
      return
    }
    setBusy('activity-create')
    try {
      await createProjectActivity(projectId, {
        name,
        plannedStart: actPlannedStart ? new Date(actPlannedStart).toISOString() : null,
        plannedEnd: actPlannedEnd ? new Date(actPlannedEnd).toISOString() : null,
        status: 'PENDIENTE',
        progressPct: 0,
      })
      setActName('')
      setActPlannedStart('')
      setActPlannedEnd('')
      const acts = await fetchProjectActivities(projectId, { limit: 2000 })
      setActivities(acts.items ?? [])
      toasts.push({ level: 'MEDIO', title: 'Actividad creada', message: 'Actividad registrada.' })
    } catch (e) {
      toasts.push({ level: 'CRÍTICO', title: 'Error', message: e?.message ?? 'Error' })
    } finally {
      setBusy('')
    }
  }

  async function doUpdateActivity(activityId, patch) {
    setBusy('activity-update')
    try {
      await updateProjectActivity(projectId, activityId, patch)
      const acts = await fetchProjectActivities(projectId, { limit: 2000 })
      setActivities(acts.items ?? [])
    } catch (e) {
      toasts.push({ level: 'CRÍTICO', title: 'Error', message: e?.message ?? 'Error' })
    } finally {
      setBusy('')
    }
  }

  async function doDeleteActivity(activityId) {
    setBusy('activity-delete')
    try {
      await deleteProjectActivity(projectId, activityId)
      setActivities((prev) => (prev ?? []).filter((x) => Number(x.id) !== Number(activityId)))
      toasts.push({ level: 'MEDIO', title: 'Actividad eliminada', message: `Actividad #${activityId} eliminada.` })
    } catch (e) {
      toasts.push({ level: 'CRÍTICO', title: 'Error', message: e?.message ?? 'Error' })
    } finally {
      setBusy('')
    }
  }

  async function doResolve(alertId) {
    setBusy('resolve')
    try {
      await resolveAlert(alertId)
      toasts.push({ level: 'MEDIO', title: 'Alerta resuelta', message: `Alerta #${alertId} marcada como resuelta.` })
      await load()
    } catch (e) {
      toasts.push({ level: 'CRÍTICO', title: 'Error', message: e?.message ?? 'Error' })
    } finally {
      setBusy('')
    }
  }

  async function doRespond(alertId) {
    const action = (responseDraft?.[String(alertId)] ?? '').trim()
    if (!action) {
      toasts.push({ level: 'CRÍTICO', title: 'Falta acción', message: 'Escribe la acción correctiva antes de registrar la respuesta.' })
      return
    }
    setBusy('respond')
    try {
      await respondToAlert(alertId, action)
      toasts.push({ level: 'MEDIO', title: 'Respuesta registrada', message: `Acción correctiva guardada para alerta #${alertId}.` })
      setResponseDraft((prev) => {
        const next = { ...(prev ?? {}) }
        delete next[String(alertId)]
        return next
      })
      await load()
    } catch (e) {
      toasts.push({ level: 'CRÍTICO', title: 'Error', message: e?.message ?? 'Error' })
    } finally {
      setBusy('')
    }
  }

  async function doStartBaseline() {
    setBusy('baseline')
    try {
      const r = await startProjectBaseline(projectId)
      toasts.push({ level: 'MEDIO', title: 'Baseline iniciado', message: `Baseline POST iniciado: ${fmtDate(r.baselineStartAt)}` })
      await load()
    } catch (e) {
      toasts.push({ level: 'CRÍTICO', title: 'Error', message: e?.message ?? 'Error' })
    } finally {
      setBusy('')
    }
  }

  async function doStartParalizacion() {
    setBusy('paralizacion')
    try {
      const payload = {
        zoneId: pzZoneId ? Number(pzZoneId) : null,
        notes: pzNotes || null,
      }
      const r = await createParalizacionEvent(projectId, payload)
      toasts.push({ level: 'CRÍTICO', title: 'Paralización iniciada', message: `ID ${r.id} iniciada: ${fmtDate(r.startedAt)}` })
      setPzNotes('')
      await load()
    } catch (e) {
      toasts.push({ level: 'CRÍTICO', title: 'Error', message: e?.message ?? 'Error' })
    } finally {
      setBusy('')
    }
  }

  async function doStopParalizacion() {
    if (!activeParalizacion) return
    setBusy('stop-paralizacion')
    try {
      const payload = {
        notes: pzNotes || null,
      }
      const r = await stopParalizacionEvent(projectId, activeParalizacion.id, payload)
      toasts.push({ level: 'MEDIO', title: 'Paralización finalizada', message: `Duración: ${r.durationHours} horas` })
      setPzNotes('')
      await load()
    } catch (e) {
      toasts.push({ level: 'CRÍTICO', title: 'Error', message: e?.message ?? 'Error' })
    } finally {
      setBusy('')
    }
  }

  async function doUpdateBudget() {
    const val = Number(budgetDraft)
    if (!Number.isFinite(val) || val < 0) {
      toasts.push({ level: 'CRÍTICO', title: 'Error', message: 'Presupuesto inválido' })
      return
    }
    setBusy('budget')
    try {
      await updateProject(projectId, { actualBudget: val })
      toasts.push({ level: 'MEDIO', title: 'Presupuesto actualizado', message: `Presupuesto real: $${val.toLocaleString()}` })
      setEditingBudget(false)
      await load()
    } catch (e) {
      toasts.push({ level: 'CRÍTICO', title: 'Error', message: e?.message ?? 'Error' })
    } finally {
      setBusy('')
    }
  }

  function daysBetween(a, b) {
    if (!a || !b) return null
    const ms = new Date(b).getTime() - new Date(a).getTime()
    return Math.round(ms / 86400000)
  }

  function formatCurrency(n) {
    if (n == null) return '-'
    return `$${Number(n).toLocaleString()}`
  }

  const plannedBudget = project?.plannedBudget ?? 0
  const actualBudget = project?.actualBudget ?? 0
  const budgetPct = plannedBudget > 0 ? (actualBudget / plannedBudget) * 100 : 0
  const budgetVariance = actualBudget - plannedBudget

  const plannedDays = daysBetween(project?.plannedStart, project?.plannedEnd)
  const actualDays = daysBetween(project?.plannedStart, project?.actualEnd ?? new Date().toISOString())
  const scheduleVariance = plannedDays != null && actualDays != null ? actualDays - plannedDays : null

  const counts = summaryBoth?.countsByLevel ?? {}

  return (
    <div className="project-page-container">
      <section className="project-header">
        <div>
          <div className="project-header-title">{project?.name ?? 'Proyecto'}</div>
          <div className="project-header-subtitle">
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
              Proyecto ID: {Number.isFinite(projectId) ? projectId : '-'}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
              Baseline POST: {fmtDate(project?.baselineStartAt)}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className="btn btn-outline"
            onClick={load}
            disabled={loading || !!busy}
          >
            Actualizar
          </button>

          <button
            className="btn btn-primary"
            onClick={doStartBaseline}
            disabled={loading || !!busy || !!project?.baselineStartAt}
          >
            Iniciar baseline POST
          </button>

          <Link to="/mapa" className="btn btn-outline" style={{ textDecoration: 'none' }}>
            Volver al mapa
          </Link>
        </div>

        {error ? (
          <div style={{ width: '100%', marginTop: 4, padding: 12, borderRadius: 12, background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>
        ) : null}

        {loading ? <div style={{ width: '100%', marginTop: 4, fontSize: 13, color: '#94a3b8' }}>Cargando datos del proyecto...</div> : null}
      </section>

      <div className="grid-cards">
        <Card title="Riesgo actual" value={lastAlert?.riskLevel ?? 'BAJO'} hint={lastAlert ? `Última evaluación: ${fmtDate(lastAlert.createdAt)}` : 'Sin alertas aún'} right={<span className="badge-status" style={{ background: badge(lastAlert?.riskLevel ?? 'BAJO').bg, color: badge(lastAlert?.riskLevel ?? 'BAJO').fg }}>{lastAlert?.riskLevel ?? 'BAJO'}</span>} />
        <Card
          title="Alertas totales"
          value={summaryBoth?.totalAlerts ?? '-'}
          hint={`Reconocidas: ${summaryBoth?.acknowledgedAlerts ?? '-'}`}
        />
        <Card
          title="Tiempo respuesta prom."
          value={summaryBoth?.avgResponseMinutes != null ? `${Number(summaryBoth.avgResponseMinutes).toFixed(1)} min` : '-'}
          hint="createdAt → acknowledgedAt"
        />
        <Card
          title="Continuidad (paralización)"
          value={summaryBoth?.downtimeHours != null ? `${Number(summaryBoth.downtimeHours).toFixed(1)} hrs` : '-'}
          hint="Eventos activos e inactivos"
        />
      </div>

      <section className="premium-section">
        <div className="section-title">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          Alertas por nivel
        </div>
        <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {['BAJO', 'MEDIO', 'ALTO', 'CRÍTICO'].map(level => (
            <div key={level} style={{ flex: 1, minWidth: 120, border: `1px solid ${badge(level).bg}`, background: badge(level).bg, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: badge(level).fg }}>{level}</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: badge(level).fg, marginTop: 4 }}>{counts[level] ?? 0}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="premium-section">
        <div className="section-title">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>
          KPIs PRE vs POST (por baseline)
        </div>
        <div style={{ marginTop: 16 }} className="grid-2">
          <Card title="Alertas PRE / Downtime" value={summaryPre?.totalAlerts ?? '-'} hint={`Downtime (h): ${summaryPre?.downtimeHours != null ? Number(summaryPre.downtimeHours).toFixed(1) : '-'}`} />
          <Card title="Alertas POST / Downtime" value={summaryPost?.totalAlerts ?? '-'} hint={`Downtime (h): ${summaryPost?.downtimeHours != null ? Number(summaryPost.downtimeHours).toFixed(1) : '-'}`} />
        </div>
      </section>

      <section className="premium-section">
        <div className="section-title">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          Presupuesto y Cronograma
        </div>
        <div style={{ marginTop: 16 }} className="grid-2">
          <Card 
            title="Presupuesto Planificado" 
            value={formatCurrency(plannedBudget)} 
            hint={budgetVariance !== 0 ? `Variación: ${budgetVariance > 0 ? '+' : ''}${formatCurrency(budgetVariance)}` : 'En línea con plan'}
          />
          <Card 
            title="Presupuesto Real" 
            value={editingBudget ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  value={budgetDraft}
                  onChange={(e) => setBudgetDraft(e.target.value)}
                  placeholder="0"
                  className="premium-input"
                  style={{ width: 140, padding: '8px 12px' }}
                />
                <button 
                  onClick={doUpdateBudget}
                  disabled={!!busy}
                  className="btn btn-success btn-small"
                >
                  Guardar
                </button>
                <button 
                  onClick={() => setEditingBudget(false)}
                  className="btn btn-outline btn-small"
                  style={{ color: '#64748b', borderColor: '#cbd5e1' }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{formatCurrency(actualBudget)}</span>
                <button 
                  onClick={() => { setEditingBudget(true); setBudgetDraft(String(actualBudget || 0)) }}
                  className="btn btn-edit btn-small"
                >
                  Editar
                </button>
              </div>
            )}
            right={
              <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 500, color: budgetVariance > plannedBudget * 0.1 ? '#ef4444' : '#10b981' }}>
                {budgetPct.toFixed(1)}%
              </div>
            }
            hint={
              <div className="progress-container">
                <div 
                  className={`progress-bar ${budgetVariance > plannedBudget * 0.1 ? 'overbudget' : ''}`} 
                  style={{ width: `${Math.min(budgetPct, 100)}%` }}
                />
              </div>
            }
          />
          <Card 
            title="Duración Planificada" 
            value={plannedDays != null ? `${plannedDays} días` : '-'} 
            hint={`Inicio: ${fmtDate(project?.plannedStart)} → Fin: ${fmtDate(project?.plannedEnd)}`}
          />
          <Card 
            title="Duración Real / Actual" 
            value={actualDays != null ? `${actualDays} días` : '-'} 
            hint={scheduleVariance != null ? `Desviación: ${scheduleVariance > 0 ? '+' : ''}${scheduleVariance} días` : 'Sin datos'}
          />
        </div>
        <div style={{ marginTop: 20, padding: 16, borderRadius: 16, background: budgetVariance > plannedBudget * 0.1 ? '#fef2f2' : scheduleVariance > 7 ? '#fefce8' : '#f0fdf4', border: '1px solid ' + (budgetVariance > plannedBudget * 0.1 ? '#fca5a5' : scheduleVariance > 7 ? '#fef08a' : '#bbf7d0'), display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 24 }}>
            {budgetVariance > plannedBudget * 0.1 ? '⚠️' : scheduleVariance > 7 ? '⏱️' : '✅'}
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: budgetVariance > plannedBudget * 0.1 ? '#991b1b' : scheduleVariance > 7 ? '#854d0e' : '#166534' }}>
            {budgetVariance > plannedBudget * 0.1 ? 'Foco de Atención: Sobrecosto significativo (>10% del planificado)' : scheduleVariance > 7 ? 'Retraso en cronograma detectado' : 'Proyecto avanzando dentro de los parámetros normales de presupuesto y cronograma.'}
          </div>
        </div>
      </section>

      <section className="premium-section">
        <div className="section-title">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"></path></svg>
          Actividades (planificadas vs ejecutadas)
        </div>
        <div style={{ marginTop: 16, display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 12, border: '1px solid #eef2f6', padding: 20, borderRadius: 16, background: '#f8fafc' }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#64748b' }}>Nueva Actividad</div>
            <input
              value={actName}
              onChange={(e) => setActName(e.target.value)}
              placeholder="Nombre de actividad (ej: Excavación, Cimentación...)"
              className="premium-input"
            />
            <div className="grid-2">
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Inicio planificado</div>
                <input
                  type="datetime-local"
                  value={actPlannedStart}
                  onChange={(e) => setActPlannedStart(e.target.value)}
                  className="premium-input"
                />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Fin planificado</div>
                <input
                  type="datetime-local"
                  value={actPlannedEnd}
                  onChange={(e) => setActPlannedEnd(e.target.value)}
                  className="premium-input"
                />
              </div>
            </div>
            <button
              onClick={doCreateActivity}
              disabled={loading || !!busy}
              className="btn btn-dark"
              style={{ justifySelf: 'start', marginTop: 4 }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"></path></svg>
              Crear actividad
            </button>
          </div>

          {activities.length === 0 ? <div style={{ fontSize: 13, color: '#94a3b8', padding: '20px 0', textAlign: 'center' }}>Sin actividades registradas en el cronograma.</div> : null}

          {activities.slice().reverse().slice(0, 25).map((a) => (
            <div key={a.id} className="timeline-item" data-status={a.status}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>{a.name}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>ID: #{a.id}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select
                    value={a.status}
                    onChange={(e) => doUpdateActivity(a.id, { status: e.target.value })}
                    disabled={!!busy}
                    className="premium-input"
                    style={{ padding: '6px 12px', minWidth: 140, fontSize: 12 }}
                  >
                    <option value="PENDIENTE">PENDIENTE</option>
                    <option value="EN_PROGRESO">EN_PROGRESO</option>
                    <option value="COMPLETADA">COMPLETADA</option>
                    <option value="BLOQUEADA">BLOQUEADA</option>
                  </select>
                  <button
                    onClick={() => doDeleteActivity(a.id)}
                    disabled={!!busy}
                    className="btn btn-danger btn-small"
                  >
                    Eliminar
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, fontSize: 12, color: '#64748b', background: '#f8fafc', padding: 12, borderRadius: 10 }}>
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>Planificado</div>
                  <div>{fmtDate(a.plannedStart)} → {fmtDate(a.plannedEnd)}</div>
                </div>
                <div>
                  <div style={{ fontWeight: 500, marginBottom: 4 }}>Real</div>
                  <div>{fmtDate(a.actualStart)} → {fmtDate(a.actualEnd)}</div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#475569', minWidth: 60 }}>Progreso:</div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Number(a.progressPct ?? 0)}
                  onChange={(e) => doUpdateActivity(a.id, { progressPct: Number(e.target.value) })}
                  disabled={!!busy}
                  className="range-slider"
                  style={{ flex: 1, maxWidth: 300 }}
                />
                <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', minWidth: 40 }}>{Number(a.progressPct ?? 0)}%</div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                {a.status !== 'EN_PROGRESO' && a.status !== 'COMPLETADA' && (
                  <button
                    onClick={() => doUpdateActivity(a.id, { actualStart: new Date().toISOString(), status: 'EN_PROGRESO' })}
                    disabled={!!busy}
                    className="btn btn-outline btn-small"
                    style={{ color: '#3b82f6', borderColor: '#bfdbfe' }}
                  >
                    Iniciar actividad
                  </button>
                )}
                {a.status !== 'COMPLETADA' && (
                  <button
                    onClick={() => doUpdateActivity(a.id, { actualEnd: new Date().toISOString(), status: 'COMPLETADA', progressPct: 100 })}
                    disabled={!!busy}
                    className="btn btn-success btn-small"
                  >
                    Completar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="premium-section">
        <div className="section-title">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
          Control de paralización
        </div>
        
        {activeParalizacion ? (
          <div style={{ marginTop: 16, padding: 24, borderRadius: 16, background: '#fef2f2', border: '1px solid #fecaca', boxShadow: '0 4px 12px rgba(239, 68, 68, 0.05)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div className="pulse-ring" style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
                  <div style={{ fontWeight: 600, color: '#b91c1c', fontSize: 16, letterSpacing: '-0.5px' }}>PARALIZACIÓN ACTIVA #{activeParalizacion.id}</div>
                </div>
                <div style={{ fontSize: 13, color: '#991b1b', marginTop: 8, display: 'grid', gap: 4 }}>
                  <div><b>Inicio:</b> {fmtDate(activeParalizacion.startedAt)}</div>
                  <div><b>Zona afectada:</b> {activeParalizacion.zoneId ?? '(Todo el proyecto)'}</div>
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#dc2626', marginTop: 12, lineHeight: 1 }}>
                  {activeParalizacion.durationHours} hrs
                  <span style={{ fontSize: 14, fontWeight: 500, marginLeft: 8, color: '#ef4444' }}>({activeParalizacion.durationMinutes} min)</span>
                </div>
              </div>
              <button
                onClick={doStopParalizacion}
                disabled={!!busy}
                className="btn btn-danger"
                style={{ padding: '12px 20px', fontSize: 15 }}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"></path></svg>
                Detener paralización
              </button>
            </div>
            <div style={{ marginTop: 20 }}>
              <input
                value={pzNotes}
                onChange={(e) => setPzNotes(e.target.value)}
                placeholder="Notas de cierre (motivo verificado, acciones tomadas para resolver...)"
                className="premium-input"
                style={{ borderColor: '#fca5a5', background: 'white' }}
              />
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 16, display: 'grid', gap: 16, padding: 20, borderRadius: 16, background: '#f8fafc', border: '1px solid #eef2f6' }}>
            <div className="grid-2">
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Zona afectada (opcional)</div>
                <select
                  value={pzZoneId}
                  onChange={(e) => setPzZoneId(e.target.value)}
                  className="premium-input"
                >
                  <option value="">(Todo el proyecto)</option>
                  {zones.map((z) => (
                    <option key={z.id} value={String(z.id)}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Causa o Notas iniciales</div>
                <input
                  value={pzNotes}
                  onChange={(e) => setPzNotes(e.target.value)}
                  placeholder="Motivo (riesgo colapso, clima...)"
                  className="premium-input"
                />
              </div>
            </div>

            <button
              onClick={doStartParalizacion}
              disabled={loading || !!busy}
              className="btn btn-danger"
              style={{ justifySelf: 'start' }}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              Iniciar paralización
            </button>
          </div>
        )}

        {paralizaciones.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#64748b', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Historial del proyecto</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {paralizaciones.slice(0, 10).map((pz) => (
                <div key={pz.id} style={{ padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>ID: #{pz.id} {pz.isActive ? <span style={{color:'#ef4444', marginLeft: 4}}>(ACTIVA)</span> : null}</span>
                    <span style={{ fontWeight: 500, color: '#475569' }}>{pz.durationHours} horas</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span><b>Periodo:</b> {fmtDate(pz.startedAt)} {pz.endedAt ? `→ ${fmtDate(pz.endedAt)}` : '→ Presente'}</span>
                    {pz.zoneId ? <span><b>Zona:</b> {zones.find(z => z.id === pz.zoneId)?.name ?? pz.zoneId}</span> : null}
                  </div>
                  {pz.notes ? <div style={{ fontSize: 13, color: '#334155', marginTop: 4, background: '#f1f5f9', padding: '6px 10px', borderRadius: 6 }}>{pz.notes}</div> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="premium-section">
        <div className="section-title">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
          Perfiles geotécnicos (últimos registros)
        </div>
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {geotech.length === 0 ? <div style={{ fontSize: 13, color: '#94a3b8', gridColumn: '1 / -1' }}>Sin perfiles geotécnicos registrados.</div> : null}
          {geotech.slice().reverse().slice(0, 10).map((g) => (
            <div key={g.id} className="timeline-item" style={{ padding: 16 }}>
              <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 15 }}>Zona: {g.zoneId ?? '(Global)'}</div>
              <div style={{ marginTop: 12, fontSize: 13, color: '#475569', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, background: '#f8fafc', padding: 12, borderRadius: 10 }}>
                <div style={{ display: 'grid', gap: 2 }}><span style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase' }}>Tipo suelo</span> <b style={{ color: '#0f172a' }}>{g.soilType}</b></div>
                <div style={{ display: 'grid', gap: 2 }}><span style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase' }}>Capacidad portante</span> <b style={{ color: '#0f172a' }}>{g.bearingCapacityKpa ?? '-'} kPa</b></div>
                <div style={{ display: 'grid', gap: 2 }}><span style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase' }}>Resistencia corte</span> <b style={{ color: '#0f172a' }}>{g.shearStrengthKpa ?? '-'} kPa</b></div>
                <div style={{ display: 'grid', gap: 2 }}><span style={{ fontSize: 11, fontWeight: 500, color: '#94a3b8', textTransform: 'uppercase' }}>Napa freática</span> <b style={{ color: '#0f172a' }}>{g.waterTableDepthM ?? '-'} m</b></div>
                <div style={{ gridColumn: '1 / -1', marginTop: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, color: '#64748b' }}>Humedad (índice): <b>{g.moistureIndex ?? '-'}</b></span>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>{fmtDate(g.updatedAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="premium-section">
        <div className="section-title">
          <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
          Registro de Alertas (Proyecto)
        </div>
        <div style={{ marginTop: 16, display: 'grid', gap: 12 }}>
          {alerts.length === 0 ? <div style={{ fontSize: 13, color: '#94a3b8', padding: '20px 0', textAlign: 'center' }}>Sin alertas registradas.</div> : null}
          {alerts
            .slice()
            .sort((a, b) => Number(b.id) - Number(a.id))
            .slice((alertsPage - 1) * ALERTS_PER_PAGE, alertsPage * ALERTS_PER_PAGE)
            .map((a) => {
              const b = badge(a.riskLevel)
              return (
                <div key={a.id} className="alert-card" style={{ borderLeft: `4px solid ${b.fg}`, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <div style={{ fontWeight: 600, fontSize: 15, color: '#0f172a' }}>Alerta #{a.id}</div>
                      <span className="badge-status" style={{ background: b.bg, color: b.fg }}>
                        {a.riskLevel}
                      </span>
                      {a.resolvedAt && <span style={{ fontSize: 13, fontWeight: 600, color: '#10b981' }}>✅ Resuelta</span>}
                      {a.acknowledgedAt && !a.resolvedAt && <span style={{ fontSize: 13, fontWeight: 600, color: '#3b82f6' }}>👁️ Reconocida</span>}
                    </div>

                    <button
                      onClick={() => setSelectedAlertForModal(a)}
                      className="btn btn-outline btn-small"
                      style={{ color: '#0f172a', borderColor: '#e2e8f0' }}
                    >
                      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path></svg>
                      Ver / Responder
                    </button>
                  </div>
                  <div style={{ fontSize: 13, color: '#64748b', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    <span><b>Fecha:</b> {fmtDate(a.createdAt)}</span>
                    <span><b>Zona:</b> {a.zoneId ?? 'Global'}</span>
                    <span><b>Score:</b> {a.score}</span>
                  </div>
                </div>
              )
            })}
        </div>
        {alerts.length > ALERTS_PER_PAGE && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, borderTop: '1px solid #eef2f6', paddingTop: 16 }}>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
              Página {alertsPage} de {Math.ceil(alerts.length / ALERTS_PER_PAGE)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button 
                disabled={alertsPage === 1} 
                onClick={() => setAlertsPage(p => p - 1)}
                className="btn btn-outline btn-small"
                style={{ color: '#0f172a', borderColor: '#e2e8f0' }}
              >
                Anterior
              </button>
              <button 
                disabled={alertsPage >= Math.ceil(alerts.length / ALERTS_PER_PAGE)} 
                onClick={() => setAlertsPage(p => p + 1)}
                className="btn btn-outline btn-small"
                style={{ color: '#0f172a', borderColor: '#e2e8f0' }}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </section>

      {selectedAlertForModal && (
        <div className="modal-overlay" onClick={() => setSelectedAlertForModal(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 18, color: '#0f172a' }}>Alerta #{selectedAlertForModal.id}</div>
                <span className="badge-status" style={{ background: badge(selectedAlertForModal.riskLevel).bg, color: badge(selectedAlertForModal.riskLevel).fg }}>
                  {selectedAlertForModal.riskLevel}
                </span>
              </div>
              <button 
                onClick={() => setSelectedAlertForModal(null)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', display: 'flex' }}
              >
                <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
              </button>
            </div>
            
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13, color: '#475569', background: '#f8fafc', padding: 16, borderRadius: 12 }}>
                <div><b style={{ color: '#0f172a' }}>Fecha:</b> {fmtDate(selectedAlertForModal.createdAt)}</div>
                <div><b style={{ color: '#0f172a' }}>Score Analítico:</b> {selectedAlertForModal.score}</div>
                <div><b style={{ color: '#0f172a' }}>Zona afectada:</b> {selectedAlertForModal.zoneId ?? 'Global'}</div>
                <div><b style={{ color: '#0f172a' }}>Recibida por WS:</b> {selectedAlertForModal.source === 'ws' ? 'Sí' : 'No'}</div>
                {selectedAlertForModal.acknowledgedAt && <div style={{ color: '#3b82f6' }}><b>Reconocida el:</b> {fmtDate(selectedAlertForModal.acknowledgedAt)}</div>}
                {selectedAlertForModal.resolvedAt && <div style={{ color: '#10b981' }}><b>Resuelta el:</b> {fmtDate(selectedAlertForModal.resolvedAt)}</div>}
              </div>

              <div style={{ display: 'flex', gap: 12, marginTop: 4 }}>
                <button
                  onClick={() => { doAck(selectedAlertForModal.id); setSelectedAlertForModal(prev => ({...prev, acknowledgedAt: new Date().toISOString()})) }}
                  disabled={!!busy || !!selectedAlertForModal.acknowledgedAt}
                  className="btn btn-outline"
                  style={{ color: '#0f172a', borderColor: '#e2e8f0', flex: 1 }}
                >
                  {selectedAlertForModal.acknowledgedAt ? '✔️ Reconocida' : 'Marcar como Reconocida (ACK)'}
                </button>
                <button
                  onClick={() => { doResolve(selectedAlertForModal.id); setSelectedAlertForModal(prev => ({...prev, resolvedAt: new Date().toISOString()})) }}
                  disabled={!!busy || !!selectedAlertForModal.resolvedAt}
                  className="btn btn-dark"
                  style={{ flex: 1 }}
                >
                  {selectedAlertForModal.resolvedAt ? '✅ Resuelta' : 'Marcar como Resuelta'}
                </button>
              </div>

              <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#0f172a' }}>Acción Correctiva</div>
                {selectedAlertForModal.responseAction ? (
                  <div style={{ fontSize: 13, background: '#f0fdf4', color: '#166534', padding: '16px', borderRadius: 12, border: '1px solid #bbf7d0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, fontWeight: 500 }}>
                      <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
                      Acción aplicada el {fmtDate(selectedAlertForModal.responseAt)}
                    </div>
                    {selectedAlertForModal.responseAction}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <textarea
                      value={responseDraft?.[String(selectedAlertForModal.id)] ?? ''}
                      onChange={(e) => setResponseDraft((prev) => ({ ...(prev ?? {}), [String(selectedAlertForModal.id)]: e.target.value }))}
                      placeholder="Describe la acción correctiva tomada (ej: instalar drenaje adicional, suspender excavación...)"
                      className="premium-input"
                      style={{ minHeight: 100, resize: 'vertical' }}
                    />
                    <button
                      onClick={() => { doRespond(selectedAlertForModal.id); setSelectedAlertForModal(prev => ({...prev, responseAction: responseDraft?.[String(selectedAlertForModal.id)], responseAt: new Date().toISOString()})) }}
                      disabled={!!busy}
                      className="btn btn-primary"
                      style={{ alignSelf: 'flex-start' }}
                    >
                      Guardar acción y registrar
                    </button>
                  </div>
                )}
              </div>

              {(selectedAlertForModal.probableCause || selectedAlertForModal.recommendation) && (
                <div style={{ fontSize: 13, color: '#334155', marginTop: 8, background: '#fffbeb', border: '1px solid #fde68a', padding: 16, borderRadius: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, fontWeight: 600, color: '#b45309' }}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    Análisis del Sistema
                  </div>
                  {selectedAlertForModal.probableCause && <div style={{ marginBottom: 6 }}><b style={{ color: '#78350f' }}>Causa probable:</b> {selectedAlertForModal.probableCause}</div>}
                  {selectedAlertForModal.recommendation && <div><b style={{ color: '#78350f' }}>Recomendación:</b> {selectedAlertForModal.recommendation}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
