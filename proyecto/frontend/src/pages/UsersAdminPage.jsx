import { useEffect, useMemo, useState } from 'react'
import { createUserAdmin, fetchUsersAdmin } from '../lib/api'
import {
  Users,
  Plus,
  RefreshCw,
  X,
  ShieldAlert,
  Search,
  Mail,
  Lock,
  Shield,
  UserCheck,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

/* ─── Role badge config ─── */
function getRoleMeta(role) {
  const r = String(role || '').toUpperCase()
  if (r === 'ADMIN') return { label: 'Admin', bg: '#fef3c7', color: '#92400e', border: '#fde68a' }
  if (r === 'GERENTE') return { label: 'Gerente', bg: '#dcfce7', color: '#166534', border: '#bbf7d0' }
  return { label: 'Ingeniero', bg: '#eff6ff', color: '#1e40af', border: '#bfdbfe' }
}

function RoleBadge({ role }) {
  const { label, bg, color, border } = getRoleMeta(role)
  return (
    <span
      style={{
        padding: '4px 12px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 900,
        letterSpacing: 0.4,
        textTransform: 'uppercase',
        background: bg,
        color,
        border: `1px solid ${border}`,
        display: 'inline-block',
      }}
    >
      {label}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <label className="ua-label">{label}</label>
      {children}
    </div>
  )
}

const ITEMS_PER_PAGE = 8

export default function UsersAdminPage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [items, setItems] = useState([])

  /* form */
  const [showCreate, setShowCreate] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('INGENIERO')

  /* search & pagination */
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const r = await fetchUsersAdmin()
      setItems(r?.items ?? [])
    } catch (e) {
      setError(e?.message ?? 'Error al cargar usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const canSubmit = useMemo(() => {
    if (!email || !password || !role) return false
    return String(password).length >= 6
  }, [email, password, role])

  function closeCreate() {
    setShowCreate(false)
    setEmail('')
    setPassword('')
    setRole('INGENIERO')
  }

  async function onCreate(e) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    setError('')
    try {
      await createUserAdmin({ email, password, role })
      closeCreate()
      await load()
      setPage(1)
    } catch (e2) {
      setError(e2?.message ?? 'No se pudo crear el usuario')
    } finally {
      setBusy(false)
    }
  }

  /* derived */
  const filtered = useMemo(() => {
    let arr = items.slice().sort((a, b) => Number(b.id) - Number(a.id))
    if (search.trim()) {
      const q = search.toLowerCase()
      arr = arr.filter(
        (u) =>
          (u.email || '').toLowerCase().includes(q) ||
          (u.role || '').toLowerCase().includes(q)
      )
    }
    return arr
  }, [items, search])

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE))
  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [totalPages, page])

  const paginated = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE
    return filtered.slice(start, start + ITEMS_PER_PAGE)
  }, [filtered, page])

  return (
    <div style={{ display: 'grid', gap: 24, paddingBottom: 40, animation: 'ua-fadeIn 0.4s ease-out' }}>
      <style>{`
        @keyframes ua-fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }

        .ua-card { background: #ffffff; border-radius: 24px; border: 1px solid #e2e8f0; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.04); }
        .ua-input { padding: 11px 16px; border-radius: 12px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 14px; color: #1e293b; width: 100%; transition: all 0.2s; outline: none; font-weight: 600; font-family: inherit; box-sizing: border-box; }
        .ua-input:focus { background: #ffffff; border-color: #818cf8; box-shadow: 0 0 0 3px rgba(129,140,248,0.15); }
        .ua-label { font-size: 11px; font-weight: 900; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; display: block; }

        .ua-btn { padding: 10px 18px; border-radius: 14px; font-weight: 800; font-size: 13px; font-family: inherit; display: inline-flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all 0.2s; border: none; outline: none; }
        .ua-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .ua-btn-primary { background: #4f46e5; color: #ffffff; box-shadow: 0 4px 12px rgba(79,70,229,0.3); }
        .ua-btn-primary:hover:not(:disabled) { background: #4338ca; transform: translateY(-1px); box-shadow: 0 6px 16px rgba(79,70,229,0.4); }
        .ua-btn-secondary { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1 !important; }
        .ua-btn-secondary:hover:not(:disabled) { background: #e2e8f0; color: #0f172a; }
        .ua-btn-ghost { background: transparent; color: #64748b; padding: 8px; border-radius: 10px; border: none; cursor: pointer; transition: 0.2s; }
        .ua-btn-ghost:hover { background: #f1f5f9; color: #0f172a; }

        .ua-icon-box { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; background: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe; flex-shrink: 0; }

        .ua-table-row { transition: background 0.15s; border-bottom: 1px solid #f1f5f9; }
        .ua-table-row:last-child { border-bottom: none; }
        .ua-table-row:hover { background: #f8fafc; }

        .ua-modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15,23,42,0.45); backdrop-filter: blur(6px); z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 20px; animation: ua-fadeIn 0.2s ease-out; }
        .ua-modal { background: #ffffff; width: 100%; max-width: 480px; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); overflow: hidden; display: flex; flex-direction: column; max-height: 90vh; }
        .ua-modal-header { padding: 20px 24px; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; background: #fafafa; }
        .ua-modal-body { padding: 24px; overflow-y: auto; display: grid; gap: 16px; }
        .ua-modal-footer { padding: 16px 24px; border-top: 1px solid #e2e8f0; background: #fafafa; display: flex; justify-content: flex-end; gap: 10px; }

        .ua-pagination { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px; background: #f8fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 24px 24px; }

        .ua-input-icon { position: relative; }
        .ua-input-icon svg { position: absolute; left: 13px; top: 50%; transform: translateY(-50%); pointer-events: none; }
        .ua-input-icon .ua-input { padding-left: 40px; }

        .ua-spinning { animation: ua-spin 1s linear infinite; }
        @keyframes ua-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        .ua-empty { padding: 56px 20px; text-align: center; color: #94a3b8; }
        .ua-empty-icon { width: 56px; height: 56px; border-radius: 16px; background: #f1f5f9; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; }
      `}</style>

      {/* ── HEADER ── */}
      <section
        className="ua-card"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div className="ua-icon-box">
            <Users size={24} strokeWidth={2.2} />
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.4px' }}>
              Gestión de Usuarios
            </div>
            <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginTop: 3 }}>
              Administra accesos y roles del sistema · Solo ADMIN
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button className="ua-btn ua-btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={15} strokeWidth={2.5} className={loading ? 'ua-spinning' : ''} />
            {loading ? 'Cargando...' : 'Refrescar'}
          </button>
          <button className="ua-btn ua-btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={17} strokeWidth={2.5} />
            Nuevo Usuario
          </button>
        </div>
      </section>

      {/* ── ERROR ── */}
      {error && (
        <div
          style={{
            padding: '14px 20px',
            borderRadius: 16,
            background: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 14,
          }}
        >
          <ShieldAlert size={18} style={{ flexShrink: 0 }} /> {error}
        </div>
      )}

      {/* ── LIST ── */}
      <section className="ua-card" style={{ padding: 0, display: 'flex', flexDirection: 'column' }}>
        {/* toolbar */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            background: '#fafaf9',
            borderRadius: '24px 24px 0 0',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'center',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              padding: '10px 16px',
              borderRadius: 12,
              width: '100%',
              maxWidth: 360,
            }}
          >
            <Search size={17} color="#94a3b8" style={{ flexShrink: 0 }} />
            <input
              type="text"
              placeholder="Buscar por email o rol..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              style={{
                border: 'none',
                outline: 'none',
                background: 'transparent',
                width: '100%',
                fontSize: 14,
                fontWeight: 600,
                color: '#1e293b',
              }}
            />
          </div>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 700 }}>
            {filtered.length} {filtered.length === 1 ? 'usuario' : 'usuarios'}
          </div>
        </div>

        {/* table */}
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                {['ID', 'Email', 'Rol', 'Fecha de creación'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '13px 20px',
                      color: '#475569',
                      fontWeight: 900,
                      fontSize: 11,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginated.map((u) => (
                <tr key={u.id} className="ua-table-row">
                  <td style={{ padding: '15px 20px', fontWeight: 800, color: '#94a3b8', fontSize: 13 }}>
                    #{u.id}
                  </td>
                  <td style={{ padding: '15px 20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: 10,
                          background: '#eef2ff',
                          border: '1px solid #c7d2fe',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <UserCheck size={16} color="#4f46e5" strokeWidth={2.2} />
                      </div>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{u.email}</span>
                    </div>
                  </td>
                  <td style={{ padding: '15px 20px' }}>
                    <RoleBadge role={u.role} />
                  </td>
                  <td style={{ padding: '15px 20px', fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                    {u.createdAt
                      ? new Date(u.createdAt).toLocaleString('es-PE', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : <span style={{ color: '#cbd5e1' }}>—</span>}
                  </td>
                </tr>
              ))}

              {paginated.length === 0 && (
                <tr>
                  <td colSpan="4">
                    <div className="ua-empty">
                      <div className="ua-empty-icon">
                        <Users size={24} color="#94a3b8" />
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>
                        {loading ? 'Cargando usuarios...' : 'No se encontraron usuarios.'}
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* pagination */}
        <div className="ua-pagination">
          <button
            className="ua-btn ua-btn-secondary"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{ padding: '8px 14px' }}
          >
            <ChevronLeft size={16} /> Anterior
          </button>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#475569' }}>
            Página <span style={{ color: '#0f172a' }}>{page}</span> de{' '}
            <span style={{ color: '#0f172a' }}>{totalPages}</span>
          </div>
          <button
            className="ua-btn ua-btn-secondary"
            disabled={page === totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{ padding: '8px 14px' }}
          >
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      </section>

      {/* ── CREATE MODAL ── */}
      {showCreate && (
        <div className="ua-modal-overlay" onClick={closeCreate}>
          <div className="ua-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ua-modal-header">
              <div
                style={{
                  fontSize: 17,
                  fontWeight: 900,
                  color: '#0f172a',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <div
                  style={{
                    background: '#eef2ff',
                    padding: 8,
                    borderRadius: 10,
                    color: '#4f46e5',
                    border: '1px solid #c7d2fe',
                  }}
                >
                  <Plus size={18} />
                </div>
                Registrar Nuevo Usuario
              </div>
              <button className="ua-btn-ghost" onClick={closeCreate}>
                <X size={20} />
              </button>
            </div>

            <form id="ua-form-create" onSubmit={onCreate} className="ua-modal-body">
              <Field label="Correo electrónico">
                <div className="ua-input-icon">
                  <Mail size={15} color="#94a3b8" />
                  <input
                    required
                    type="email"
                    className="ua-input"
                    placeholder="usuario@empresa.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </Field>

              <Field label="Contraseña (mín. 6 caracteres)">
                <div className="ua-input-icon">
                  <Lock size={15} color="#94a3b8" />
                  <input
                    required
                    type="password"
                    className="ua-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={6}
                  />
                </div>
              </Field>

              <Field label="Rol del sistema">
                <div className="ua-input-icon">
                  <Shield size={15} color="#94a3b8" />
                  <select
                    className="ua-input"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    <option value="ADMIN">Admin</option>
                    <option value="INGENIERO">Ingeniero</option>
                    <option value="GERENTE">Gerente</option>
                  </select>
                </div>
              </Field>

              {/* Role hint */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 12,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  fontSize: 12,
                  color: '#64748b',
                  lineHeight: 1.6,
                  fontWeight: 600,
                }}
              >
                <strong style={{ color: '#0f172a' }}>Admin</strong> — acceso total · <strong style={{ color: '#0f172a' }}>Ingeniero</strong> — lectura/escritura · <strong style={{ color: '#0f172a' }}>Gerente</strong> — solo lectura
              </div>
            </form>

            <div className="ua-modal-footer">
              <button
                type="button"
                className="ua-btn ua-btn-secondary"
                onClick={closeCreate}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="submit"
                form="ua-form-create"
                className="ua-btn ua-btn-primary"
                disabled={busy || !canSubmit}
              >
                {busy ? 'Creando...' : 'Crear Usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
