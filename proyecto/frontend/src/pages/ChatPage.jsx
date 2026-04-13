import { useEffect, useRef, useState, useCallback } from 'react'
import {
  MessageSquare,
  Send,
  RefreshCw,
  Bot,
  User,
  AlertCircle,
  Wifi,
  WifiOff,
  Sparkles,
  Settings,
  ChevronDown,
  Trash2,
  Plus,
  Clock,
} from 'lucide-react'
import { 
  checkChatStatus, 
  startOllama,
  fetchChatSessions,
  fetchChatMessages,
  createChatSession,
  deleteChatSession
} from '../lib/api'
import { getUser } from '../lib/auth'
import { ui } from '../lib/ui'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001'

const SUGGESTIONS = [
  '¿Cuántos proyectos activos hay en el sistema?',
  '¿Hay alertas críticas sin resolver?',
  '¿Cuál es el estado de las actividades en progreso?',
  '¿Qué proyectos tienen perfiles geotécnicos de alto riesgo?',
  '¿Cuántos usuarios hay registrados y cuáles son sus roles?',
  'Resume el estado general del sistema',
  '¿Cuáles son las alertas más recientes?',
  '¿Qué zonas tienen actividad geotécnica registrada?',
]

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '10px 4px' }}>
      {[0, 1, 2].map(i => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #6366f1, #818cf8)',
            animation: `typing-bounce 1.4s infinite ease-in-out both`,
            animationDelay: `${i * 0.16}s`,
            opacity: 0.6,
          }}
        />
      ))}
    </div>
  )
}

function MessageBubble({ msg }) {
  const isUser = msg.role === 'user'
  const isError = msg.error
  const isAssistant = msg.role === 'assistant'

  return (
    <div
      style={{
        display: 'flex',
        gap: 14,
        flexDirection: isUser ? 'row-reverse' : 'row',
        alignItems: 'flex-start',
        animation: 'chat-flow-in 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {/* Avatar with Glow */}
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 14,
          background: isUser
            ? 'linear-gradient(135deg, #4f46e5, #4338ca)'
            : isError
            ? '#fee2e2'
            : 'linear-gradient(135deg, #0f172a, #1e293b)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          border: isUser
            ? '1px solid rgba(99,102,241,0.5)'
            : isError
            ? '1px solid #fca5a5'
            : '1px solid rgba(255,255,255,0.1)',
          boxShadow: isUser
            ? '0 4px 14px rgba(79,70,229,0.3)'
            : '0 4px 14px rgba(0,0,0,0.15)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {isUser ? (
          <User size={19} color="#fff" strokeWidth={2.5} />
        ) : isError ? (
          <AlertCircle size={19} color="#ef4444" strokeWidth={2.5} />
        ) : (
          <>
            <Bot size={19} color="#818cf8" strokeWidth={2.5} />
            {msg.typing && (
              <div style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(129, 140, 248, 0.1)',
                animation: 'pulse-avatar 2s infinite ease-in-out'
              }} />
            )}
          </>
        )}
      </div>

      {/* Bubble with Glassmorphism and better typography */}
      <div style={{ maxWidth: '75%', minWidth: 80, position: 'relative' }}>
        <div
          style={{
            padding: '14px 18px',
            borderRadius: isUser ? '20px 4px 20px 20px' : '4px 20px 20px 20px',
            background: isUser
              ? 'linear-gradient(135deg, #4f46e5, #4338ca)'
              : isError
              ? '#fff5f5'
              : '#ffffff',
            color: isUser ? '#ffffff' : isError ? '#b91c1c' : '#1e293b',
            fontSize: '14.5px',
            lineHeight: 1.7,
            fontWeight: isUser ? 600 : 500,
            boxShadow: isUser
              ? '0 10px 25px -5px rgba(79,70,229,0.3)'
              : '0 4px 20px -2px rgba(0,0,0,0.06), 0 2px 10px -2px rgba(0,0,0,0.02)',
            border: isUser
              ? '1px solid rgba(255,255,255,0.1)'
              : isError
              ? '1px solid #fecaca'
              : '1px solid #f1f5f9',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            transition: 'all 0.3s ease',
          }}
        >
          {msg.typing ? <TypingIndicator /> : (
            <>
              {msg.content}
              {!isUser && msg.isStreaming && (
                <span style={{
                  display: 'inline-block',
                  width: 8,
                  height: 15,
                  background: '#818cf8',
                  marginLeft: 4,
                  verticalAlign: 'middle',
                  animation: 'cursor-blink 0.8s infinite step-end'
                }} />
              )}
            </>
          )}
        </div>
        {msg.ts && (
          <div
            style={{
              fontSize: 10,
              color: '#94a3b8',
              marginTop: 6,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              textAlign: isUser ? 'right' : 'left',
              paddingLeft: isUser ? 0 : 4,
              paddingRight: isUser ? 4 : 0,
            }}
          >
            {new Date(msg.ts).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatPage() {
  const user = getUser()
  const [sessions, setSessions] = useState([])
  const [currentSessionId, setCurrentSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [ollamaStatus, setOllamaStatus] = useState({ available: null, models: [] })
  const [isStartingOllama, setIsStartingOllama] = useState(false)
  const [model, setModel] = useState('llama3.2')
  const [showSettings, setShowSettings] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const abortRef = useRef(null)

  const buildHistory = useCallback(() => {
    return messages
      .filter(m => m.id !== 'welcome' && !m.error && !m.typing)
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }))
  }, [messages])

  const loadSessions = async () => {
    try {
      const data = await fetchChatSessions()
      setSessions(data)
    } catch (err) {
      console.error(err)
    }
  }

  const selectSession = async (id) => {
    if (isLoading) return
    setCurrentSessionId(id)
    try {
      const { messages: msgs } = await fetchChatMessages(id)
      setMessages(msgs.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
        ts: m.created_at
      })))
    } catch (err) {
      ui.notify('Error al cargar mensajes', 'error')
    }
  }

  const handleNewChat = () => {
    setCurrentSessionId(null)
    setMessages([])
    inputRef.current?.focus()
  }

  const handleDeleteSession = async (e, id) => {
    e.stopPropagation()
    if (!confirm('¿Borrar esta conversación?')) return
    try {
      await deleteChatSession(id)
      if (currentSessionId === id) {
        handleNewChat()
      }
      loadSessions()
    } catch (err) {
      ui.notify('Error al borrar', 'error')
    }
  }

  async function checkStatus() {
    try {
      const s = await checkChatStatus()
      setOllamaStatus(s)
      if (s.available && s.models.length > 0 && !s.models.includes(model)) {
        setModel(s.models[0])
      }
    } catch {
      setOllamaStatus({ available: false, models: [] })
    }
  }

  async function handleStartOllama() {
    setIsStartingOllama(true)
    try {
      await startOllama()
      setTimeout(checkStatus, 3000)
    } catch (err) {
      ui.notify(err.message, 'error')
    } finally {
      setIsStartingOllama(false)
    }
  }

  useEffect(() => {
    checkStatus()
    loadSessions()
    const interval = setInterval(checkStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text) {
    const trimmed = (text ?? input).trim()
    if (!trimmed || isLoading) return
    setInput('')

    const userMsg = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      ts: new Date().toISOString(),
    }
    const typingId = `t-${Date.now()}`
    const typingMsg = { id: typingId, role: 'assistant', typing: true, ts: new Date().toISOString() }

    // Immediate feedback
    setMessages(prev => [...prev, userMsg, typingMsg])
    setIsLoading(true)

    let activeSessionId = currentSessionId

    // If no session, create one
    if (!activeSessionId) {
      try {
        const newSession = await createChatSession(trimmed.substring(0, 40))
        activeSessionId = newSession.id
        setCurrentSessionId(activeSessionId)
        loadSessions()
      } catch (err) {
        setMessages(prev => [
          ...prev.filter(m => m.id !== typingId),
          { id: `err-${Date.now()}`, role: 'assistant', content: 'No se pudo iniciar la sesión. ' + err.message, error: true, ts: new Date().toISOString() }
        ])
        setIsLoading(false)
        return
      }
    }

    const token = localStorage.getItem('geotech_token') || ''
    const history = buildHistory()
    const controller = new AbortController()
    abortRef.current = controller

    let fullText = ''
    const assistantId = `a-${Date.now()}`

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message: trimmed, history, model, sessionId: activeSessionId }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const errText = await res.text()
        throw new Error(errText || 'Error del servidor')
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      setMessages(prev => [
        ...prev.filter(m => m.id !== typingId),
        { id: assistantId, role: 'assistant', content: '', ts: new Date().toISOString(), isStreaming: true },
      ])

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          const jsonStr = line.slice(6)
          try {
            const parsed = JSON.parse(jsonStr)
            if (parsed.error) {
              setMessages(prev => [
                ...prev.filter(m => m.id !== assistantId),
                { id: assistantId, role: 'assistant', content: parsed.error, error: true, ts: new Date().toISOString() },
              ])
              return
            }
            if (parsed.token) {
              fullText += parsed.token
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, content: fullText } : m)
              )
            }
            if (parsed.done) {
              setMessages(prev =>
                prev.map(m => m.id === assistantId ? { ...m, isStreaming: false } : m)
              )
              // Refresh sessions to get updated title
              loadSessions()
            }
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, isStreaming: false } : m))
        return
      }
      setMessages(prev => [
        ...prev.filter(m => m.id !== typingId && m.id !== assistantId),
        { id: `err-${Date.now()}`, role: 'assistant', content: err.message, error: true, ts: new Date().toISOString() },
      ])
    } finally {
      setIsLoading(false)
      abortRef.current = null
      inputRef.current?.focus()
    }
  }

  function stopGeneration() {
    abortRef.current?.abort()
    setIsLoading(false)
  }

  function clearChat() {
    setMessages(prev => [prev[0]])
    setShowSuggestions(true)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const statusColor = ollamaStatus.available === null ? '#94a3b8' : ollamaStatus.available ? '#10b981' : '#f59e0b'

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 72px)', background: '#f8fafc', overflow: 'hidden' }}>
      <style>{`
        @keyframes chat-flow-in { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.6; } 30% { transform: translateY(-4px); opacity: 1; } }
        @keyframes pulse-avatar { 0% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.4); opacity: 0; } 100% { transform: scale(1); opacity: 0; } }
        @keyframes cursor-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        .cursor-blink { animation: cursor-blink 0.8s infinite step-end; }
        .chat-sidebar { width: 280px; background: #fff; border-right: 1px solid #e2e8f0; display: flex; flex-direction: column; transition: all 0.3s ease; }
        .session-item { padding: 12px 16px; margin: 4px 8px; border-radius: 12px; cursor: pointer; display: flex; align-items: center; gap: 10px; transition: all 0.2s; position: relative; }
        .session-item:hover { background: #f1f5f9; }
        .session-item.active { background: #eef2ff; border: 1px solid #c7d2fe; }
        .session-title { font-size: 13px; font-weight: 600; color: #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
        .session-item.active .session-title { color: #4f46e5; }
        .delete-btn { opacity: 0; transition: opacity 0.2s; padding: 4px; border-radius: 6px; color: #94a3b8; border: none; background: transparent; cursor: pointer; }
        .session-item:hover .delete-btn { opacity: 1; }
        .delete-btn:hover { background: #fee2e2; color: #ef4444; }
        .chat-main { flex: 1; display: flex; flex-direction: column; min-width: 0; position: relative; }
        .chat-input-area { background: #ffffff; border-top: 1px solid #e2e8f0; padding: 16px 24px; }
        .chat-input-container { display: flex; gap: 12px; align-items: flex-end; background: #f8fafc; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 12px 16px; transition: all 0.2s; }
        .chat-input-container:focus-within { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,0.1); }
        .chat-input { resize: none; border: none; outline: none; background: transparent; width: 100%; font-size: 14px; color: #1e293b; line-height: 1.5; max-height: 120px; font-weight: 500; font-family: inherit; }
        .chat-send-btn { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #4f46e5, #4338ca); border: none; cursor: pointer; color: white; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .chat-send-btn:disabled { opacity: 0.5; background: #94a3b8; cursor: not-allowed; }
        .chat-suggestion { padding: 8px 14px; border-radius: 999px; background: #f8fafc; border: 1px solid #e2e8f0; font-size: 12px; font-weight: 700; color: #475569; cursor: pointer; transition: all 0.2s; white-space: nowrap; font-family: inherit; }
        .chat-suggestion:hover { background: #eef2ff; border-color: #c7d2fe; color: #4f46e5; }
        .chat-ghost-btn { background: transparent; border: 1px solid #e2e8f0; border-radius: 10px; padding: 6px 10px; cursor: pointer; color: #64748b; font-size: 12px; font-weight: 700; display: flex; align-items: center; gap: 6px; transition: all 0.2s; font-family: inherit; }
        .chat-ghost-btn:hover { background: #f8fafc; color: #0f172a; }
        .settings-panel { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 16px; padding: 16px; }
        .chat-stop-btn { border: none; background: #fee2e2; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .chat-stop-btn:hover { background: #fecaca; }
      `}</style>

      {/* ── SIDEBAR ── */}
      <div className="chat-sidebar" style={{ marginLeft: isSidebarOpen ? 0 : -280 }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid #f1f5f9' }}>
          <button
            onClick={handleNewChat}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: 12,
              background: 'linear-gradient(135deg, #4f46e5, #4338ca)',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              fontSize: 14,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(79,70,229,0.2)'
            }}
          >
            <Plus size={18} /> Nueva IA Chat
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
          <div style={{ padding: '0 20px 10px', fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.8 }}>
            Conversaciones recientes
          </div>
          {sessions.map(s => (
            <div
              key={s.id}
              className={`session-item ${currentSessionId === s.id ? 'active' : ''}`}
              onClick={() => selectSession(s.id)}
            >
              <MessageSquare size={16} color={currentSessionId === s.id ? '#4f46e5' : '#94a3b8'} />
              <div className="session-title">{s.title}</div>
              <button className="delete-btn" onClick={(e) => handleDeleteSession(e, s.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          {sessions.length === 0 && (
            <div style={{ padding: '40px 20px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
              No hay chats guardados
            </div>
          )}
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid #f1f5f9', background: '#f8fafc' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
            <div style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>
              {ollamaStatus.available ? 'Ollama: Disponible' : 'Ollama: Offline'}
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div className="chat-main">
        {/* Header */}
        <div style={{ height: 64, background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{ padding: '8px', background: '#f1f5f9', borderRadius: 10, cursor: 'pointer', color: '#64748b' }}
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              title="Toggle Sidebar"
            >
              <MessageSquare size={18} />
            </div>
            <div style={{ fontWeight: 800, fontSize: 16, color: '#1e293b' }}>
              {currentSessionId ? sessions.find(s => s.id === currentSessionId)?.title : 'Nuevo Chat con LORE-IA'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button className="chat-ghost-btn" onClick={() => setShowSettings(!showSettings)}>
              <Settings size={14} /> {showSettings ? 'Ocultar' : 'IA Config'}
            </button>
            <button className="chat-ghost-btn" onClick={checkStatus}>
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Settings panel overlay */}
        {showSettings && (
          <div style={{ padding: '16px 24px', background: '#fff', borderBottom: '1px solid #e2e8f0', zIndex: 5 }}>
            <div className="settings-panel">
              <div style={{ fontSize: 11, fontWeight: 900, color: '#64748b', textTransform: 'uppercase', marginBottom: 10 }}>Configuración de IA</div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 4 }}>Modelo Ollama</div>
                  <input
                    type="text"
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600, outline: 'none' }}
                  />
                </div>
                {!ollamaStatus.available && (
                  <button
                    className="ua-btn ua-btn-primary"
                    onClick={handleStartOllama}
                    disabled={isStartingOllama}
                    style={{ marginTop: 15, padding: '8px 16px', borderRadius: 8 }}
                  >
                    {isStartingOllama ? 'Iniciando...' : 'Activar Ollama'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {messages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.8 }}>
              <div style={{ width: 64, height: 64, borderRadius: 20, background: 'linear-gradient(135deg, #0f172a, #1e293b)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, boxShadow: '0 8px 16px rgba(0,0,0,0.1)' }}>
                <Bot size={32} color="#818cf8" />
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 900, color: '#0f172a', marginBottom: 8 }}>¿En qué puedo ayudarte hoy?</h2>
              <p style={{ fontSize: 14, color: '#64748b', textAlign: 'center', maxWidth: 400, marginBottom: 32, lineHeight: 1.6 }}>
                Soy LORE-IA. Pregúntame sobre proyectos, alertas, perfiles geotécnicos o cualquier dato del sistema. Tus conversaciones se guardarán automáticamente.
              </p>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 600 }}>
                {SUGGESTIONS.map(s => (
                  <button key={s} className="chat-suggestion" onClick={() => sendMessage(s)} disabled={isLoading}>{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, idx) => <MessageBubble key={msg.id || idx} msg={msg} />)}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="chat-input-area">
          <div className="chat-input-container">
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              value={input}
              onChange={e => {
                setInput(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder={isLoading ? 'Escribiendo respuesta...' : 'Escribe un mensaje... (Enter para enviar)'}
              disabled={isLoading}
            />
            {isLoading ? (
              <button className="chat-stop-btn" onClick={stopGeneration} style={{ width: 40, height: 40, borderRadius: 10 }}>
                <div style={{ width: 12, height: 12, background: '#dc2626', borderRadius: 2 }} />
              </button>
            ) : (
              <button className="chat-send-btn" onClick={() => sendMessage()} disabled={!input.trim()}>
                <Send size={18} strokeWidth={2.5} />
              </button>
            )}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: '#94a3b8', textAlign: 'center', fontWeight: 600 }}>
            Conversaciones privadas y persistentes · Modelo actual: {model}
          </div>
        </div>
      </div>
    </div>
  )
}
