import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { createZone, deleteZone, fetchProjectById, fetchZones, updateZone } from '../lib/api'
import { getUser } from '../lib/auth'
import { buttonStyle, cardStyle, inputStyle, labelStyle, sectionSubTitleStyle, sectionTitleStyle, ui } from '../lib/ui'

function Field({ label, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={labelStyle()}>{label}</div>
      {children}
    </div>
  )
}

export default function ProjectZonesAdminPage() {
  const { id } = useParams()
  const projectId = Number(id)
  const user = getUser()
  const isAdmin = user?.role === 'ADMIN'
  const canWrite = isAdmin || user?.role === 'INGENIERO'

  const [project, setProject] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [zoneName, setZoneName] = useState('')
  const [busy, setBusy] = useState('')

  const [editId, setEditId] = useState(null)
  const [editName, setEditName] = useState('')

  async function load() {
    if (!Number.isFinite(projectId)) {
      setError('Invalid projectId')
      return
    }

    setLoading(true)
    setError('')
    try {
      const [p, z] = await Promise.all([fetchProjectById(projectId), fetchZones(projectId)])
      setProject(p)
      setItems(z.items ?? [])
    } catch (e) {
      setError(e?.message ?? 'Error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  function startEdit(z) {
    setEditId(z.id)
    setEditName(z.name ?? '')
  }

  function cancelEdit() {
    setEditId(null)
    setEditName('')
  }

  async function saveEdit() {
    if (!canWrite) {
      setError('Solo ADMIN o INGENIERO puede editar zonas')
      return
    }
    if (!Number.isFinite(Number(editId))) {
      setError('Zona inválida')
      return
    }
    const payload = { name: editName.trim() }
    if (!payload.name) {
      setError('Nombre de zona requerido')
      return
    }

    setBusy('update')
    try {
      await updateZone(projectId, editId, payload)
      cancelEdit()
      await load()
    } catch (e) {
      setError(e?.message ?? 'Error')
    } finally {
      setBusy('')
    }
  }

  async function removeZone(z) {
    if (!canWrite) {
      setError('Solo ADMIN o INGENIERO puede eliminar zonas')
      return
    }
    const ok = window.confirm(`Eliminar la zona "${z.name}" (ID ${z.id})? Esto también eliminará alertas/eventos/perfiles asociados a esa zona.`)
    if (!ok) return

    setBusy('delete')
    setError('')
    try {
      await deleteZone(projectId, z.id)
      if (editId === z.id) cancelEdit()
      await load()
    } catch (e) {
      setError(e?.message ?? 'Error')
    } finally {
      setBusy('')
    }
  }

  async function onCreate(e) {
    e.preventDefault()
    setError('')

    if (!isAdmin) {
      setError('Solo ADMIN puede crear zonas')
      return
    }

    const payload = { name: zoneName.trim() }
    if (!payload.name) {
      setError('Nombre de zona requerido')
      return
    }

    setBusy('create')
    try {
      await createZone(projectId, payload)
      setZoneName('')
      await load()
    } catch (e2) {
      setError(e2?.message ?? 'Error')
    } finally {
      setBusy('')
    }
  }

  const rows = useMemo(() => items.slice().sort((a, b) => Number(a.id) - Number(b.id)), [items])

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <style>{`
        .zone-card { transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); border: 1px solid #e2e8f0; }
        .zone-card:hover { transform: translateY(-2px); box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.05); }
        .input-modern { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid #e2e8f0; background: #f8fafc; color: #0f172a; font-family: inherit; font-size: 14px; transition: all 0.2s; outline: none; }
        .input-modern:focus { background: #ffffff; border-color: #6366f1; box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1); }
        .btn-modern { padding: 10px 18px; border-radius: 12px; font-weight: 600; font-size: 13px; cursor: pointer; transition: all 0.2s; display: inline-flex; alignItems: center; justifyContent: center; gap: 8px; border: none; }
        .btn-primary { background: #0f172a; color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
        .btn-primary:hover:not(:disabled) { background: #334155; transform: translateY(-1px); }
        .btn-secondary { background: #ffffff; color: #475569; border: 1px solid #cbd5e1; }
        .btn-secondary:hover:not(:disabled) { background: #f8fafc; color: #0f172a; }
        .btn-danger { background: #fef2f2; color: #ef4444; border: 1px solid #fecaca; }
        .btn-danger:hover:not(:disabled) { background: #fee2e2; color: #b91c1c; }
        .btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
      
      <section style={{
        background: '#ffffff',
        borderRadius: 24,
        border: '1px solid #e2e8f0',
        padding: '24px',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#1e293b', letterSpacing: '0px' }}>Administración de Zonas</div>
            <div style={{ marginTop: 4, fontSize: 14, color: '#64748b', fontWeight: 500 }}>
              Proyecto: <span style={{ color: '#4f46e5', fontWeight: 600 }}>{project?.name ?? `#${projectId}`}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              onClick={load}
              disabled={loading || busy}
              className="btn-modern btn-secondary btn"
            >
              Actualizar
            </button>
            <Link to="/admin/proyectos" style={{ fontWeight: 600, fontSize: 13, color: '#4f46e5', textDecoration: 'none', padding: '10px 18px', borderRadius: 12, background: 'rgba(79, 70, 229, 0.1)', display: 'inline-block' }}>
              Volver a Proyectos
            </Link>
          </div>
        </div>

        {error ? (
          <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontWeight: 600, fontSize: 14 }}>{error}</div>
        ) : null}

        {isAdmin ? (
          <div style={{ marginTop: 24, paddingTop: 24, borderTop: '1px solid #f1f5f9' }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 12 }}>Crear Nueva Zona</div>
            <form onSubmit={onCreate} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 250 }}>
                <input
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  placeholder="Ej: Zona Norte, Sector B, etc."
                  className="input-modern"
                />
              </div>
              <button
                type="submit"
                disabled={busy === 'create' || !zoneName.trim()}
                className="btn-modern btn-primary btn"
                style={{ height: 46 }}
              >
                Crear zona
              </button>
            </form>
          </div>
        ) : (
          <div style={{ marginTop: 16, fontSize: 13, color: '#64748b', fontWeight: 500, padding: '12px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>Solo los administradores pueden crear nuevas zonas.</div>
        )}
      </section>

      <section style={{
        background: '#ffffff',
        borderRadius: 24,
        border: '1px solid #e2e8f0',
        overflow: 'hidden',
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{
          padding: '20px 24px',
          borderBottom: '1px solid #f1f5f9',
          background: '#f8fafc',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>Listado de Zonas ({items.length})</div>
          {loading ? <div style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>Cargando...</div> : null}
        </div>

        <div style={{ padding: 24, display: 'grid', gap: 16 }}>
          {rows.length === 0 && !loading ? (
             <div style={{ textAlign: 'center', padding: 32, color: '#94a3b8', fontSize: 14, fontWeight: 500, background: '#f8fafc', borderRadius: 16, border: '1px dashed #cbd5e1' }}>
               No hay zonas registradas en este proyecto aún.
             </div>
          ) : rows.map((z) => (
            <div key={z.id} className="zone-card" style={{ borderRadius: 16, padding: 20, background: '#ffffff', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 4, background: '#6366f1' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap', paddingLeft: 8 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: '#0f172a' }}>{z.name}</div>
                  <div style={{ marginTop: 4, fontSize: 13, color: '#64748b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ padding: '2px 8px', background: '#f1f5f9', borderRadius: 6, fontSize: 11, fontWeight: 600, color: '#475569' }}>ID: {z.id}</span>
                  </div>
                </div>
                {isAdmin ? (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <button
                      onClick={() => startEdit(z)}
                      disabled={busy}
                      className="btn-modern btn-secondary btn"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => removeZone(z)}
                      disabled={busy}
                      className="btn-modern btn-danger btn"
                    >
                      Eliminar
                    </button>
                  </div>
                ) : null}
              </div>

              {editId === z.id ? (
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', paddingLeft: 8 }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="input-modern"
                      autoFocus
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={saveEdit}
                      disabled={busy || !editName.trim()}
                      className="btn-modern btn-primary btn"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={busy}
                      className="btn-modern btn-secondary btn"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
