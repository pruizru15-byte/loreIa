import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import { Activity, Clock, FileText, Layers, LogOut, Map, MessageSquare, Settings, Shield, ChevronRight, Menu, X, ShieldAlert, Bell } from 'lucide-react'
import { clearSession, getUser } from '../lib/auth'
import AlertBell from './AlertBell'

export default function Layout() {
  const nav = useNavigate()
  const user = getUser()
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    function onResize() {
      const mobile = window.innerWidth < 900
      setIsMobile(mobile)
      if (!mobile) setSidebarOpen(false)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    if (isMobile) setSidebarOpen(false)
  }, [location.pathname, isMobile])

  const topbarCrumbs = useMemo(() => {
    const map = {
      '/': 'Panel Principal',
      '/chat': 'Asistente IA · LORE-IA',
      '/evaluacion': 'Módulo de Recomendaciones Adaptativas',
      '/mapa': 'Panel: Estado de Continuidad Operativa',
      '/historial': 'Historial de Evaluaciones',
      '/reportes': 'Reporte de Eficiencia Operativa',
      '/admin/proyectos': 'Administración de Proyectos',
      '/admin/usuarios': 'Control de Usuarios',
      '/admin/sistema': 'Control Maestro: Sentinel IA'
    }
    return map[location.pathname] || 'Panel Principal'
  }, [location.pathname])

  function logout() {
    clearSession()
    nav('/login', { replace: true })
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#f8fafc',
        color: '#0f172a',
        display: 'flex',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <style>{`
        .sidebar-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: 12px;
          text-decoration: none;
          color: #94a3b8;
          font-weight: 600;
          font-size: 14px;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          border: 1px solid transparent;
        }
        .sidebar-link:hover {
          background: rgba(255,255,255,0.05);
          color: #f8fafc;
        }
        .sidebar-link.active {
          background: linear-gradient(90deg, #4f46e5 0%, #4338ca 100%);
          color: #ffffff;
          font-weight: 500;
          box-shadow: 0 8px 16px -4px rgba(79, 70, 229, 0.3);
          border: 1px solid rgba(99, 102, 241, 0.4);
        }
        .logout-btn {
          transition: all 0.2s;
        }
        .logout-btn:hover {
          background: rgba(239, 68, 68, 0.1) !important;
          color: #ef4444 !important;
          border-color: rgba(239, 68, 68, 0.2) !important;
        }
      `}</style>
      
      {isMobile && sidebarOpen ? (
        <button
          aria-label="Cerrar menú"
          onClick={() => setSidebarOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            backdropFilter: 'blur(4px)',
            border: 'none',
            zIndex: 40,
            cursor: 'pointer',
          }}
        />
      ) : null}

      <aside
        style={{
          position: isMobile ? 'fixed' : 'sticky',
          top: 0,
          left: 0,
          alignSelf: 'stretch',
          height: '100vh',
          width: 280,
          padding: '24px 20px',
          background: '#0a0a0b',
          backgroundImage: 'radial-gradient(circle at top right, rgba(79,70,229,0.15) 0%, transparent 400px)',
          color: '#e2e8f0',
          borderRight: '1px solid rgba(255,255,255,0.05)',
          overflow: 'auto',
          zIndex: 50,
          transform: isMobile ? (sidebarOpen ? 'translateX(0)' : 'translateX(-110%)') : 'translateX(0)',
          transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          boxShadow: isMobile ? '24px 0 48px rgba(2,6,23,0.35)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          gap: 32
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 8 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 8px 16px -4px rgba(79,70,229,0.4)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                <ShieldAlert size={16} strokeWidth={2.5} color="#FFFFFF" />
              </div>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, color: '#f8fafc', letterSpacing: '-0.5px' }}>LORE-IA</div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, letterSpacing: 0.5, marginTop: 2 }}>INTELIGENCIA GEOTÉCNICA</div>
              </div>
            </div>
          </div>

          {isMobile ? (
            <button
              aria-label="Cerrar menú"
              onClick={() => setSidebarOpen(false)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                color: '#e2e8f0',
                cursor: 'pointer',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          ) : null}
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, paddingLeft: 12 }}>Principal</div>
          <NavLink to="/" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`} end>
            <Activity size={18} /><span>Resumen Operativo</span>
          </NavLink>
          <NavLink to="/evaluacion" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Layers size={18} /><span>Evaluación y Simulación</span>
          </NavLink>
          <NavLink to="/mapa" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Map size={18} /><span>Mapa de Continuidad</span>
          </NavLink>
          <NavLink to="/chat" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <MessageSquare size={18} /><span>Asistente IA</span>
          </NavLink>
          
          <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 8, paddingLeft: 12 }}>Análisis</div>
          <NavLink to="/historial" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <Clock size={18} /><span>Historial Data (CSV)</span>
          </NavLink>
          <NavLink to="/reportes" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
            <FileText size={18} /><span>Métricas de Eficiencia</span>
          </NavLink>

          {(user?.role === 'ADMIN' || user?.role === 'INGENIERO') && (
            <>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#475569', textTransform: 'uppercase', letterSpacing: 1, marginTop: 24, marginBottom: 8, paddingLeft: 12 }}>Administración</div>
              <NavLink to="/admin/proyectos" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                <Settings size={18} /><span>Gestión Proyectos</span>
              </NavLink>
              {user?.role === 'ADMIN' && (
                <>
                  <NavLink to="/admin/usuarios" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                    <Shield size={18} /><span>Control de Usuarios</span>
                  </NavLink>
                  <NavLink to="/admin/sistema" className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}>
                    <Activity size={18} /><span>Control Maestro</span>
                  </NavLink>
                </>
              )}
            </>
          )}
        </nav>

        <div>
          {user?.role ? (
            <div style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: 14, marginBottom: 16, border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: '#1e293b', display: 'grid', placeItems: 'center', color: '#94a3b8', fontWeight: 800, fontSize: 14 }}>
                {user.email ? user.email.charAt(0).toUpperCase() : 'U'}
              </div>
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{user.email || 'Usuario LORE-IA'}</div>
                <div style={{ fontSize: 11, color: '#818cf8', fontWeight: 800 }}>ROL: {user.role}</div>
              </div>
            </div>
          ) : null}

          <button
            onClick={logout}
            className="logout-btn"
            style={{
              width: '100%',
              padding: '14px 16px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              color: '#94a3b8',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
            }}
          >
            <LogOut size={16} strokeWidth={2} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'rgba(255,255,255,0.85)',
            backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(226,232,240,0.8)',
            height: 72,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <div style={{ padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {isMobile ? (
                <button
                  aria-label="Abrir menú"
                  onClick={() => setSidebarOpen(true)}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    border: '1px solid #e2e8f0',
                    background: '#ffffff',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#64748b',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                  }}
                >
                  <Menu size={20} />
                </button>
              ) : null}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1e293b', margin: 0, letterSpacing: '0px' }}>
                  {topbarCrumbs}
                </h1>
              </div>
            </div>

            <div style={{ display: isMobile ? 'none' : 'flex', alignItems: 'center', gap: 16 }}>
              <AlertBell />
              <div style={{ padding: '6px 12px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 999, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: '#10b981' }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: '#047857' }}>Sistema Activo</span>
              </div>
            </div>
          </div>
        </header>

        <main style={{ flex: 1, padding: isMobile ? 16 : 32, width: '100%', boxSizing: 'border-box' }}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
