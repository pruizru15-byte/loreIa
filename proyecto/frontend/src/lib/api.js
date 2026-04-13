const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3001';

function authHeaders() {
  const token = localStorage.getItem('geotech_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Login failed')
  }
  return res.json()
}

export async function forgotPassword(email) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Error al solicitar recuperación')
  }
  return res.json()
}

export async function verifyResetCode(email, code) {
  const res = await fetch(`${API_BASE}/auth/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Código inválido')
  }
  return res.json()
}

export async function resetPassword({ email, code, newPassword }) {
  const res = await fetch(`${API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, newPassword }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Error al restablecer contraseña')
  }
  return res.json()
}

export async function fetchProjects() {
  const res = await fetch(`${API_BASE}/projects`, { headers: { ...authHeaders() } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function explainScanLog(logId) {
  const res = await fetch(`${API_BASE}/admin/scan-logs/${logId}/explain`, {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function createProject(payload) {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function updateProject(projectId, payload) {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function deleteProject(projectId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function fetchProjectById(projectId) {
  const pid = Number(projectId)
  if (!Number.isFinite(pid)) throw new Error('Invalid projectId')
  const data = await fetchProjects()
  const items = data?.items ?? []
  const project = items.find((p) => Number(p.id) === pid)
  if (!project) throw new Error('Proyecto no encontrado')
  return project
}

export async function fetchZones(projectId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/zones`, { headers: { ...authHeaders() } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function createZone(projectId, payload) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/zones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function updateZone(projectId, zoneId, payload) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/zones/${zoneId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function deleteZone(projectId, zoneId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/zones/${zoneId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function fetchProjectGeotech(projectId, { zoneId, limit, includeArchived } = {}) {
  const q = new URLSearchParams()
  if (zoneId != null && zoneId !== '') q.set('zoneId', String(zoneId))
  if (limit != null && limit !== '') q.set('limit', String(limit))
  if (includeArchived === true) q.set('includeArchived', 'true')
  const qs = q.toString()
  const res = await fetch(`${API_BASE}/projects/${projectId}/geotech${qs ? `?${qs}` : ''}`, { headers: { ...authHeaders() } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function fetchProjectActivities(projectId, { limit } = {}) {
  const q = new URLSearchParams()
  if (limit != null && limit !== '') q.set('limit', String(limit))
  const qs = q.toString()
  const res = await fetch(`${API_BASE}/projects/${projectId}/activities${qs ? `?${qs}` : ''}`, { headers: { ...authHeaders() } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function createProjectActivity(projectId, payload) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function updateProjectActivity(projectId, activityId, payload) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/activities/${activityId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function deleteProjectActivity(projectId, activityId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/activities/${activityId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function archiveGeotechProfile(projectId, profileId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/geotech/${profileId}/archive`, {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function replaceGeotechProfile(projectId, profileId, payload) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/geotech/${profileId}/replace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function deleteGeotechProfile(projectId, profileId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/geotech/${profileId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function setProjectGeotech(projectId, payload) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/geotech`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function fetchAlerts(limit = 200) {
  const res = await fetch(`${API_BASE}/alerts?limit=${encodeURIComponent(limit)}`, { headers: { ...authHeaders() } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function fetchProjectAlerts(projectId, limit = 500) {
  const data = await fetchAlerts(limit)
  const pid = Number(projectId)
  return {
    items: (data?.items ?? []).filter((a) => Number(a.projectId) === pid),
  }
}

export async function ackAlert(alertId) {
  const res = await fetch(`${API_BASE}/alerts/${alertId}/ack`, {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function resolveAlert(alertId) {
  const res = await fetch(`${API_BASE}/alerts/${alertId}/resolve`, {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function respondToAlert(alertId, action) {
  const res = await fetch(`${API_BASE}/alerts/${alertId}/respond`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ action: String(action ?? '') }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function startProjectBaseline(projectId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/baseline/start`, {
    method: 'POST',
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function createParalizacionEvent(projectId, payload) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/events/paralizacion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function stopParalizacionEvent(projectId, eventId, payload) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/events/paralizacion/${eventId}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function fetchProjectParalizaciones(projectId) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/events/paralizacion`, {
    headers: { ...authHeaders() },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function fetchReportSummary({ mode = 'both', projectId } = {}) {
  const q = new URLSearchParams({ mode })
  if (projectId != null) q.set('projectId', String(projectId))
  const res = await fetch(`${API_BASE}/reports/summary?${q.toString()}`, { headers: { ...authHeaders() } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function fetchProjectClimate(projectId, { limit = 100, zoneId } = {}) {
  const q = new URLSearchParams({ limit })
  if (zoneId) q.set('zoneId', zoneId)
  const res = await fetch(`${API_BASE}/projects/${projectId}/climate?${q.toString()}`, { headers: { ...authHeaders() } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function refreshProjectClimate(projectId, zoneId = null) {
  const res = await fetch(`${API_BASE}/projects/${projectId}/climate/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ zoneId })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function evaluateRisk(payload) {
  const res = await fetch(`${API_BASE}/risk/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Request failed');
  }
  return res.json();
}

export async function fetchHistory(limit = 50) {
  const q = new URLSearchParams();
  q.set('limit', String(limit));
  const res = await fetch(`${API_BASE}/risk/history?${q.toString()}`, { headers: { ...authHeaders() } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Request failed');
  }
  return res.json();
}

export async function fetchHistoryFiltered({ limit = 50, riskLevel, soilType, from, to, q } = {}) {
  const qs = new URLSearchParams();
  qs.set('limit', String(limit));
  if (riskLevel) qs.set('riskLevel', String(riskLevel));
  if (soilType) qs.set('soilType', String(soilType));
  if (from) qs.set('from', String(from));
  if (to) qs.set('to', String(to));
  if (q) qs.set('q', String(q));

  const res = await fetch(`${API_BASE}/risk/history?${qs.toString()}`, { headers: { ...authHeaders() } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Request failed');
  }
  return res.json();
}

export async function fetchClimate(lat, lon) {
  const res = await fetch(
    `${API_BASE}/climate?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`,
    { headers: { ...authHeaders() } }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Request failed');
  }
  return res.json();
}

export async function fetchUsersAdmin() {
  const res = await fetch(`${API_BASE}/admin/users`, { headers: { ...authHeaders() } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function createUserAdmin(payload) {
  const res = await fetch(`${API_BASE}/admin/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function checkChatStatus() {
  const res = await fetch(`${API_BASE}/chat/status`, { headers: { ...authHeaders() } })
  if (!res.ok) return { available: false, models: [] }
  return res.json()
}

export async function startOllama() {
  const res = await fetch(`${API_BASE}/admin/ollama/start`, {
    method: 'POST',
    headers: { ...authHeaders() }
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Error al iniciar Ollama')
  }
  return res.json()
}

/**
 * CHAT PERSISTENCE
 */

export async function fetchChatSessions() {
  const res = await fetch(`${API_BASE}/chat/sessions`, { headers: { ...authHeaders() } })
  if (!res.ok) throw new Error('Error al cargar conversaciones')
  return res.json()
}

export async function fetchChatMessages(sessionId) {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}`, { headers: { ...authHeaders() } })
  if (!res.ok) throw new Error('Error al cargar mensajes')
  return res.json()
}

export async function createChatSession(title = '') {
  const res = await fetch(`${API_BASE}/chat/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ title })
  })
  if (!res.ok) throw new Error('Error al crear conversación')
  return res.json()
}

export async function deleteChatSession(sessionId) {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  })
  if (!res.ok) throw new Error('Error al borrar conversación')
  return res.json()
}

export async function fetchSoilTypes({ includeInactive } = {}) {
  const q = new URLSearchParams()
  if (includeInactive === true) q.set('includeInactive', 'true')
  const qs = q.toString()
  const res = await fetch(`${API_BASE}/soil-types${qs ? `?${qs}` : ''}`, { headers: { ...authHeaders() } })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export async function createSoilType(payload) {
  const res = await fetch(`${API_BASE}/soil-types`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload ?? {}),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || 'Request failed')
  }
  return res.json()
}

export function connectAlerts(onMessage) {
  const wsUrl = API_BASE.replace('http://', 'ws://').replace('https://', 'wss://');
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      onMessage?.(msg);
    } catch {
      // ignore
    }
  };

  return () => {
    try {
      ws.close();
    } catch {
      // ignore
    }
  };
}

/**
 * TELEMETRY & SYSTEM CONTROL
 */

export async function fetchTelemetry() {
  const res = await fetch(`${API_BASE}/admin/telemetry`, { headers: { ...authHeaders() } })
  if (!res.ok) throw new Error('Error al cargar telemetría')
  return res.json()
}

export async function toggleSentinelMaster(active) {
  const res = await fetch(`${API_BASE}/admin/telemetry/toggle-master`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ active })
  })
  if (!res.ok) throw new Error('Error al cambiar estado maestro')
  return res.json()
}

export async function fetchRules() {
  const res = await fetch(`${API_BASE}/admin/rules`, { headers: { ...authHeaders() } })
  if (!res.ok) throw new Error('Error al cargar reglas')
  return res.json()
}

export async function createRule(payload) {
  const res = await fetch(`${API_BASE}/admin/rules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('Error al crear regla')
  return res.json()
}

export async function deleteRule(ruleId) {
  const res = await fetch(`${API_BASE}/admin/rules/${ruleId}`, {
    method: 'DELETE',
    headers: { ...authHeaders() }
  })
  if (!res.ok) throw new Error('Error al borrar regla')
  return res.json()
}

export async function fetchScanLogs(limit = 100) {
  const res = await fetch(`${API_BASE}/admin/scan-logs?limit=${limit}`, { headers: { ...authHeaders() } })
  if (!res.ok) throw new Error('Error al cargar bitácora')
  return res.json()
}

export async function updateSentinelProject(projectId, payload) {
  // Nota: Este endpoint debe permitir actualizar sentinel_enabled y scan_frequency_minutes
  // Usaremos el PUT /projects/:id existente pero asegurando que el backend lo soporte
  const res = await fetch(`${API_BASE}/projects/${projectId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(payload)
  })
  if (!res.ok) throw new Error('Error al actualizar configuración de centinela')
  return res.json()
}
