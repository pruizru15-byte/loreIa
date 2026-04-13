import { useState, useEffect } from 'react'
import { 
  Activity, Shield, Play, Pause, AlertOctagon,
  Settings, Database, History, Plus, Trash2, 
  RefreshCw, CheckCircle2, AlertTriangle, Info, Clock, ExternalLink, X, Layers, BookOpen
} from 'lucide-react'
import { 
  fetchTelemetry, toggleSentinelMaster, 
  fetchRules, createRule, deleteRule, 
  fetchScanLogs, fetchProjects, updateSentinelProject,
  fetchSoilTypes, explainScanLog
} from '../lib/api'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function AdminSystemControlPage() {
  const [telemetry, setTelemetry] = useState(null)
  const [rules, setRules] = useState([])
  const [logs, setLogs] = useState([])
  const [projects, setProjects] = useState([])
  const [soilTypes, setSoilTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('telemetry')
  const [editingProject, setEditingProject] = useState(null)
  const [viewingLog, setViewingLog] = useState(null)
  const [aiExplanation, setAiExplanation] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)

  // Rule Form State
  const [showAddRule, setShowAddRule] = useState(false)
  const [newRule, setNewRule] = useState({
    soilType: '',
    climateVariable: 'humidity',
    operator: '>',
    thresholdValue: 80,
    resultingRisk: 'ALTO'
  })

  async function loadAll() {
    setLoading(true)
    try {
      const [tData, rData, lData, pData, sData] = await Promise.all([
        fetchTelemetry(),
        fetchRules(),
        fetchScanLogs(50),
        fetchProjects(),
        fetchSoilTypes()
      ])
      setTelemetry(tData)
      setRules(rData.items || [])
      setLogs(lData.items || [])
      setProjects(pData.items || [])
      setSoilTypes(sData.items || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  async function handleToggleMaster() {
    const newVal = !telemetry?.masterActive
    try {
      await toggleSentinelMaster(newVal)
      setTelemetry({ ...telemetry, masterActive: newVal })
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleAddRule(e) {
    e.preventDefault()
    try {
      await createRule(newRule)
      setShowAddRule(false)
      loadAll()
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleDeleteRule(id) {
    if (!confirm('¿Borrar esta regla de riesgo?')) return
    try {
      await deleteRule(id)
      loadAll()
    } catch (e) {
      alert(e.message)
    }
  }

  async function handleUpdateProjectSentinel(projectId, enabled, freq) {
    console.log('[DEBUG] Updating Sentinel:', projectId, 'Enabled:', enabled, 'Freq:', freq)
    // Optimistic update
    setProjects(projects.map(p => p.id === projectId ? { ...p, sentinel_enabled: enabled ? 1 : 0, scan_frequency_minutes: Number(freq || 60) } : p))
    try {
      await updateSentinelProject(projectId, { 
        sentinelEnabled: !!enabled,
        scanFrequencyMinutes: Number(freq || 60) 
      })
      // reload slightly after
      setTimeout(() => loadAll(), 500)
    } catch (e) {
      console.error('[DEBUG] Update Failed:', e)
      alert(e.message)
      loadAll() // revert
    }
  }

  async function handleSaveProjectDetails(e) {
    e.preventDefault()
    console.log('[DEBUG] Saving project details:', editingProject)
    try {
      await updateSentinelProject(editingProject.id, {
        name: editingProject.name,
        sentinelEnabled: editingProject.sentinel_enabled === 1 || editingProject.sentinel_enabled === true,
        scanFrequencyMinutes: Number(editingProject.scan_frequency_minutes || 60)
      })
      console.log('[DEBUG] Save Successful')
      setEditingProject(null)
      loadAll()
    } catch (e) {
      console.error('[DEBUG] Save Failed:', e)
      alert(e.message)
    }
  }

  if (loading && !telemetry) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando Panel de Control Maestro...</div>

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 32 }}>
      
      {/* 1. CABECERA Y TELEMETRÍA (EL LATIDO) */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
              <Activity color="#4f46e5" /> Telemetría del Sistema Centinela
            </h2>
            <p style={{ color: '#64748b', margin: '4px 0 0 0' }}>Monitor en tiempo real del motor de escaneo y auditoría.</p>
          </div>
          <button 
            onClick={loadAll}
            style={{ 
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, 
              background: '#ffffff', border: '1px solid #e2e8f0', cursor: 'pointer', fontWeight: 600, fontSize: 13 
            }}
          >
            <RefreshCw size={16} /> Actualizar Datos
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 20 }}>
          {/* Master Kill Switch Card */}
          <div style={{ padding: 24, borderRadius: 20, background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: telemetry?.masterActive ? '#ecfdf5' : '#fef2f2', display: 'grid', placeItems: 'center' }}>
                <Shield size={24} color={telemetry?.masterActive ? '#10b981' : '#ef4444'} />
              </div>
              <button 
                onClick={handleToggleMaster}
                style={{
                  padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: telemetry?.masterActive ? '#fee2e2' : '#dcfce7',
                  color: telemetry?.masterActive ? '#ef4444' : '#10b981',
                  fontWeight: 800, fontSize: 11, textTransform: 'uppercase'
                }}
              >
                {telemetry?.masterActive ? 'Desactivar Master' : 'Activar Master'}
              </button>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Estado Global</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: telemetry?.masterActive ? '#059669' : '#dc2626' }}>
              {telemetry?.masterActive ? 'ACTIVO' : 'EN PAUSA'}
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>
              Latido: {telemetry?.lastHeartbeat ? format(new Date(telemetry.lastHeartbeat), 'HH:mm:ss', { locale: es }) : 'N/A'}
            </div>
          </div>

          <div style={{ padding: 24, borderRadius: 20, background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <Clock size={24} color="#6366f1" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Captura del Centinela</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}>{telemetry?.activeSentinels || 0} / {telemetry?.monitoredProjects || 0}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Proyectos bajo vigilancia</div>
          </div>

          <div style={{ padding: 24, borderRadius: 20, background: '#ffffff', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' }}>
            <AlertOctagon size={24} color="#f59e0b" style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>Incidencias 24h</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#d97706' }}>{telemetry?.alerts24h || 0}</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8 }}>Alertas generadas automáticamente</div>
          </div>
        </div>
      </section>

      {/* Tabs Selector */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 0 }}>
        <button onClick={() => setTab('rules')} style={{ ...tabBtnStyle, borderBottom: tab === 'rules' ? '2px solid #4f46e5' : 'none', color: tab === 'rules' ? '#4f46e5' : '#64748b' }}>
          <Shield size={16} /> Cerebro: Reglas de Riesgo
        </button>
        <button onClick={() => setTab('projects')} style={{ ...tabBtnStyle, borderBottom: tab === 'projects' ? '2px solid #4f46e5' : 'none', color: tab === 'projects' ? '#4f46e5' : '#64748b' }}>
          <Database size={16} /> Orquestador de Zonas
        </button>
        <button onClick={() => setTab('logs')} style={{ ...tabBtnStyle, borderBottom: tab === 'logs' ? '2px solid #4f46e5' : 'none', color: tab === 'logs' ? '#4f46e5' : '#64748b' }}>
          <History size={16} /> Bitácora de Auditoría
        </button>
        <button onClick={() => setTab('docs')} style={{ ...tabBtnStyle, borderBottom: tab === 'docs' ? '2px solid #4f46e5' : 'none', color: tab === 'docs' ? '#4f46e5' : '#64748b' }}>
          <BookOpen size={16} /> Documentación del Sistema
        </button>
      </div>

      {/* 2. GESTOR DE REGLAS */}
      {tab === 'rules' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Matriz de Umbrales Paramétricos</h3>
              <p style={{ color: '#64748b', fontSize: 13, margin: 4 }}>Define los disparadores automáticos del sistema centinela.</p>
            </div>
            <button 
              onClick={() => setShowAddRule(true)}
              style={{ padding: '10px 16px', background: '#4f46e5', color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Plus size={18} /> Nueva Regla
            </button>
          </div>

          <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={thStyle}>Tipo de Suelo</th>
                  <th style={thStyle}>Variable Climatica</th>
                  <th style={thStyle}>Operador</th>
                  <th style={thStyle}>Umbral</th>
                  <th style={thStyle}>Riesgo Resultante</th>
                  <th style={thStyle}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tdStyle}><span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{rule.soil_type}</span></td>
                    <td style={tdStyle}><span style={{ color: '#6366f1', fontWeight: 700 }}>{rule.climate_variable.toUpperCase()}</span></td>
                    <td style={tdStyle}><span style={{ fontStyle: 'italic' }}>{rule.operator}</span></td>
                    <td style={tdStyle}>{rule.threshold_value} {rule.climate_variable === 'rain' ? 'mm' : '%'}</td>
                    <td style={tdStyle}>
                      <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 800, color: 'white', background: rule.resulting_risk === 'ALTO' ? '#ef4444' : '#f59e0b' }}>
                        {rule.resulting_risk}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <button onClick={() => handleDeleteRule(rule.id)} style={{ color: '#94a3b8', border: 'none', background: 'none', cursor: 'pointer' }}>
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {showAddRule && (
            <div style={modalOverlayStyle}>
              <form onSubmit={handleAddRule} style={modalStyle}>
                <h3 style={{ margin: '0 0 20px 0' }}>Nueva Regla de Vigilancia</h3>
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Tipo de Suelo</label>
                    <select value={newRule.soilType} onChange={e => setNewRule({...newRule, soilType: e.target.value})} required style={inputStyle}>
                      <option value="">Seleccionar...</option>
                      {soilTypes.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={labelStyle}>Variable Clima</label>
                      <select value={newRule.climateVariable} onChange={e => setNewRule({...newRule, climateVariable: e.target.value})} style={inputStyle}>
                        <option value="humidity">Humedad (%)</option>
                        <option value="rain">Precipitación (mm)</option>
                        <option value="wind">Viento (m/s)</option>
                        <option value="moisture">Humedad Suelo (%)</option>
                      </select>
                    </div>
                    <div>
                      <label style={labelStyle}>Operador</label>
                      <select value={newRule.operator} onChange={e => setNewRule({...newRule, operator: e.target.value})} style={inputStyle}>
                        <option value=">">{'>'}</option>
                        <option value="<">{'<'}</option>
                        <option value=">=">{'>='}</option>
                        <option value="<=">{'<='}</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Valor Umbral</label>
                    <input type="number" step="0.1" value={newRule.thresholdValue} onChange={e => setNewRule({...newRule, thresholdValue: Number(e.target.value)})} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Nivel de Riesgo</label>
                    <select value={newRule.resultingRisk} onChange={e => setNewRule({...newRule, resultingRisk: e.target.value})} style={inputStyle}>
                      <option value="ALTO">ALTO</option>
                      <option value="MEDIO">MEDIO</option>
                      <option value="BAJO">BAJO</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <button type="button" onClick={() => setShowAddRule(false)} style={{ ...btnStyle, background: '#f1f5f9', color: '#64748b', flex: 1 }}>Cancelar</button>
                  <button type="submit" style={{ ...btnStyle, background: '#4f46e5', color: 'white', flex: 1 }}>Guardar Regla</button>
                </div>
              </form>
            </div>
          )}
        </section>
      )}

      {/* 3. ORQUESTADOR DE PROYECTOS */}
      {tab === 'projects' && (
        <section>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Orquestador de Vigilancia Colectiva</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: 4 }}>Controla el centinela y la frecuencia de escaneo de forma individual.</p>
          </div>

          <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={thStyle}>Proyecto</th>
                  <th style={thStyle}>Estado Sentinel</th>
                  <th style={thStyle}>Frecuencia</th>
                  <th style={thStyle}>Último Escaneo</th>
                  <th style={thStyle}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {projects.map(p => {
                  const isEnabled = p.sentinel_enabled === 1 || p.sentinel_enabled === true;
                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}><div style={{ fontWeight: 700 }}>{p.name}</div><div style={{ fontSize: 11, color: '#94a3b8' }}>ID: {p.id}</div></td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                           <input 
                             type="checkbox" 
                             checked={isEnabled} 
                             onChange={(e) => handleUpdateProjectSentinel(p.id, e.target.checked, p.scan_frequency_minutes)}
                             style={{ width: 18, height: 18, cursor: 'pointer' }}
                           />
                           <span style={{ fontSize: 12, fontWeight: 600, color: isEnabled ? '#059669' : '#94a3b8' }}>
                             {isEnabled ? 'VIGILANDO' : 'DETENIDO'}
                           </span>
                        </div>
                      </td>
                      <td style={tdStyle}>
                        <select 
                          value={p.scan_frequency_minutes || 60} 
                          onChange={(e) => handleUpdateProjectSentinel(p.id, isEnabled, e.target.value)}
                          style={{ padding: '4px 8px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                        >
                          <option value="10">Cada 10 min</option>
                          <option value="60">Cada hora</option>
                          <option value="360">Cada 6 horas</option>
                          <option value="1440">Diario</option>
                        </select>
                      </td>
                      <td style={tdStyle}>
                        <div style={{ fontSize: 12 }}>{p.last_scan_at ? format(new Date(p.last_scan_at), 'd MMM, HH:mm', { locale: es }) : 'Nunca'}</div>
                      </td>
                    <td style={tdStyle}>
                      <button 
                        onClick={() => setEditingProject({...p})}
                        style={{ color: '#6366f1', border: 'none', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 600, fontSize: 12 }}
                      >
                        Configurar <ExternalLink size={14} />
                      </button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {editingProject && (
            <div style={modalOverlayStyle}>
              <form onSubmit={handleSaveProjectDetails} style={modalStyle}>
                <h3 style={{ margin: '0 0 20px 0' }}>Configurar Proyecto: {editingProject.name}</h3>
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label style={labelStyle}>Nombre del Proyecto</label>
                    <input type="text" value={editingProject.name} onChange={e => setEditingProject({...editingProject, name: e.target.value})} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Vigilancia Sentinel</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <input 
                        type="checkbox" 
                        checked={!!editingProject.sentinel_enabled} 
                        onChange={e => setEditingProject({...editingProject, sentinel_enabled: e.target.checked ? 1 : 0})}
                        style={{ width: 20, height: 20 }}
                      />
                      <span style={{ fontSize: 13 }}>Habilitar escaneo automático</span>
                    </div>
                  </div>
                  <div>
                    <label style={labelStyle}>Frecuencia de Escaneo (minutos)</label>
                    <input 
                      type="number" 
                      value={editingProject.scan_frequency_minutes || 60} 
                      onChange={e => setEditingProject({...editingProject, scan_frequency_minutes: e.target.value})} 
                      style={inputStyle} 
                    />
                    <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>Ej: 60 para cada hora, 1440 para diario.</p>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                  <button type="button" onClick={() => setEditingProject(null)} style={{ ...btnStyle, background: '#f1f5f9', color: '#64748b', flex: 1 }}>Cancelar</button>
                  <button type="submit" style={{ ...btnStyle, background: '#4f46e5', color: 'white', flex: 1 }}>Guardar Cambios</button>
                </div>
              </form>
            </div>
          )}
        </section>
      )}

      {/* 4. BITÁCORA DE AUDITORÍA */}
      {tab === 'logs' && (
        <section>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Bitácora de Operaciones Satelitales</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: 4 }}>Histórico detallado de ejecuciones del Sentinel y respuestas de la API.</p>
          </div>

          <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: '#f8fafc' }}>
                <tr>
                  <th style={thStyle}>Fecha/Hora</th>
                  <th style={thStyle}>Proyecto / Zona</th>
                  <th style={thStyle}>Resultado</th>
                  <th style={thStyle}>Snapshot Clima</th>
                  <th style={thStyle}>Estado</th>
                  <th style={thStyle}>Detalles</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => {
                  const climate = log.climate_snapshot ? JSON.parse(log.climate_snapshot) : null
                  return (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={tdStyle}><div style={{ fontSize: 12, fontWeight: 600 }}>{format(new Date(log.executed_at), 'd MMM, HH:mm:ss', { locale: es })}</div></td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{log.projectName || 'Desconocido'}</div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>Zona ID: {log.zone_id || 'Global'}</div>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, fontWeight: 800, color: 'white', background: log.result_level === 'ALTO' || log.result_level === 'CRÍTICO' ? '#ef4444' : log.result_level === 'MEDIO' ? '#f59e0b' : '#3b82f6' }}>
                          {log.result_level || 'N/A'}
                        </span>
                      </td>
                      <td style={tdStyle}>
                         <div style={{ fontSize: 11, color: '#64748b' }}>
                            {climate ? `${climate.precipitation24hMm}mm | ${climate.humidityPct}% | ${climate.windSpeedMs}m/s` : '--'}
                         </div>
                      </td>
                      <td style={tdStyle}>
                        {log.success ? (
                          <CheckCircle2 size={16} color="#10b981" />
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444' }}>
                            <AlertTriangle size={16} />
                            <span style={{ fontSize: 10 }}>ERR</span>
                          </div>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <button 
                          onClick={() => setViewingLog(log)}
                          style={{ color: '#6366f1', border: 'none', background: '#eaeefd', padding: '6px 12px', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, fontSize: 11 }}
                        >
                          <Info size={14} /> Ver
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {viewingLog && (
            <div style={modalOverlayStyle}>
              <div style={{...modalStyle, maxWidth: 960, width: '90%'}}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>Detalles del Escaneo Geotécnico</h3>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                      {viewingLog.projectName || 'Desconocido'} - Zona ID: {viewingLog.zone_id || 'Global'} | {format(new Date(viewingLog.executed_at), 'd MMM yyyy, HH:mm:ss', { locale: es })}
                    </div>
                  </div>
                  <button onClick={() => { setViewingLog(null); setAiExplanation(null); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}><X size={20} /></button>
                </div>

                <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start' }}>
                  {/* COLUMNA IZQUIERDA: DATOS DUROS */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Columna Clima */}
                    <div style={{ background: '#f8fafc', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Activity size={16} color="#3b82f6" /> Datos Climáticos
                      </h4>
                      {viewingLog.climate_snapshot ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                          {Object.entries(JSON.parse(viewingLog.climate_snapshot)).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b', fontWeight: 600 }}>{k}</span>
                              <span style={{ color: '#1e293b', fontWeight: 800 }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>No hay datos climáticos disponibles.</div>
                      )}
                    </div>

                    {/* Columna Suelo */}
                    <div style={{ background: '#f8fafc', padding: 16, borderRadius: 16, border: '1px solid #e2e8f0' }}>
                      <h4 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#334155', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Layers size={16} color="#f59e0b" /> Perfil Geotécnico
                      </h4>
                      {viewingLog.geotech_snapshot ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                          {Object.entries(JSON.parse(viewingLog.geotech_snapshot)).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#64748b', fontWeight: 600 }}>{k}</span>
                              <span style={{ color: '#1e293b', fontWeight: 800 }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: '#94a3b8' }}>No hay perfil vinculado.</div>
                      )}
                    </div>
                  </div>

                  {/* COLUMNA DERECHA: RESULTADO E IA */}
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Veredicto */}
                    <div style={{ padding: 16, borderRadius: 16, background: viewingLog.result_level === 'ALTO' || viewingLog.result_level === 'CRÍTICO' ? '#fef2f2' : viewingLog.result_level === 'MEDIO' ? '#fffbeb' : '#f0f9ff', border: '1px solid', borderColor: viewingLog.result_level === 'ALTO' || viewingLog.result_level === 'CRÍTICO' ? '#fca5a5' : viewingLog.result_level === 'MEDIO' ? '#fcd34d' : '#bae6fd' }}>
                       <div style={{ fontSize: 13, fontWeight: 700, color: viewingLog.result_level === 'ALTO' || viewingLog.result_level === 'CRÍTICO' ? '#ef4444' : viewingLog.result_level === 'MEDIO' ? '#d97706' : '#2563eb' }}>
                         Veredicto del Motor: {viewingLog.result_level || 'DESCONOCIDO'}
                       </div>
                       {!viewingLog.success && (
                         <div style={{ fontSize: 13, color: '#ef4444', marginTop: 8, fontWeight: 600 }}>
                           Error: {viewingLog.error_message}
                         </div>
                       )}
                    </div>

                    {/* Explicación IA / Matemática */}
                    <div style={{ padding: 20, borderRadius: 16, border: '1px solid #e2e8f0', background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', flex: 1, display: 'flex', flexDirection: 'column' }}>
                       <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                         <h4 style={{ margin: 0, fontSize: 14, color: '#1e293b', display: 'flex', alignItems: 'center', gap: 8 }}>
                           🚀 Análisis Matemático IA
                         </h4>
                         {!aiExplanation && (
                           <button
                             onClick={async () => {
                               setAiLoading(true);
                               try {
                                 const res = await explainScanLog(viewingLog.id);
                                 setAiExplanation(res.explanation);
                               } catch (err) {
                                 setAiExplanation("Error consultando a la IA: " + err.message);
                               } finally {
                                 setAiLoading(false);
                               }
                             }}
                             disabled={aiLoading}
                             style={{ ...btnStyle, padding: '8px 16px', background: '#3b82f6', color: 'white', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
                           >
                             {aiLoading ? <RefreshCw size={14} className="spin" /> : <Play size={14} />}
                             Generar
                           </button>
                         )}
                       </div>
                       {aiExplanation ? (
                         <div style={{ background: '#ffffff', borderRadius: 12, padding: 16, fontSize: 13, color: '#334155', lineHeight: '1.6', border: '1px solid #e2e8f0', whiteSpace: 'pre-wrap', flex: 1, overflowY: 'auto', maxHeight: 300 }}>
                           {aiExplanation}
                         </div>
                       ) : (
                         <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 13, padding: 20, textAlign: 'center', border: '1px dashed #cbd5e1', borderRadius: 12 }}>
                           Haz clic en Generar para enviar los datos a OpenRouter.
                         </div>
                       )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 5. DOCUMENTACIÓN DEL SISTEMA */}
      {tab === 'docs' && (
        <section style={{ background: '#ffffff', padding: 32, borderRadius: 24, border: '1px solid #e2e8f0', color: '#334155', lineHeight: 1.6, fontSize: 15 }}>
          <div style={{ marginBottom: 32, borderBottom: '2px solid #f1f5f9', paddingBottom: 16 }}>
            <h2 style={{ fontSize: 28, fontWeight: 800, color: '#1e293b', margin: '0 0 8px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
              <BookOpen size={28} color="#4f46e5" /> Documentación del Motor Geotécnico (Sentinel)
            </h2>
            <p style={{ color: '#64748b', margin: 0, fontSize: 14 }}>Manual Técnico Arquitectónico, Modelo Matemático y Guía de Uso del Sistema de Prevención de Riesgos.</p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
            
            {/* Arquitectura */}
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', borderLeft: '4px solid #4f46e5', paddingLeft: 12, margin: '0 0 16px 0' }}>1. Arquitectura y Árbol de Archivos</h3>
              <p>El sistema se divide en un Ecosistema React (Frontend) y un Motor Node.js + SQLite (Backend).</p>
              <ul style={{ background: '#f8fafc', padding: '16px 16px 16px 36px', borderRadius: 12, margin: 0 }}>
                <li><strong><code>server.js</code> (El Cerebro Central):</strong> Aloja el <em>Cron Job</em> (temporizador analítico) que despierta en base a la frecuencia pactada. Ejecuta peticiones HTTP a <em>OpenMeteo</em>, extrae la base de datos de suelos locales, y procesa la matemática de riesgo mediante la función <code>computeRisk()</code>. Cierra la operación levantando banderas por <em>WebSockets</em> si el peligro asoma.</li>
                <li><strong><code>AdminSystemControlPage.jsx</code> (El Centro de Mando):</strong> Portal para el administrador donde puede activar/desactivar el "Kill Switch", calibrar frecuencias y definir las reglas duras (trigger rules) adaptadas a su tipo de suelo específico.</li>
                <li><strong><code>AlertBell.jsx</code> (El Megáfono):</strong> Escucha a los sensores y a la base de datos de alertas en tiempo real. Cuando ocurre un registro, informa y clasifica el riesgo coloreándolo según la gravedad de rojo a azul.</li>
                <li><strong><code>api.js</code> (El Puente):</strong> Define la comunicación entre la torre de control frontend y las APIs matemáticas y de Inteligencia Artificial (OpenRouter) en el backend.</li>
              </ul>
            </div>

            {/* Modelo Matemático */}
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', borderLeft: '4px solid #f59e0b', paddingLeft: 12, margin: '0 0 16px 0' }}>2. Modelo Matemático Climatológico-Geotécnico</h3>
              <p>La evaluación del riesgo no funciona en cascada simple, resuelve una matriz de ponderaciones conocida como el <strong>"Base Score (0 a 100)"</strong>. La función que rige el sistema subyacente es:</p>
              
              <div style={{ background: '#1e293b', color: '#f8fafc', padding: 20, borderRadius: 12, fontFamily: 'monospace', fontSize: 13, marginBottom: 16 }}>
                Score = W_Suelo × [ (0.28 × F_Lluvia) + (0.08 × F_Humedad) + (0.20 × F_IndiceNapa) + (0.16 × F_DebilidadFreatica) + (0.16 × F_PerdidaPortante) + (0.12 × F_FallaCorte) ] 
              </div>

              <p><strong>Cálculo de Factores Subyacentes:</strong></p>
              <ul style={{ margin: '0 0 16px 20px' }}>
                <li><strong>W_Suelo (Peso Estructural Múltiple):</strong> Los suelos tienen coeficientes nativos según su fricción interna y cohesión. En el modelo actual, Arcilla y Limo (<code>W = 1.0 y 0.9</code>) amplifican el score hacia arriba rápidamente, mientras que Grava (<code>W = 0.5</code>) mitiga el efecto climático casi a la mitad debido a su buen drenaje.</li>
                <li><strong>F_DebilidadFreatica:</strong> Interpela inversamente la profundidad freática. <code>max(0, 10 - profundidad) / 10</code>. Indica que mientras la napa más cerca esté del nivel cero, el factor empuja el score bruscamente hacia al 16% de desastre.</li>
              </ul>

              <div style={{ padding: 16, background: '#fef2f2', borderLeft: '4px solid #ef4444', borderRadius: '0 12px 12px 0' }}>
                <strong>Reglas Dinámicas (Triggers Absolutos):</strong> Independientemente del Score Base, el modelo tiene un seguro de intervención. Si la regla dicta <em>"Precipitación &gt; 85mm"</em>, ignora toda la ecuación anterior y catapulta el resultado a <strong>CRÍTICO o ALTO</strong> basándose en la saturación inminente, lo cual responde impecablemente a la tesis de la investigación: evitar catástrofes de alta respuesta sobre cálculos estadísticos dudosos.
              </div>
            </div>

            {/* Aporte a la Investigación */}
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', borderLeft: '4px solid #10b981', paddingLeft: 12, margin: '0 0 16px 0' }}>3. Respuesta a la Investigación Científica</h3>
              <p>Este sistema responde de manera directa a la hipótesis de la investigación al integrar tres disciplinas en tiempo real: Clima, Mecánica de Suelos y Ciencia de Datos.</p>
              <ul style={{ margin: '0 0 0 20px' }}>
                <li><strong>Automatización Predictiva Continua:</strong> Libera al ingeniero de campo de la evaluación empírica usando una orquestación automatizada "Centinela" que monitorea sin descanso y almacena el estado probabilístico en la Bitácora de Auditoría.</li>
                <li><strong>Auditoría Robusta:</strong> La modalidad de IA integrada en los reportes (impulsada por <code>gpt-4o-mini</code> mediante el modelo OpenRouter) logra que incluso un usuario sin expertise geotécnico avanzado pueda interrogar los resultados de la modelación matemática en formato de texto. Esto valida la investigación como <em>aplicable y funcional hacia el terreno civil</em>.</li>
              </ul>
            </div>

            {/* Cómo Usar */}
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', borderLeft: '4px solid #3b82f6', paddingLeft: 12, margin: '0 0 16px 0' }}>4. Manual Operativo</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8, color: '#4f46e5' }}>Paso 1: Cerebro (Reglas)</div>
                  Asegúrate de ir a la pestaña "Cerebro: Reglas de Riesgo" e insertar las limitantes específicas de tu zona de obra. Ej. Arcilla + &gt; 40mm Lluvia = ALTO.
                </div>
                <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8, color: '#4f46e5' }}>Paso 2: Orquestador</div>
                  Activa el Sentinel marcando la casilla de los proyectos de los que quieres depender, bajando la frecuencia si prevés un clima peligroso (ej: cada 30 min en lugar de cada 24H).
                </div>
                <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 12 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8, color: '#4f46e5' }}>Paso 3: Monitoreo</div>
                  Presta atención a la campana (notificaciones). En caso de duda, entra a la Bitácora de Auditoría, busca el evento alterado y clickea en "Generar Análisis de IA". El LLM cruzará los límites físicos con las variables registradas y defenderá el resultado.
                </div>
              </div>
            </div>

          </div>
        </section>
      )}

    </div>
  )
}

const thStyle = { padding: '16px 20px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#64748b' }
const tdStyle = { padding: '16px 20px', fontSize: 14, color: '#1e293b' }
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6 }
const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 14, outline: 'none' }
const btnStyle = { padding: '12px 16px', borderRadius: 12, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14 }
const tabBtnStyle = { 
  display: 'flex', alignItems: 'center', gap: 8, padding: '12px 20px', 
  border: 'none', background: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 14,
  transition: 'all 0.2s'
}
const modalOverlayStyle = { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.4)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', zIndex: 1000 }
const modalStyle = { background: 'white', padding: 32, borderRadius: 24, width: '100%', maxWidth: 440, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }
