import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, forgotPassword, verifyResetCode, resetPassword } from '../lib/api'
import { setSession } from '../lib/auth'
import { KeyRound, Mail, ShieldAlert, ArrowRight, Activity, Map, ArrowLeft, CheckCircle } from 'lucide-react'

export default function LoginPage() {
  const nav = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [focused, setFocused] = useState(null)
  
  // Recovery states: 'login' | 'forgot' | 'verify' | 'reset'
  const [view, setView] = useState('login')
  const [resetCode, setResetCode] = useState('')
  const [newPassword, setNewPassword] = useState('')

  async function onSubmitLogin(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const r = await login(email, password)
      setSession({ token: r.token, user: r.user })
      nav('/', { replace: true })
    } catch (err) {
      setError(err?.message ?? 'Credenciales incorrectas')
    } finally {
      setLoading(false)
    }
  }

  async function onForgot(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await forgotPassword(email)
      setSuccess('Código enviado. Revisa tu correo.')
      setView('verify')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function onVerify(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await verifyResetCode(email, resetCode)
      setError('')
      setSuccess('Código verificado con éxito.')
      setView('reset')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function onReset(e) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await resetPassword({ email, code: resetCode, newPassword })
      setSuccess('Contraseña actualizada con éxito. Ya puedes iniciar sesión.')
      setView('login')
      setPassword('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const resetFlow = () => {
    setView('login')
    setError('')
    setSuccess('')
    setResetCode('')
    setNewPassword('')
  }

  return (
    <>
      <style>{`
        .login-grid { grid-template-columns: 1fr 1fr; }
        @media (max-width: 900px) {
          .login-grid { grid-template-columns: 1fr; }
          .brand-panel { display: none !important; }
        }
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(10px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ position: 'absolute', top: '-10%', left: '-5%', width: 600, height: 600, background: '#4338ca', filter: 'blur(120px)', borderRadius: '50%', opacity: 0.35, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: 500, height: 500, background: '#0d9488', filter: 'blur(100px)', borderRadius: '50%', opacity: 0.25, pointerEvents: 'none' }} />

        <div className="login-grid" style={{
          width: '100%',
          maxWidth: 1000,
          display: 'grid',
          background: 'rgba(255, 255, 255, 0.03)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          position: 'relative',
          zIndex: 10
        }}>
          <div className="brand-panel" style={{
            padding: 48,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: 'linear-gradient(180deg, rgba(30,30,40,0.4) 0%, rgba(15,23,42,0.6) 100%)',
            borderRight: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            <div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, background: 'rgba(99, 102, 241, 0.15)', padding: '6px 14px', borderRadius: 999, border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                <ShieldAlert size={16} color="#818cf8" />
                <span style={{ color: '#c7d2fe', fontWeight: 800, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' }}>Acceso Restringido</span>
              </div>
              <h1 style={{ marginTop: 40, fontSize: 44, fontWeight: 900, color: '#ffffff', lineHeight: 1.1, letterSpacing: '-1.5px' }}>
                Sistema de <br/><span style={{ color: '#818cf8' }}>Inteligencia Geotécnica</span>
              </h1>
              <p style={{ marginTop: 24, fontSize: 16, color: '#94a3b8', lineHeight: 1.6, fontWeight: 500, maxWidth: '90%' }}>
                Plataforma de monitoreo, análisis y evaluación orientada a asegurar la <b>Continuidad Operativa</b> en base a modelos predictivos.
              </p>
            </div>
          </div>

          <div style={{ padding: '64px 48px', background: '#ffffff', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div key={view} style={{ maxWidth: 360, width: '100%', margin: '0 auto', animation: 'slideIn 0.3s ease-out' }}>
              
              {view !== 'login' && (
                <button onClick={resetFlow} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', marginBottom: 20, padding: 0 }}>
                  <ArrowLeft size={16} /> Volver al Login
                </button>
              )}

              <h2 style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', letterSpacing: '-1px' }}>
                {view === 'login' && 'Iniciar Sesión'}
                {view === 'forgot' && 'Recuperar Cuenta'}
                {view === 'verify' && 'Verificar Código'}
                {view === 'reset' && 'Nueva Contraseña'}
              </h2>
              
              <p style={{ color: '#64748b', fontSize: 15, marginTop: 8, fontWeight: 500, lineHeight: 1.5 }}>
                {view === 'login' && 'Bienvenido al centro de mando. Ingresa tus credenciales para acceder.'}
                {view === 'forgot' && 'Ingresa tu correo electrónico para recibir un código de seguridad.'}
                {view === 'verify' && 'Hemos enviado un código a tu correo. Por favor ingresalo abajo.'}
                {view === 'reset' && 'Crea una nueva contraseña segura para tu cuenta.'}
              </p>

              {view === 'login' && (
                <form onSubmit={onSubmitLogin} style={{ marginTop: 32, display: 'grid', gap: 20 }}>
                  <Field label="Correo Institucional" icon={<Mail size={18} />} type="email" value={email} onChange={setEmail} placeholder="admin@demo.com" focused={focused === 'email'} onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} />
                  <Field label="Contraseña" icon={<KeyRound size={18} />} type="password" value={password} onChange={setPassword} placeholder="••••••••" focused={focused === 'pass'} onFocus={() => setFocused('pass')} onBlur={() => setFocused(null)} />
                  <div style={{ textAlign: 'right' }}>
                    <button type="button" onClick={() => {setView('forgot'); setError(''); setSuccess('')}} style={{ background: 'none', border: 'none', color: '#6366f1', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>¿Olvidaste tu contraseña?</button>
                  </div>
                  <ErrorMsg error={error} />
                  <SuccessMsg msg={success} />
                  <SubmitBtn loading={loading} text="Acceder al Sistema" />
                </form>
              )}

              {view === 'forgot' && (
                <form onSubmit={onForgot} style={{ marginTop: 32, display: 'grid', gap: 20 }}>
                  <Field label="Correo Electrónico" icon={<Mail size={18} />} type="email" value={email} onChange={setEmail} placeholder="tu@correo.com" focused={focused === 'email'} onFocus={() => setFocused('email')} onBlur={() => setFocused(null)} />
                  <ErrorMsg error={error} />
                  <SubmitBtn loading={loading} text="Enviar Código" />
                </form>
              )}

              {view === 'verify' && (
                <form onSubmit={onVerify} style={{ marginTop: 32, display: 'grid', gap: 20 }}>
                  <Field label="Código de 6 dígitos" icon={<ShieldAlert size={18} />} type="text" value={resetCode} onChange={setResetCode} placeholder="000000" focused={focused === 'code'} onFocus={() => setFocused('code')} onBlur={() => setFocused(null)} maxLength={6} />
                  <ErrorMsg error={error} />
                  <SuccessMsg msg={success} />
                  <SubmitBtn loading={loading} text="Verificar Código" />
                </form>
              )}

              {view === 'reset' && (
                <form onSubmit={onReset} style={{ marginTop: 32, display: 'grid', gap: 20 }}>
                  <Field label="Nueva Contraseña" icon={<KeyRound size={18} />} type="password" value={newPassword} onChange={setNewPassword} placeholder="••••••••" focused={focused === 'newpass'} onFocus={() => setFocused('newpass')} onBlur={() => setFocused(null)} />
                  <ErrorMsg error={error} />
                  <SubmitBtn loading={loading} text="Cambiar Contraseña" />
                </form>
              )}

              <div style={{ marginTop: 40, textAlign: 'center', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>
                LORE-IA © {new Date().getFullYear()}. Análisis Predictivo de Riesgos.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function Field({ label, icon, ...props }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#475569', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <div style={{ position: 'absolute', left: 16, color: props.focused ? '#4f46e5' : '#94a3b8', transition: 'color 0.2s' }}>{icon}</div>
        <input
          {...props}
          onChange={(e) => props.onChange(e.target.value)}
          required
          style={{
            width: '100%',
            padding: '14px 16px 14px 46px',
            background: props.focused ? '#ffffff' : '#f8fafc',
            border: `2px solid ${props.focused ? '#4f46e5' : '#e2e8f0'}`,
            borderRadius: 14,
            fontSize: 15,
            color: '#0f172a',
            outline: 'none',
            transition: 'all 0.2s',
            fontWeight: 600
          }}
        />
      </div>
    </div>
  )
}

function SubmitBtn({ loading, text }) {
  return (
    <button
      type="submit"
      disabled={loading}
      style={{
        marginTop: 8,
        padding: '16px',
        borderRadius: 14,
        background: loading ? '#6366f1' : '#4f46e5',
        color: '#ffffff',
        fontWeight: 800,
        fontSize: 16,
        border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        transition: 'all 0.2s',
        boxShadow: '0 8px 16px -4px rgba(79, 70, 229, 0.4)'
      }}
    >
      {loading ? 'Procesando...' : text}
      {!loading && <ArrowRight size={20} />}
    </button>
  )
}

function ErrorMsg({ error }) {
  if (!error) return null
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
      <ShieldAlert size={18} />
      {error}
    </div>
  )
}

function SuccessMsg({ msg }) {
  if (!msg) return null
  return (
    <div style={{ padding: '12px 14px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #86efac', color: '#166534', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
      <CheckCircle size={18} />
      {msg}
    </div>
  )
}
