import { useState, useEffect, useRef } from 'react'
import { Bell, AlertTriangle, Info, CheckCircle2, X } from 'lucide-react'
import { fetchAlerts } from '../lib/api'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function AlertBell() {
  const [alerts, setAlerts] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)

  async function load() {
    try {
      setLoading(true)
      const data = await fetchAlerts(20)
      setAlerts(data.items || [])
    } catch (e) {
      console.error('Error fetching alerts:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const unreadCount = alerts.filter(a => !a.acknowledgedAt).length

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
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
          color: unreadCount > 0 ? '#ef4444' : '#64748b',
          transition: 'all 0.2s',
          position: 'relative'
        }}
      >
        <Bell size={20} fill={unreadCount > 0 ? '#fee2e2' : 'none'} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 18,
              height: 18,
              background: '#ef4444',
              color: 'white',
              fontSize: 10,
              fontWeight: 800,
              borderRadius: 9,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid #ffffff'
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 50,
            right: 0,
            width: 380,
            maxHeight: 500,
            background: '#ffffff',
            borderRadius: 16,
            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
            border: '1px solid #e2e8f0',
            zIndex: 100,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
            <div style={{ fontWeight: 800, fontSize: 14, color: '#1e293b' }}>Notificaciones del Sistema</div>
            <button onClick={() => setIsOpen(false)} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {alerts.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
                <CheckCircle2 size={32} style={{ marginBottom: 12, opacity: 0.2, margin: '0 auto' }} />
                <div style={{ fontSize: 13, fontWeight: 600 }}>No hay alertas activas</div>
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #f1f5f9',
                    background: alert.acknowledgedAt ? 'transparent' : '#fff7ed',
                    display: 'flex',
                    gap: 14,
                    transition: 'background 0.2s'
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: alert.riskLevel === 'ALTO' ? '#fef2f2' : alert.riskLevel === 'MEDIO' ? '#fffbeb' : '#f0f9ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0
                    }}
                  >
                    {alert.riskLevel === 'ALTO' ? (
                      <AlertTriangle size={18} color="#ef4444" />
                    ) : (
                      <Info size={18} color={alert.riskLevel === 'MEDIO' ? '#f59e0b' : '#3b82f6'} />
                    )}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 800,
                          padding: '2px 8px',
                          borderRadius: 6,
                          background: alert.riskLevel === 'ALTO' ? '#ef4444' : alert.riskLevel === 'MEDIO' ? '#f59e0b' : '#3b82f6',
                          color: 'white',
                          textTransform: 'uppercase'
                        }}
                      >
                        {alert.riskLevel}
                      </span>
                      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                        {format(new Date(alert.createdAt), 'd MMM, HH:mm', { locale: es })}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>{alert.probableCause}</div>
                    <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>{alert.recommendation}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, fontWeight: 700 }}>FUENTE: {alert.source || 'SENSORES'}</div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ padding: 12, textAlign: 'center', background: '#f8fafc', borderTop: '1px solid #f1f5f9' }}>
            <button
              onClick={load}
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: '#4f46e5',
                background: 'none',
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Actualizar alertas ahora
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
