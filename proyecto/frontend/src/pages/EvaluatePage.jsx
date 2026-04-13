import { useEffect, useMemo, useState } from 'react'
import { evaluateRisk, connectAlerts, fetchClimate, fetchSoilTypes, createSoilType } from '../lib/api'
import { useToasts } from '../components/ToastHost'
import { buttonStyle, cardStyle, inputStyle, labelStyle, sectionSubTitleStyle, sectionTitleStyle, ui } from '../lib/ui'
import { Activity, ThermometerSun, AlertTriangle, CheckCircle, Info, XCircle, CloudRain, Wind, Droplets, MapPin, Mountain, TrendingUp } from 'lucide-react'

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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 13, fontWeight: 600, background: cfg.bg, color: cfg.fg, border: `1px solid ${cfg.border}` }}>
      <Icon size={14} strokeWidth={2} />
      {risk}
    </span>
  )
}

const inputTheme = {
  padding: '12px 14px',
  borderRadius: 14,
  border: '1px solid #e2e8f0',
  background: '#f8fafc',
  fontSize: 14,
  fontWeight: 400,
  color: '#0f172a',
  outline: 'none',
  transition: 'all 0.2s',
  width: '100%',
  boxSizing: 'border-box'
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 6, fontSize: 13 }}>
      <div style={{ fontWeight: 600, color: '#475569', letterSpacing: '-0.1px' }}>{label}</div>
      {children}
    </label>
  )
}

function Input(props) {
  return <input {...props} className="premium-input" style={inputTheme} />
}

function Select(props) {
  return <select {...props} className="premium-input" style={{...inputTheme, cursor: 'pointer', appearance: 'none'}} />
}

export default function EvaluatePage() {
  const { push } = useToasts()
  const [lat, setLat] = useState(-5.1945)
  const [lon, setLon] = useState(-80.6328)

  const [locationSearch, setLocationSearch] = useState('')
  const [locationResults, setLocationResults] = useState([])
  const [searchingLocation, setSearchingLocation] = useState(false)

  // Function to search locations in Peru via Open-Meteo Geocoding API
  async function searchLocation(query) {
    setLocationSearch(query)
    if (!query || query.length < 3) {
      setLocationResults([])
      return
    }
    setSearchingLocation(true)
    try {
      // Free geocoding API from open-meteo restricted to Peru (country code PE)
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=es&format=json`)
      const data = await res.json()
      // Filter for Peru only if API sometimes returns others despite best efforts
      const results = (data.results || []).filter(r => r.country_code === 'PE' || r.country === 'Peru' || r.country === 'Perú')
      setLocationResults(results)
    } catch (e) {
      console.error('Error searching location', e)
    } finally {
      setSearchingLocation(false)
    }
  }

  function handleSelectLocation(loc) {
    setLat(loc.latitude)
    setLon(loc.longitude)
    setLocationSearch(`${loc.name}, ${loc.admin1 || ''}`)
    setLocationResults([])
  }

  const [soilType, setSoilType] = useState('arcilla')
  const [bearingCapacityKpa, setBearingCapacityKpa] = useState(120)
  const [moistureIndex, setMoistureIndex] = useState(0.8)
  const [shearStrengthKpa, setShearStrengthKpa] = useState(25)
  const [waterTableDepthM, setWaterTableDepthM] = useState(1.5)

  const [soilTypes, setSoilTypes] = useState([])
  const [soilTypesLoading, setSoilTypesLoading] = useState(false)
  const [soilModalOpen, setSoilModalOpen] = useState(false)
  const [newSoilKey, setNewSoilKey] = useState('')
  const [newSoilLabel, setNewSoilLabel] = useState('')

  const [precipitation24hMm, setPrecipitation24hMm] = useState(70)
  const [humidityPct, setHumidityPct] = useState(92)
  const [windSpeedMs, setWindSpeedMs] = useState(6)

  const [climateLoading, setClimateLoading] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [lastAlert, setLastAlert] = useState(null)

  // Overlay effect text
  const [loadingOverlay, setLoadingOverlay] = useState(null)

  useEffect(() => {
    const disconnect = connectAlerts((msg) => {
      if (msg?.type === 'risk_alert') {
        setLastAlert(msg.payload)
        push({
          title: `Alerta: ${msg.payload?.riskLevel ?? 'RIESGO'}`,
          level: msg.payload?.riskLevel,
          message: `${msg.payload?.probableCause ?? ''}${msg.payload?.recommendation ? `\nAcción: ${msg.payload.recommendation}` : ''}`,
        })
      }
    })
    return disconnect
  }, [push])

  async function loadSoilTypes() {
    setSoilTypesLoading(true)
    try {
      const r = await fetchSoilTypes()
      const items = r?.items ?? []
      setSoilTypes(items)
      if (items.length > 0) {
        const exists = items.some((x) => String(x.key) === String(soilType))
        if (!exists) setSoilType(String(items[0].key))
      }
    } catch {
      // ignore
    } finally {
      setSoilTypesLoading(false)
    }
  }

  useEffect(() => {
    loadSoilTypes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function openSoilModal() {
    setNewSoilKey('')
    setNewSoilLabel('')
    setSoilModalOpen(true)
  }

  async function createNewSoilType() {
    const key = String(newSoilKey || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
    const label = String(newSoilLabel || '').trim()
    if (!key || !label) {
      setError('Completa key y nombre del tipo de suelo')
      return
    }
    try {
      await createSoilType({ key, label })
      setSoilModalOpen(false)
      await loadSoilTypes()
      setSoilType(key)
      push({ title: 'Tipo de suelo agregado', level: 'MEDIO', message: label, timeoutMs: 2500 })
    } catch (e) {
      setError(e?.message ?? 'No se pudo crear tipo de suelo')
    }
  }

  const payload = useMemo(
    () => ({
      location: { lat: Number(lat), lon: Number(lon) },
      soil: {
        type: soilType,
        bearingCapacityKpa: Number(bearingCapacityKpa),
        moistureIndex: Number(moistureIndex),
        shearStrengthKpa: Number(shearStrengthKpa),
        waterTableDepthM: Number(waterTableDepthM),
      },
      climate: {
        precipitation24hMm: Number(precipitation24hMm),
        humidityPct: Number(humidityPct),
        windSpeedMs: Number(windSpeedMs),
      },
    }),
    [
      lat,
      lon,
      soilType,
      bearingCapacityKpa,
      moistureIndex,
      shearStrengthKpa,
      waterTableDepthM,
      precipitation24hMm,
      humidityPct,
      windSpeedMs,
    ]
  )

  async function onEvaluate() {
    setLoading(true)
    setLoadingOverlay('Ejecutando motor de Inferencia Geotécnica...')
    setError('')
    try {
      const [r] = await Promise.all([
        evaluateRisk(payload),
        new Promise(res => setTimeout(res, 1200)) // Artificial delay to enjoy the animation
      ])
      setResult(r)
      push({
        title: `Evaluación: ${r?.riskLevel ?? 'OK'}`,
        level: r?.riskLevel,
        message: `${r?.probableCause ?? ''}`,
        timeoutMs: 4500,
      })
    } catch (e) {
      setError(e?.message ?? 'Error')
    } finally {
      setLoading(false)
      setLoadingOverlay(null)
    }
  }

  async function onAutoClimate() {
    setClimateLoading(true)
    setLoadingOverlay('Consultando satélite meteorológico (Open-Meteo) para Perú...')
    setError('')
    try {
      const [r] = await Promise.all([
        fetchClimate(Number(lat), Number(lon)),
        new Promise(res => setTimeout(res, 1500)) // Let user see the loading feedback
      ])
      const c = r?.climate
      if (!c) throw new Error('Respuesta de clima inválida')

      if (typeof c.precipitation24hMm === 'number') setPrecipitation24hMm(c.precipitation24hMm)
      if (typeof c.humidityPct === 'number') setHumidityPct(c.humidityPct)
      if (typeof c.windSpeedMs === 'number') setWindSpeedMs(c.windSpeedMs)
    } catch (e) {
      setError(e?.message ?? 'No se pudo obtener clima automático')
    } finally {
      setClimateLoading(false)
      setLoadingOverlay(null)
    }
  }

  async function onSimulateElNino() {
    setLoading(true)
    setLoadingOverlay('Preparando inyección de escenario FEN extremo...')
    setError('')
    
    setLat(-5.1945)
    setLon(-80.6328)
    setSoilType('arcilla')
    setBearingCapacityKpa(60)
    setMoistureIndex(0.95)
    setShearStrengthKpa(15)
    setWaterTableDepthM(0.3)
    setPrecipitation24hMm(180)
    setHumidityPct(99)
    setWindSpeedMs(20)

    try {
      const stressPayload = {
        location: { lat: -5.1945, lon: -80.6328 },
        soil: {
          type: 'arcilla',
          bearingCapacityKpa: 60,
          moistureIndex: 0.95,
          shearStrengthKpa: 15,
          waterTableDepthM: 0.3,
        },
        climate: {
          precipitation24hMm: 180,
          humidityPct: 99,
          windSpeedMs: 20,
        },
      }

      await new Promise(res => setTimeout(res, 800))
      setLoadingOverlay('Evaluando vulnerabilidad del perfil geotécnico...')

      const [r] = await Promise.all([
        evaluateRisk(stressPayload),
        new Promise(res => setTimeout(res, 1200))
      ])
      
      setResult(r)
      push({
        title: `Simulación FEN (El Niño): ${r?.riskLevel ?? 'CRÍTICO'}`,
        level: r?.riskLevel ?? 'CRÍTICO',
        message: 'Escenario de estrés inyectado. La recomendación adaptativa se ha recalculado.',
        timeoutMs: 8000,
      })
    } catch (e) {
      setError(e?.message ?? 'Error en simulación')
    } finally {
      setLoading(false)
      setLoadingOverlay(null)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 40 }}>
      <style>{`
        .premium-input:focus { background: #ffffff !important; border-color: #6366f1 !important; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1) !important; }
        .premium-card { background: #ffffff; border-radius: 20px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -2px rgba(0,0,0,0.02); position: relative; overflow: hidden; }
        .section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #f8fafc; }
        .icon-box { width: 32px; height: 32px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
        @keyframes fadeInOverlay { from { opacity: 0; backdrop-filter: blur(0px); } to { opacity: 1; backdrop-filter: blur(8px); } }
        @keyframes spinFast { to { transform: rotate(360deg); } }
        @keyframes pulseRing { 0% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0.4); } 70% { box-shadow: 0 0 0 20px rgba(139, 92, 246, 0); } 100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); } }
        .animated-overlay { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.5); display: flex; flex-direction: column; align-items: center; justify-content: center; z-index: 99999; animation: fadeInOverlay 0.3s ease-out forwards; }
        .spinner-ring { width: 64px; height: 64px; border: 4px solid rgba(255,255,255,0.2); border-top-color: #ffffff; border-radius: 50%; animation: spinFast 0.8s linear infinite, pulseRing 2s infinite; margin-bottom: 24px; }
      `}</style>

      {loadingOverlay && (
        <div className="animated-overlay">
          <div className="spinner-ring" />
          <div style={{ fontSize: 18, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.3px', textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>
            {loadingOverlay}
          </div>
        </div>
      )}

      <section className="premium-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
             <div style={{ width: 44, height: 44, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Activity size={22} color="#334155" strokeWidth={2} />
             </div>
             <div>
               <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.3px' }}>Módulo de Recomendaciones Adaptativas</div>
               <div style={{ fontSize: 13, color: '#64748b', fontWeight: 400, marginTop: 2 }}>Simulación de escenarios espaciales y climáticos</div>
             </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={onSimulateElNino} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', cursor: 'pointer', transition: 'all 0.2s', opacity: loading ? 0.7 : 1 }}>
              <AlertTriangle size={15} strokeWidth={2} />
              {loading ? 'Simulando...' : 'Prueba Estrés (FEN)'}
            </button>
            <button onClick={onAutoClimate} type="button" disabled={climateLoading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 500, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.2s' }}>
              <ThermometerSun size={15} strokeWidth={2} />
              Autocompletar Clima
            </button>
            <button onClick={onEvaluate} disabled={loading} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 600, background: '#4f46e5', color: '#ffffff', border: 'none', cursor: 'pointer', boxShadow: '0 2px 8px rgba(79,70,229,0.25)', transition: 'all 0.2s', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Evaluando...' : 'Ejecutar Modelo'}
            </button>
          </div>
        </div>

        <div style={{ marginTop: 32, display: 'grid', gap: 32 }}>
          {/* Ubicacion */}
          <div>
            <div className="section-header" style={{ marginBottom: 16 }}>
              <div className="icon-box" style={{ background: '#f0f9ff', color: '#0284c7' }}><MapPin size={16} strokeWidth={2} /></div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>Ubicación Geográfica (Perú)</div>
            </div>
            
            <div style={{ paddingBottom: 16, position: 'relative' }}>
              <Field label="Buscar ciudad o zona en Perú">
                <Input 
                  placeholder="Ej: Piura, Lima, Arequipa..." 
                  value={locationSearch} 
                  onChange={(e) => searchLocation(e.target.value)} 
                />
              </Field>
              {locationResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', zIndex: 10, marginTop: -10, padding: 8, display: 'grid', gap: 4 }}>
                  {locationResults.map(loc => (
                    <div 
                      key={loc.id} 
                      onClick={() => handleSelectLocation(loc)}
                      style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#334155', background: '#f8fafc' }}
                      onMouseEnter={(e) => e.target.style.background = '#e2e8f0'}
                      onMouseLeave={(e) => e.target.style.background = '#f8fafc'}
                    >
                      {loc.name}{loc.admin1 ? `, ${loc.admin1}` : ''}
                      <span style={{ fontSize: 12, color: '#94a3b8', marginLeft: 8, fontWeight: 500 }}>
                        {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <Field label="Latitud"><Input type="number" step="0.0001" value={lat} onChange={(e) => setLat(e.target.value)} /></Field>
              <Field label="Longitud"><Input type="number" step="0.0001" value={lon} onChange={(e) => setLon(e.target.value)} /></Field>
            </div>
          </div>

          {/* Suelo */}
          <div>
            <div className="section-header" style={{ marginBottom: 16 }}>
              <div className="icon-box" style={{ background: '#fef3c7', color: '#d97706' }}><Mountain size={16} strokeWidth={2} /></div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>Características del Suelo</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <Field label="Tipo de suelo">
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <Select value={soilType} onChange={(e) => setSoilType(e.target.value)}>
                    {(soilTypes.length ? soilTypes : [
                      { key: 'arcilla', label: 'Arcilla' }, { key: 'limo', label: 'Limo' }, { key: 'arena', label: 'Arena' }, { key: 'roca', label: 'Roca' }
                    ]).map((t) => <option key={t.key} value={String(t.key)}>{t.label ?? t.key}</option>)}
                  </Select>
                  <button type="button" onClick={openSoilModal} disabled={soilTypesLoading} style={{ padding: '10px 12px', borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}>+</button>
                </div>
              </Field>
              <Field label="Capacidad portante (kPa)"><Input type="number" step="1" value={bearingCapacityKpa} onChange={(e) => setBearingCapacityKpa(e.target.value)} /></Field>
              <Field label="Índice humedad (0-1)"><Input type="number" step="0.01" min="0" max="1" value={moistureIndex} onChange={(e) => setMoistureIndex(e.target.value)} /></Field>
              <Field label="Resistencia al corte (kPa)"><Input type="number" step="1" value={shearStrengthKpa} onChange={(e) => setShearStrengthKpa(e.target.value)} /></Field>
              <Field label="Nivel freático (m)"><Input type="number" step="0.1" value={waterTableDepthM} onChange={(e) => setWaterTableDepthM(e.target.value)} /></Field>
            </div>
          </div>

          {/* Clima */}
          <div>
            <div className="section-header" style={{ marginBottom: 16 }}>
              <div className="icon-box" style={{ background: '#dbeafe', color: '#2563eb' }}><CloudRain size={16} strokeWidth={2} /></div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>Variables Climáticas</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <Field label="Precipitación 24h (mm)"><Input type="number" step="1" value={precipitation24hMm} onChange={(e) => setPrecipitation24hMm(e.target.value)} /></Field>
              <Field label="Humedad ambiente (%)"><Input type="number" step="1" value={humidityPct} onChange={(e) => setHumidityPct(e.target.value)} /></Field>
              <Field label="Viento (m/s)"><Input type="number" step="0.1" value={windSpeedMs} onChange={(e) => setWindSpeedMs(e.target.value)} /></Field>
            </div>
          </div>
        </div>

        {error ? <div style={{ marginTop: 24, padding: '16px 20px', borderRadius: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}><AlertTriangle size={18} /> {error}</div> : null}

        {soilModalOpen ? (
          <div role="dialog" style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'grid', placeItems: 'center', padding: 24, zIndex: 9999 }} onClick={() => setSoilModalOpen(false)}>
            <div style={{ width: '100%', maxWidth: 460, background: '#ffffff', borderRadius: 24, padding: 32, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }} onClick={(e) => e.stopPropagation()}>
              <div style={{ fontSize: 18, fontWeight: 600, color: '#0f172a', letterSpacing: '-0.3px' }}>Nuevo Tipo de Suelo</div>
              <div style={{ fontSize: 13, color: '#64748b', marginTop: 4, marginBottom: 24 }}>Se guardará en el catálogo general.</div>
              <div style={{ display: 'grid', gap: 16 }}>
                <Field label="Identificador (ej: grava_fina)"><Input value={newSoilKey} onChange={(e) => setNewSoilKey(e.target.value)} placeholder="grava_fina" /></Field>
                <Field label="Nombre visible"><Input value={newSoilLabel} onChange={(e) => setNewSoilLabel(e.target.value)} placeholder="Grava fina" /></Field>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 32 }}>
                <button onClick={() => setSoilModalOpen(false)} style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 500, fontSize: 13, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', cursor: 'pointer' }}>Cancelar</button>
                <button onClick={createNewSoilType} style={{ padding: '10px 16px', borderRadius: 10, fontWeight: 500, fontSize: 13, background: '#0f172a', color: '#ffffff', border: 'none', cursor: 'pointer' }}>Guardar en catálogo</button>
              </div>
            </div>
          </div>
        ) : null}
      </section>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
        <section className="premium-card" style={{ display: 'flex', flexDirection: 'column', padding: 24, background: '#ffffff', borderTop: '4px solid #4f46e5' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="icon-box" style={{ background: '#e0e7ff', color: '#4f46e5' }}><TrendingUp size={18} strokeWidth={2}/></div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Dictamen Operativo</div>
            </div>
            <RiskBadge risk={result?.riskLevel} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9', padding: 16, flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Score de Riesgo</span>
              <span style={{ fontSize: 24, fontWeight: 600, color: '#0f172a' }}>{result?.score?.toFixed?.(2) ?? '-'}</span>
            </div>
            <div style={{ width: '100%', height: 1, background: '#e2e8f0' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Causa Principal</span>
              <span style={{ fontSize: 13, fontWeight: 400, color: '#334155' }}>{result?.probableCause ?? '-'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Acción Recomendada</span>
              <span style={{ fontSize: 13, fontWeight: 500, color: '#4f46e5' }}>{result?.recommendation ?? '-'}</span>
            </div>
          </div>
        </section>

        <section className="premium-card" style={{ display: 'flex', flexDirection: 'column', padding: 24, background: '#ffffff', borderTop: '4px solid #dc2626' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="icon-box" style={{ background: '#fef2f2', color: '#dc2626' }}><Activity size={18} strokeWidth={2}/></div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>Telemetría en Vivo</div>
            </div>
            <RiskBadge risk={lastAlert?.riskLevel} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9', padding: 16, flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Evento</span>
                <span style={{ fontSize: 13, fontWeight: 400, color: '#334155' }}>{lastAlert?.probableCause ?? 'Esperando datos de campo...'}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Mitigación</span>
                <span style={{ fontSize: 13, fontWeight: 400, color: '#334155' }}>{lastAlert?.recommendation ?? '-'}</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
