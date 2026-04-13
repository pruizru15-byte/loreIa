import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

const ToastContext = createContext(null)

function levelStyle(level) {
  const map = {
    BAJO: { bg: '#DCFCE7', fg: '#166534', bd: '#86EFAC', semaforo: '🟢 CONTINUIDAD ÓPTIMA' },
    MEDIO: { bg: '#FEF9C3', fg: '#854D0E', bd: '#FDE047', semaforo: '🟡 PREVENTIVO' },
    ALTO: { bg: '#FFEDD5', fg: '#9A3412', bd: '#FDBA74', semaforo: '🟠 ALERTA MAYOR' },
    'CRÍTICO': { bg: '#FEE2E2', fg: '#991B1B', bd: '#FCA5A5', semaforo: '🔴 PARALIZACIÓN INMINENTE' },
  }
  return map[level] ?? { bg: '#E5E7EB', fg: '#111827', bd: '#D1D5DB', semaforo: '⚪ INFO' }
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const remove = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback(
    (toast) => {
      const id = crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())
      const item = {
        id,
        title: toast.title ?? 'Alerta',
        message: toast.message ?? '',
        level: toast.level,
        actionUrl: toast.actionUrl ?? null,
        createdAt: Date.now(),
        timeoutMs: toast.timeoutMs ?? 10000,
      }
      setToasts((t) => [item, ...t].slice(0, 4))

      if (item.timeoutMs > 0) {
        window.setTimeout(() => remove(id), item.timeoutMs)
      }

      return id
    },
    [remove]
  )

  const value = useMemo(() => ({ push }), [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        style={{
          position: 'fixed',
          right: 14,
          top: 70,
          display: 'grid',
          gap: 10,
          zIndex: 50,
          width: 'min(360px, calc(100vw - 28px))',
        }}
      >
        {toasts.map((t) => {
          const s = levelStyle(t.level)
          return (
            <div
              key={t.id}
              style={{
                background: s.bg,
                color: s.fg,
                border: `1px solid ${s.bd}`,
                borderRadius: 14,
                padding: 12,
                boxShadow: '0 10px 24px rgba(0,0,0,0.08)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ fontWeight: 1000, fontSize: 13 }}>
                  <div style={{ fontSize: 10, letterSpacing: 0.6, opacity: 0.8, marginBottom: 2 }}>
                    SEMÁFORO DE RIESGO: {s.semaforo}
                  </div>
                  {t.title}
                </div>
                <button
                  onClick={() => remove(t.id)}
                  aria-label="Cerrar"
                  style={{
                    border: '1px solid rgba(0,0,0,0.12)',
                    background: 'rgba(255,255,255,0.55)',
                    borderRadius: 10,
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontWeight: 800,
                    color: s.fg,
                  }}
                >
                  X
                </button>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: s.fg, opacity: 0.95, lineHeight: 1.35 }}>
                {t.message}
              </div>
              {t.actionUrl ? (
                <div style={{ marginTop: 10 }}>
                  <Link
                    to={t.actionUrl}
                    style={{
                      display: 'inline-block',
                      background: s.fg,
                      color: s.bg,
                      padding: '6px 14px',
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 900,
                      textDecoration: 'none',
                    }}
                    onClick={() => remove(t.id)}
                  >
                    Ver Recomendación Adaptativa
                  </Link>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToasts() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToasts must be used within ToastProvider')
  return ctx
}
