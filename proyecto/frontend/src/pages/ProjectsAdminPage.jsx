import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { createProject, deleteProject, fetchProjects, updateProject } from '../lib/api'
import { getUser } from '../lib/auth'
import { Folder, Plus, Edit2, Trash2, MapPin, ChevronLeft, ChevronRight, Search, Activity, Calendar, RefreshCw, X, ShieldAlert, Navigation, DollarSign, Cloud } from 'lucide-react'
import { ui } from '../lib/ui'

function Field({ label, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label className="filter-label">{label}</label>
      {children}
    </div>
  )
}

function StatusBadge({ status }) {
  const norm = String(status || '').toUpperCase()
  let cl = 'status-cerrado'
  if (norm === 'ACTIVO') cl = 'status-activo'
  else if (norm === 'PAUSADO') cl = 'status-pausado'
  return <span className={`status-badge ${cl}`}>{norm}</span>
}

export default function ProjectsAdminPage() {
  const user = getUser()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Pagination & Filter
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const itemsPerPage = 10

  // Create Modal
  const [showCreate, setShowCreate] = useState(false)
  const [name, setName] = useState('')
  const [lat, setLat] = useState('-5.1945')
  const [lon, setLon] = useState('-80.6328')
  const [plannedBudget, setPlannedBudget] = useState('')
  const [plannedStart, setPlannedStart] = useState('')
  const [plannedEnd, setPlannedEnd] = useState('')

  const [busy, setBusy] = useState('')

  // Edit Modal
  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editLat, setEditLat] = useState('')
  const [editLon, setEditLon] = useState('')
  const [editStatus, setEditStatus] = useState('ACTIVO')

  const canWrite = user?.role === 'ADMIN' || user?.role === 'INGENIERO'

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await fetchProjects()
      setItems(r.items ?? [])
    } catch (e) {
      setError(e?.message ?? 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  function startEdit(p) {
    setEditId(p.id)
    setEditName(p.name ?? '')
    setEditLat(p.lat != null ? String(p.lat) : '')
    setEditLon(p.lon != null ? String(p.lon) : '')
    setEditStatus(p.status ?? 'ACTIVO')
  }

  function cancelEdit() {
    setEditId(null)
    setEditName('')
    setEditLat('')
    setEditLon('')
    setEditStatus('ACTIVO')
  }

  function closeCreate() {
    setShowCreate(false)
    setName('')
    setLat('-5.1945')
    setLon('-80.6328')
    setPlannedBudget('')
    setPlannedStart('')
    setPlannedEnd('')
  }

  async function saveEdit(e) {
    e.preventDefault()
    if (!canWrite) {
      setError('Solo ADMIN o INGENIERO pueden editar proyectos')
      return
    }
    const payload = {
      name: editName.trim(),
      lat: Number(editLat),
      lon: Number(editLon),
      status: editStatus,
    }
    if (!payload.name) return alert('Nombre requerido')
    if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lon)) return alert('Coordenadas inválidas')

    setBusy('update')
    try {
      await updateProject(editId, payload)
      cancelEdit()
      await load()
    } catch (e) {
      alert(e?.message ?? 'Error actualizando proyecto')
    } finally {
      setBusy('')
    }
  }

  async function removeProject(p) {
    if (!canWrite) return alert('No tienes permisos')
    if (!window.confirm(`¿Eliminar el proyecto "${p.name}" (ID ${p.id}) de forma permanente?`)) return

    setBusy('delete')
    try {
      await deleteProject(p.id)
      if (editId === p.id) cancelEdit()
      await load()
    } catch (e) {
      alert(e?.message ?? 'Error')
    } finally {
      setBusy('')
    }
  }

  async function onCreate(e) {
    e.preventDefault()
    if (!canWrite) return alert('No tienes permisos para crear')
    
    const payload = {
      name: name.trim(),
      lat: Number(lat),
      lon: Number(lon),
    }

    if (!payload.name) return alert('Nombre requerido')
    if (!Number.isFinite(payload.lat) || !Number.isFinite(payload.lon)) return alert('Coordenadas inválidas')

    if (plannedBudget.trim()) payload.plannedBudget = Number(plannedBudget)
    if (plannedStart) payload.plannedStart = new Date(plannedStart).toISOString()
    if (plannedEnd) payload.plannedEnd = new Date(plannedEnd).toISOString()

    setBusy('create')
    try {
      await createProject(payload)
      closeCreate()
      await load()
      setPage(1)
    } catch (err) {
      alert(err?.message ?? 'Error al crear proyecto')
    } finally {
      setBusy('')
    }
  }

  // Derived state for table
  const filteredItems = useMemo(() => {
    let arr = items.slice().sort((a, b) => Number(b.id) - Number(a.id))
    if (search.trim()) {
      const q = search.toLowerCase()
      arr = arr.filter(p => String(p.id).includes(q) || (p.name || '').toLowerCase().includes(q))
    }
    return arr
  }, [items, search])

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [totalPages, page])

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * itemsPerPage
    return filteredItems.slice(start, start + itemsPerPage)
  }, [filteredItems, page, itemsPerPage])

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 40, animation: 'fadeIn 0.4s ease-out' }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .premium-card { background: #ffffff; border-radius: 24px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.05); }
        .premium-input { padding: 12px 16px; border-radius: 12px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 14px; color: #1e293b; width: 100%; transition: all 0.2s; outline: none; font-weight: 600; font-family: inherit; }
        .premium-input:focus { background: #ffffff; border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
        .btn-action { padding: 10px 18px; border-radius: 14px; font-weight: 800; font-size: 13px; font-family: inherit; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all 0.2s; border: none; outline: none; }
        .btn-action:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-primary { background: #4f46e5; color: #ffffff; box-shadow: 0 4px 12px rgba(79,70,229,0.3); } .btn-primary:hover:not(:disabled) { background: #4338ca; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(79,70,229,0.4); }
        .btn-secondary { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; } .btn-secondary:hover:not(:disabled) { background: #e2e8f0; color: #0f172a; }
        .btn-danger { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; } .btn-danger:hover:not(:disabled) { background: #fee2e2; }
        .btn-ghost { background: transparent; color: #64748b; padding: 8px; border-radius: 10px; border: none; cursor: pointer; transition: 0.2s; } .btn-ghost:hover:not(:disabled) { background: #f1f5f9; color: #0f172a; }
        .btn-link { background: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe; padding: 6px 12px; border-radius: 10px; font-size: 12px; font-weight: 800; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; transition: 0.2s; }
        .btn-link:hover { background: #e0e7ff; }
        
        .icon-box { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe; flex-shrink: 0; }
        .table-row { transition: background 0.2s; border-bottom: 1px solid #f1f5f9; }
        .table-row:hover { background: #f8fafc; }
        
        .filter-label { font-size: 12px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; display: block; }

        .modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; animation: fadeIn 0.2s ease-out; }
        .modal-content { background: #ffffff; width: 100%; max-width: 600px; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8fafc; }
        .modal-body { padding: 24px; overflow-y: auto; display: grid; gap: 16px; }
        .modal-footer { padding: 20px 24px; border-top: 1px solid #e2e8f0; background: #f8fafc; display: flex; justify-content: flex-end; gap: 12px; }
        
        .status-badge { padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase; display: inline-block; }
        .status-activo { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
        .status-pausado { background: #fef9c3; color: #854d0e; border: 1px solid #fef08a; }
        .status-cerrado { background: #f1f5f9; color: #475569; border: 1px solid #e2e8f0; }

        .pagination-bar { display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 24px 24px; }
      `}</style>

      {/* HEADER SECTION */}
      <section className="premium-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="icon-box">
            <Folder size={24} strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>Gestión de Proyectos</div>
            <div style={{ fontSize: 14, color: '#64748b', fontWeight: 600, marginTop: 4 }}>
              Administra el portafolio, ubicaciones y zonas geotécnicas.
            </div>
          </div>
        </div>
        
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button className="btn-action btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={16} strokeWidth={2.5} className={loading ? 'spinning' : ''} />
            {loading ? 'Cargando...' : 'Refrescar'}
          </button>
          {canWrite && (
            <button className="btn-action btn-primary" onClick={() => setShowCreate(true)}>
              <Plus size={18} strokeWidth={2.5} /> Nuevo Proyecto
            </button>
          )}
        </div>
      </section>

      {error ? (
        <div style={{ padding: '16px 20px', borderRadius: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
          <ShieldAlert size={18} /> {error}
        </div>
      ) : null}

      {/* LIST SECTION */}
      <section className="premium-card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: '#fafaf9', borderRadius: '24px 24px 0 0' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#ffffff', border: '1px solid #cbd5e1', padding: '10px 16px', borderRadius: 12, width: '100%', maxWidth: 400 }}>
            <Search size={18} color="#94a3b8" />
            <input 
              type="text" 
              placeholder="Buscar proyecto por nombre o ID..." 
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              style={{ border: 'none', outline: 'none', background: 'transparent', width: '100%', fontSize: 14, fontWeight: 600, color: '#1e293b' }}
            />
          </div>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>
            {filteredItems.length} proyectos encontrados
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '14px 24px', color: '#475569', fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>ID</th>
                <th style={{ padding: '14px 20px', color: '#475569', fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Proyecto</th>
                <th style={{ padding: '14px 20px', color: '#475569', fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Estado</th>
                <th style={{ padding: '14px 20px', color: '#475569', fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Línea Base</th>
                <th style={{ padding: '14px 24px', color: '#475569', fontWeight: 900, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Administración</th>
              </tr>
            </thead>
            <tbody>
              {paginatedItems.map(p => (
                <tr key={p.id} className="table-row">
                  <td style={{ padding: '16px 24px', fontWeight: 800, color: '#1e293b' }}>#{p.id}</td>
                  <td style={{ padding: '16px 20px', fontWeight: 800, color: '#0f172a' }}>
                    {p.name}
                    <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MapPin size={12}/> {p.lat?.toFixed(4)}, {p.lon?.toFixed(4)}
                    </div>
                  </td>
                  <td style={{ padding: '16px 20px' }}>
                    <StatusBadge status={p.status} />
                  </td>
                  <td style={{ padding: '16px 20px', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                    {p.baselineStartAt ? new Date(p.baselineStartAt).toLocaleDateString() : <span style={{color: '#94a3b8'}}>- Pendiente -</span>}
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                      <Link to={`/proyectos/${p.id}`} className="btn-link" title="Panel de Control">
                        <Activity size={14} /> Panel
                      </Link>
                      <Link to={`/admin/proyectos/${p.id}/zonas`} className="btn-link" title="Zonas">
                        <Navigation size={14} /> Zonas
                      </Link>
                      <Link to={`/admin/proyectos/${p.id}/geotecnia`} className="btn-link" title="Geotecnia">
                        <Folder size={14} /> Geo
                      </Link>
                      <Link to={`/admin/proyectos/${p.id}/clima`} className="btn-link" title="Clima">
                        <Cloud size={14} /> Clima
                      </Link>
                      {canWrite && (
                        <>
                          <button className="btn-ghost" onClick={() => startEdit(p)} title="Editar">
                            <Edit2 size={16} />
                          </button>
                          <button className="btn-ghost" style={{ color: '#dc2626' }} onClick={() => removeProject(p)} title="Eliminar">
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {paginatedItems.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '40px 20px', textAlign: 'center', color: '#64748b', fontWeight: 800, fontSize: 14 }}>
                    {loading ? 'Cargando proyectos...' : 'No se encontraron proyectos.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* PAGINATION */}
        <div className="pagination-bar">
          <button 
            className="btn-action btn-secondary" 
            disabled={page === 1}
            onClick={() => setPage(p => Math.max(1, p - 1))}
            style={{ padding: '8px 14px' }}
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          
          <div style={{ fontSize: 13, fontWeight: 800, color: '#475569' }}>
            Página <span style={{ color: '#0f172a' }}>{page}</span> de <span style={{ color: '#0f172a' }}>{totalPages}</span>
          </div>

          <button 
            className="btn-action btn-secondary" 
            disabled={page === totalPages || totalPages === 0}
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            style={{ padding: '8px 14px' }}
          >
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      </section>

      {/* CREATE MODAL */}
      {showCreate && (
        <div className="modal-overlay" onClick={closeCreate}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: '#eef2ff', padding: 8, borderRadius: 10, color: '#4f46e5' }}>
                  <Plus size={20} />
                </div>
                Registrar Nuevo Proyecto
              </div>
              <button className="btn-ghost" onClick={closeCreate}><X size={20}/></button>
            </div>
            
            <form onSubmit={onCreate} id="form-create" className="modal-body">
              <Field label="Nombre del Proyecto">
                <input required className="premium-input" placeholder="Ej: Canal Sechura - Tramo 1" value={name} onChange={e => setName(e.target.value)} />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Latitud (GPS)">
                  <input required type="number" step="any" className="premium-input" placeholder="-5.1945" value={lat} onChange={e => setLat(e.target.value)} />
                </Field>
                <Field label="Longitud (GPS)">
                  <input required type="number" step="any" className="premium-input" placeholder="-80.6328" value={lon} onChange={e => setLon(e.target.value)} />
                </Field>
              </div>
              <Field label="Presupuesto Planificado (S/.) - Opcional">
                <div style={{ position: 'relative' }}>
                  <DollarSign size={16} color="#94a3b8" style={{ position: 'absolute', left: 14, top: 14 }} />
                  <input type="number" className="premium-input" style={{ paddingLeft: 38 }} placeholder="Ej: 1500000" value={plannedBudget} onChange={e => setPlannedBudget(e.target.value)} />
                </div>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Inicio Planificado - Opcional">
                  <input type="datetime-local" className="premium-input" value={plannedStart} onChange={e => setPlannedStart(e.target.value)} />
                </Field>
                <Field label="Fin Planificado - Opcional">
                  <input type="datetime-local" className="premium-input" value={plannedEnd} onChange={e => setPlannedEnd(e.target.value)} />
                </Field>
              </div>
            </form>

            <div className="modal-footer">
              <button type="button" className="btn-action btn-secondary" onClick={closeCreate} disabled={busy === 'create'}>Cancelar</button>
              <button type="submit" form="form-create" className="btn-action btn-primary" disabled={busy === 'create'}>
                {busy === 'create' ? 'Guardando...' : 'Crear Proyecto'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editId && (
        <div className="modal-overlay" onClick={cancelEdit}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ background: '#f8fafc', padding: 8, borderRadius: 10, color: '#475569', border: '1px solid #e2e8f0' }}>
                  <Edit2 size={20} />
                </div>
                Editar Proyecto #{editId}
              </div>
              <button className="btn-ghost" onClick={cancelEdit}><X size={20}/></button>
            </div>
            
            <form onSubmit={saveEdit} id="form-edit" className="modal-body">
              <Field label="Nombre del Proyecto">
                <input required className="premium-input" value={editName} onChange={e => setEditName(e.target.value)} />
              </Field>
              <Field label="Estado Operativo">
                <select className="premium-input" value={editStatus} onChange={e => setEditStatus(e.target.value)}>
                  <option value="ACTIVO">ACTIVO</option>
                  <option value="PAUSADO">PAUSADO</option>
                  <option value="CERRADO">CERRADO</option>
                </select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Latitud (GPS)">
                  <input required type="number" step="any" className="premium-input" value={editLat} onChange={e => setEditLat(e.target.value)} />
                </Field>
                <Field label="Longitud (GPS)">
                  <input required type="number" step="any" className="premium-input" value={editLon} onChange={e => setEditLon(e.target.value)} />
                </Field>
              </div>
            </form>

            <div className="modal-footer">
              <button type="button" className="btn-action btn-secondary" onClick={cancelEdit} disabled={busy === 'update'}>Cancelar</button>
              <button type="submit" form="form-edit" className="btn-action btn-primary" disabled={busy === 'update'}>
                {busy === 'update' ? 'Guardando...' : 'Guardar Cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
