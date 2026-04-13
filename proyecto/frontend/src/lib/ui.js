export const ui = {
  colors: {
    bg: '#F1F5F9',
    card: '#FFFFFF',
    border: 'rgba(226,232,240,0.9)',
    text: '#0F172A',
    muted: '#94A3B8',
    primary: '#4F46E5',
    primaryFg: '#FFFFFF',
    dark: '#0F172A',
    darkFg: '#E2E8F0',
  },
  radii: {
    sm: 12,
    md: 16,
    lg: 18,
  },
  shadow: {
    card: '0 10px 18px rgba(2,6,23,0.04)',
  },
  notify: (msg, type = 'info') => {
    console.log(`[UI NOTIFY] ${type.toUpperCase()}: ${msg}`)
    // For now, use fallback alert to avoid crashes
    if (type === 'error') alert(`Error: ${msg}`)
    else if (window.toast) window.toast(msg, type)
    else console.log(msg)
  }
}

export function cardStyle({ padding = 16 } = {}) {
  return {
    background: ui.colors.card,
    borderRadius: ui.radii.lg,
    border: `1px solid ${ui.colors.border}`,
    padding,
    boxShadow: ui.shadow.card,
  }
}

export function sectionTitleStyle() {
  return { fontSize: 15, fontWeight: 1000, color: ui.colors.text, letterSpacing: -0.2 }
}

export function sectionSubTitleStyle() {
  return { marginTop: 4, fontSize: 12, color: ui.colors.muted, fontWeight: 800 }
}

export function buttonStyle({ variant = 'primary', disabled = false } = {}) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 14px',
    borderRadius: 14,
    fontWeight: 900,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    border: '1px solid transparent',
    background: ui.colors.card,
    color: ui.colors.text,
  }

  if (variant === 'primary') {
    return {
      ...base,
      background: '#1E293B',
      color: '#FFFFFF',
      border: '1px solid rgba(15,23,42,0.12)',
    }
  }

  if (variant === 'secondary') {
    return {
      ...base,
      background: ui.colors.card,
      color: ui.colors.text,
      border: `1px solid ${ui.colors.border}`,
    }
  }

  return base
}

export function inputStyle() {
  return {
    width: '100%',
    padding: '10px 10px',
    border: `1px solid ${ui.colors.border}`,
    borderRadius: 12,
    outline: 'none',
    background: ui.colors.card,
    color: ui.colors.text,
  }
}

export function labelStyle() {
  return { color: ui.colors.muted, fontWeight: 900, fontSize: 12, letterSpacing: 0.6, textTransform: 'uppercase' }
}
