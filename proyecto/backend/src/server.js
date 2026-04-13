const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const Database = require('better-sqlite3');
const { z } = require('zod');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

const app = express();
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);
app.use(express.json());

const OPEN_METEO_BASE = 'https://api.open-meteo.com/v1/forecast';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'ruizruizpiero2@gmail.com',
    pass: 'qntq kypw dysu pqwa'
  }
});

const db = new Database('data.sqlite');

function ensureMigrations() {
  const pcols = db.prepare("PRAGMA table_info('projects')").all();
  const pcolNames = new Set(pcols.map((c) => c.name));
  if (pcols.length > 0 && !pcolNames.has('actual_budget')) {
    db.exec("ALTER TABLE projects ADD COLUMN actual_budget REAL");
  }
  if (pcols.length > 0 && !pcolNames.has('actual_end')) {
    db.exec("ALTER TABLE projects ADD COLUMN actual_end TEXT");
  }

  const cols = db.prepare("PRAGMA table_info('projects')").all();
  const colNames = new Set(cols.map((c) => c.name));
  if (cols.length > 0 && !colNames.has('baseline_start_at')) {
    db.exec("ALTER TABLE projects ADD COLUMN baseline_start_at TEXT");
  }

  const gcols = db.prepare("PRAGMA table_info('geotech_profiles')").all();
  const gcolNames = new Set(gcols.map((c) => c.name));
  if (gcols.length > 0) {
    if (!gcolNames.has('archived_at')) db.exec("ALTER TABLE geotech_profiles ADD COLUMN archived_at TEXT");
    if (!gcolNames.has('archived_by')) db.exec("ALTER TABLE geotech_profiles ADD COLUMN archived_by INTEGER");
    if (!gcolNames.has('replaced_by')) db.exec("ALTER TABLE geotech_profiles ADD COLUMN replaced_by INTEGER");
    if (!gcolNames.has('climate_sample_id')) db.exec("ALTER TABLE geotech_profiles ADD COLUMN climate_sample_id INTEGER");
    if (!gcolNames.has('lat')) db.exec("ALTER TABLE geotech_profiles ADD COLUMN lat REAL");
    if (!gcolNames.has('lon')) db.exec("ALTER TABLE geotech_profiles ADD COLUMN lon REAL");
  }

  const zcols = db.prepare("PRAGMA table_info('zones')").all();
  const zcolNames = new Set(zcols.map((c) => c.name));
  if (zcols.length > 0) {
    if (!zcolNames.has('lat')) db.exec("ALTER TABLE zones ADD COLUMN lat REAL");
    if (!zcolNames.has('lon')) db.exec("ALTER TABLE zones ADD COLUMN lon REAL");
  }

  const pcols2 = db.prepare("PRAGMA table_info('projects')").all();
  const pcolNames2 = new Set(pcols2.map((c) => c.name));
  if (pcols2.length > 0) {
    if (!pcolNames2.has('sentinel_enabled')) db.exec("ALTER TABLE projects ADD COLUMN sentinel_enabled INTEGER DEFAULT 1");
    if (!pcolNames2.has('scan_frequency_minutes')) db.exec("ALTER TABLE projects ADD COLUMN scan_frequency_minutes INTEGER DEFAULT 60");
    if (!pcolNames2.has('last_scan_at')) db.exec("ALTER TABLE projects ADD COLUMN last_scan_at TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS global_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS risk_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      soil_type TEXT NOT NULL,
      climate_variable TEXT NOT NULL,
      operator TEXT NOT NULL,
      threshold_value REAL NOT NULL,
      resulting_risk TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scan_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER,
      zone_id INTEGER,
      executed_at TEXT NOT NULL,
      climate_snapshot TEXT,
      geotech_snapshot TEXT,
      result_level TEXT,
      success INTEGER NOT NULL,
      error_message TEXT
    );
  `);

  // Sembrar configuración inicial si no existe
  db.prepare("INSERT OR IGNORE INTO global_settings (key, value) VALUES ('sentinel_master_active', '1')").run();
  db.prepare("INSERT OR IGNORE INTO global_settings (key, value) VALUES ('sentinel_last_heartbeat', ?)").run(new Date().toISOString());

  const hasRules = db.prepare("SELECT count(*) as count FROM risk_rules").get().count > 0;
  if (!hasRules) {
    const now = new Date().toISOString();
    db.prepare("INSERT INTO risk_rules (soil_type, climate_variable, operator, threshold_value, resulting_risk, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run('arcilla', 'humidity', '>', 80, 'ALTO', now);
    db.prepare("INSERT INTO risk_rules (soil_type, climate_variable, operator, threshold_value, resulting_risk, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run('limo', 'rain', '>', 50, 'ALTO', now);
  }

  const hasProjectEvents = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_events'")
    .get();
  if (!hasProjectEvents) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        zone_id INTEGER,
        type TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        notes TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE SET NULL,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  }

  const acols = db.prepare("PRAGMA table_info('alerts')").all();
  const acolNames = new Set(acols.map((c) => c.name));
  if (acols.length > 0 && !acolNames.has('response_action')) {
    db.exec("ALTER TABLE alerts ADD COLUMN response_action TEXT");
  }
  if (acols.length > 0 && !acolNames.has('response_at')) {
    db.exec("ALTER TABLE alerts ADD COLUMN response_at TEXT");
  }
  if (acols.length > 0 && !acolNames.has('response_by')) {
    db.exec("ALTER TABLE alerts ADD COLUMN response_by INTEGER");
  }

  const hasClimateSamples = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='climate_samples'")
    .get();
  if (!hasClimateSamples) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS climate_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        temp_c REAL,
        feels_like_c REAL,
        precipitation_24h_mm REAL,
        humidity_pct REAL,
        pressure_hpa REAL,
        wind_speed_ms REAL,
        wind_deg REAL,
        gust_ms REAL,
        clouds_pct REAL,
        visibility_m REAL,
        condition_text TEXT,
        condition_icon TEXT,
        source TEXT,
        sampled_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
  } else {
    const ccols = db.prepare("PRAGMA table_info('climate_samples')").all();
    const ccolNames = new Set(ccols.map((c) => c.name));
    if (!ccolNames.has('temp_c')) db.exec("ALTER TABLE climate_samples ADD COLUMN temp_c REAL");
    if (!ccolNames.has('feels_like_c')) db.exec("ALTER TABLE climate_samples ADD COLUMN feels_like_c REAL");
    if (!ccolNames.has('pressure_hpa')) db.exec("ALTER TABLE climate_samples ADD COLUMN pressure_hpa REAL");
    if (!ccolNames.has('wind_deg')) db.exec("ALTER TABLE climate_samples ADD COLUMN wind_deg REAL");
    if (!ccolNames.has('gust_ms')) db.exec("ALTER TABLE climate_samples ADD COLUMN gust_ms REAL");
    if (!ccolNames.has('clouds_pct')) db.exec("ALTER TABLE climate_samples ADD COLUMN clouds_pct REAL");
    if (!ccolNames.has('visibility_m')) db.exec("ALTER TABLE climate_samples ADD COLUMN visibility_m REAL");
    if (!ccolNames.has('condition_text')) db.exec("ALTER TABLE climate_samples ADD COLUMN condition_text TEXT");
    if (!ccolNames.has('condition_icon')) db.exec("ALTER TABLE climate_samples ADD COLUMN condition_icon TEXT");
    if (!ccolNames.has('zone_id')) db.exec("ALTER TABLE climate_samples ADD COLUMN zone_id INTEGER");
  }

  const hasProjectActivities = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='project_activities'")
    .get();
  if (!hasProjectActivities) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS project_activities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        planned_start TEXT,
        planned_end TEXT,
        actual_start TEXT,
        actual_end TEXT,
        status TEXT NOT NULL DEFAULT 'PENDIENTE',
        progress_pct REAL,
        notes TEXT,
        created_by INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  }

  const hasSoilTypes = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='soil_types'")
    .get();
  if (!hasSoilTypes) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS soil_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        label TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_by INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
      );
    `);
  }
}

// Ejecutar migraciones antes de iniciar tablas base
ensureMigrations();

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS risk_evaluations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    lat REAL,
    lon REAL,
    soil_type TEXT NOT NULL,
    bearing_capacity_kpa REAL,
    soil_moisture_index REAL,
    shear_strength_kpa REAL,
    water_table_depth_m REAL,
    precipitation_24h_mm REAL,
    humidity_pct REAL,
    wind_speed_ms REAL,
    score REAL NOT NULL,
    risk_level TEXT NOT NULL,
    probable_cause TEXT NOT NULL,
    recommendation TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS climate_samples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    zone_id INTEGER,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    temp_c REAL,
    feels_like_c REAL,
    precipitation_24h_mm REAL,
    humidity_pct REAL,
    pressure_hpa REAL,
    wind_speed_ms REAL,
    wind_deg REAL,
    gust_ms REAL,
    clouds_pct REAL,
    visibility_m REAL,
    condition_text TEXT,
    condition_icon TEXT,
    source TEXT,
    sampled_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVO',
    planned_budget REAL,
    planned_start TEXT,
    planned_end TEXT,
    baseline_start_at TEXT,
    sentinel_enabled INTEGER DEFAULT 1,
    scan_frequency_minutes INTEGER DEFAULT 60,
    last_scan_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    lat REAL,
    lon REAL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS geotech_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    zone_id INTEGER,
    lat REAL,
    lon REAL,
    soil_type TEXT NOT NULL,
    bearing_capacity_kpa REAL,
    soil_moisture_index REAL,
    shear_strength_kpa REAL,
    water_table_depth_m REAL,
    updated_at TEXT NOT NULL,
    archived_at TEXT,
    archived_by INTEGER,
    replaced_by INTEGER,
    climate_sample_id INTEGER,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE SET NULL,
    FOREIGN KEY(archived_by) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY(replaced_by) REFERENCES geotech_profiles(id) ON DELETE SET NULL,
    FOREIGN KEY(climate_sample_id) REFERENCES climate_samples(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    zone_id INTEGER,
    created_at TEXT NOT NULL,
    score REAL NOT NULL,
    risk_level TEXT NOT NULL,
    probable_cause TEXT NOT NULL,
    recommendation TEXT NOT NULL,
    source TEXT NOT NULL,
    acknowledged_at TEXT,
    acknowledged_by INTEGER,
    resolved_at TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE SET NULL,
    FOREIGN KEY(acknowledged_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS project_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    zone_id INTEGER,
    type TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    notes TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(zone_id) REFERENCES zones(id) ON DELETE SET NULL,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS project_activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    planned_start TEXT,
    planned_end TEXT,
    actual_start TEXT,
    actual_end TEXT,
    status TEXT NOT NULL DEFAULT 'PENDIENTE',
    progress_pct REAL,
    notes TEXT,
    created_by INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
  );
`);

ensureMigrations();

const insertAlert = db.prepare(`
  INSERT INTO alerts (
    project_id, zone_id, created_at, score, risk_level, probable_cause, recommendation, source
  ) VALUES (
    @project_id, @zone_id, @created_at, @score, @risk_level, @probable_cause, @recommendation, @source
  );
`);

function seedIfEmpty() {
  const now = new Date().toISOString();

  const usersCount = db.prepare('SELECT COUNT(1) as c FROM users').get().c;
  if (usersCount === 0) {
    // no-op: sin usuarios demo
  }

  const projectsCount = db.prepare('SELECT COUNT(1) as c FROM projects').get().c;
  if (projectsCount === 0) {
    // no-op: sin proyectos demo
  }

  const soilCountRow = db.prepare('SELECT COUNT(1) as c FROM soil_types').get();
  const soilCount = soilCountRow?.c ?? 0;
  if (soilCount === 0) {
    const insert = db.prepare('INSERT INTO soil_types (key, label, active, created_by, created_at) VALUES (?, ?, 1, NULL, ?)');
    insert.run('arcilla', 'Arcilla', now);
    insert.run('limo', 'Limo', now);
    insert.run('arena', 'Arena', now);
    insert.run('roca', 'Roca', now);
  }
}

seedIfEmpty();

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function roleRequired(roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role || !roles.includes(role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}

function listSoilTypes({ includeInactive = false } = {}) {
  const where = includeInactive ? '' : 'WHERE active = 1';
  return db
    .prepare(`SELECT id, key, label, active, created_by as createdBy, created_at as createdAt FROM soil_types ${where} ORDER BY key ASC`)
    .all();
}

function isSoilTypeAllowed(key) {
  if (!key) return false;
  const row = db.prepare('SELECT id FROM soil_types WHERE key = ? AND active = 1').get(String(key));
  return !!row;
}

app.get('/soil-types', authRequired, (req, res) => {
  const includeInactive = String(req.query.includeInactive ?? 'false').toLowerCase() === 'true';
  res.json({ items: listSoilTypes({ includeInactive }) });
});

app.post('/soil-types', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const schema = z.object({
    key: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9_-]+$/),
    label: z.string().min(1).max(60),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const now = new Date().toISOString();
  try {
    const info = db
      .prepare('INSERT INTO soil_types (key, label, active, created_by, created_at) VALUES (?, ?, 1, ?, ?)')
      .run(parsed.data.key, parsed.data.label, req.user?.sub ?? null, now);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e?.message ?? '').toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'Soil type ya existe' });
    }
    return res.status(500).json({ error: 'Create soil type failed' });
  }
});

app.get('/admin/users', authRequired, roleRequired(['ADMIN']), (req, res) => {
  const rows = db
    .prepare('SELECT id, email, role, created_at as createdAt FROM users ORDER BY id ASC')
    .all();
  res.json({ items: rows });
});

app.post('/admin/users', authRequired, roleRequired(['ADMIN']), (req, res) => {
  const schema = z.object({
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum(['ADMIN', 'INGENIERO', 'GERENTE']),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const now = new Date().toISOString();
  try {
    const info = db
      .prepare('INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)')
      .run(parsed.data.email, bcrypt.hashSync(parsed.data.password, 10), parsed.data.role, now);
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e?.message ?? '').toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'Email ya existe' });
    }
    return res.status(500).json({ error: 'Create user failed' });
  }
});

const EvaluateSchema = z.object({
  location: z
    .object({
      lat: z.number().min(-90).max(90).optional(),
      lon: z.number().min(-180).max(180).optional(),
    })
    .optional(),
  soil: z.object({
    type: z.string().min(1),
    bearingCapacityKpa: z.number().positive().optional(),
    moistureIndex: z.number().min(0).max(1).optional(),
    shearStrengthKpa: z.number().positive().optional(),
    waterTableDepthM: z.number().positive().optional(),
  }),
  climate: z
    .object({
      precipitation24hMm: z.number().min(0).optional(),
      humidityPct: z.number().min(0).max(100).optional(),
      windSpeedMs: z.number().min(0).optional(),
    })
    .optional(),
});

async function fetchClimateFromOpenMeteo(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: 'auto',
    current: 'relative_humidity_2m,wind_speed_10m,precipitation'
  });

  const url = `${OPEN_METEO_BASE}?${params.toString()}`;
  try {
    const { default: f } = await import('node-fetch');
    const res = await f(url, { headers: { 'User-Agent': 'geotech-risk-local/1.0' } });
    if (!res.ok) {
      const text = await res.text();
      console.error('Open-Meteo API Error:', text);
      throw new Error(text || 'Open-Meteo request failed');
    }
    const data = await res.json();

    const precipitation24hMm = Number(data?.current?.precipitation ?? 0);
    const humidityPct = Number(data?.current?.relative_humidity_2m ?? 50);
    const windSpeedMs = Number(data?.current?.wind_speed_10m ?? 0);

    return {
      precipitation24hMm: Number.isFinite(precipitation24hMm) ? precipitation24hMm : 0,
      humidityPct: Number.isFinite(humidityPct) ? humidityPct : 50,
      windSpeedMs: Number.isFinite(windSpeedMs) ? windSpeedMs : 0,
      source: 'open-meteo',
    };
  } catch (err) {
    console.error('Error fetching climate:', err);
    throw err;
  }
}

function clamp01(x) {
  if (typeof x !== 'number' || Number.isNaN(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function clamp(x, min, max) {
  if (typeof x !== 'number' || Number.isNaN(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function computeRisk({ soil, climate }) {
  // 1. Cargar reglas dinámicas de la DB
  const rules = db.prepare('SELECT * FROM risk_rules').all();
  
  const precipitation24h = climate?.precipitation24hMm ?? 0;
  const humidityPct = climate?.humidityPct ?? 50;
  const windSpeedMs = climate?.windSpeedMs ?? 0;
  const moistureIndex = soil.moistureIndex ?? 0.3;
  const waterTableDepthM = soil.waterTableDepthM ?? 5;
  const bearingCapacityKpa = soil.bearingCapacityKpa ?? 250;
  const shearStrengthKpa = soil.shearStrengthKpa ?? 50;

  // 2. Aplicar reglas dinámicas primero (Tienen prioridad si coinciden)
  for (const rule of rules) {
    if (soil.type.toLowerCase() === rule.soil_type.toLowerCase()) {
      let val = 0;
      if (rule.climate_variable === 'humidity') val = humidityPct;
      if (rule.climate_variable === 'rain') val = precipitation24h;
      if (rule.climate_variable === 'wind') val = windSpeedMs;
      if (rule.climate_variable === 'moisture') val = moistureIndex * 100; // Normalizar a % para reglas

      let match = false;
      if (rule.operator === '>' && val > rule.threshold_value) match = true;
      if (rule.operator === '<' && val < rule.threshold_value) match = true;
      if (rule.operator === '>=' && val >= rule.threshold_value) match = true;
      if (rule.operator === '<=' && val <= rule.threshold_value) match = true;

      if (match) {
        return {
          score: rule.resulting_risk === 'ALTO' ? 85 : rule.resulting_risk === 'MEDIO' ? 50 : 20,
          riskLevel: rule.resulting_risk,
          probableCause: `Regla Paramétrica: ${rule.soil_type} + ${rule.climate_variable} ${rule.operator} ${rule.threshold_value}`,
          recommendation: `Seguir protocolo definido para regla paramétrica de riesgo ${rule.resulting_risk}.`,
          explanation: `Activado por regla de usuario ID ${rule.id}`
        };
      }
    }
  }

  // 3. Lógica Estática (Fallback si no hay reglas dinámicas que coincidan)
  const soilTypeWeight = {
    arcilla: 1.0,
    limo: 0.85,
    arena: 0.6,
    roca: 0.25,
  };

  // Normalización de factores (0..1)
  const rainFactor = clamp01(precipitation24h / 80);
  const humidityFactor = clamp01((humidityPct - 50) / 50);
  const moistureFactor = clamp01(moistureIndex);
  const waterTableFactor = clamp01((3 - Math.min(3, waterTableDepthM)) / 3);
  const bearingWeakFactor = clamp01((200 - Math.min(200, bearingCapacityKpa)) / 200);
  const shearWeakFactor = clamp01((60 - Math.min(60, shearStrengthKpa)) / 60);

  const typeW = soilTypeWeight[soil.type] ?? 0.7;

  // Base score (0..100)
  const base01 =
    typeW *
    (0.28 * rainFactor +
      0.08 * humidityFactor +
      0.20 * moistureFactor +
      0.16 * waterTableFactor +
      0.16 * bearingWeakFactor +
      0.12 * shearWeakFactor);

  // Reglas "gatillo" para aproximar el comportamiento descrito en el PDF
  const triggers = {
    extremeRain: precipitation24h >= 85,
    heavyRain: precipitation24h >= 40,
    highSoilMoisture: moistureIndex >= 0.75,
    shallowWaterTable: waterTableDepthM <= 2,
    weakBearing: bearingCapacityKpa <= 120,
    weakShear: shearStrengthKpa <= 25,
    veryWetAndWeak: moistureIndex >= 0.8 && (bearingCapacityKpa <= 150 || shearStrengthKpa <= 30),
  };

  let boost = 0;
  if (triggers.heavyRain && triggers.highSoilMoisture) boost += 10;
  if (triggers.shallowWaterTable) boost += 8;
  if (triggers.weakBearing) boost += 12;
  if (triggers.weakShear) boost += 10;
  if (triggers.veryWetAndWeak) boost += 12;
  if (triggers.extremeRain) boost += 18;

  const score = clamp(base01 * 100 + boost, 0, 100);

  let riskLevel = 'BAJO';
  if (score >= 78 || triggers.extremeRain || (triggers.veryWetAndWeak && triggers.shallowWaterTable)) riskLevel = 'CRÍTICO';
  else if (score >= 58 || (triggers.heavyRain && (triggers.weakBearing || triggers.weakShear))) riskLevel = 'ALTO';
  else if (score >= 38 || (triggers.heavyRain && triggers.highSoilMoisture)) riskLevel = 'MEDIO';

  const probableCauseParts = [];
  if (precipitation24h >= 85) probableCauseParts.push(`Saturación por lluvia acumulada de ${precipitation24h.toFixed(0)}mm en 24h`);
  else if (precipitation24h >= 40) probableCauseParts.push(`Lluvia acumulada ${precipitation24h.toFixed(0)}mm/24h`);
  if (moistureIndex >= 0.75) probableCauseParts.push('Humedad del suelo elevada (índice alto)');
  if (waterTableDepthM <= 2) probableCauseParts.push(`Nivel freático somero (${waterTableDepthM.toFixed(1)}m)`);
  if (bearingCapacityKpa <= 120) probableCauseParts.push(`Capacidad portante baja (${bearingCapacityKpa.toFixed(0)} kPa)`);
  if (shearStrengthKpa <= 25) probableCauseParts.push(`Resistencia al corte baja (${shearStrengthKpa.toFixed(0)} kPa)`);
  if (soil.type === 'arcilla') probableCauseParts.push('Suelo arcilloso (susceptible a saturación)');

  const probableCause =
    probableCauseParts.length > 0
      ? probableCauseParts.join(' + ')
      : 'Condiciones dentro de rangos normales';

  let recommendation = 'Continuar operación normal y monitoreo rutinario.';
  if (riskLevel === 'MEDIO') {
    recommendation =
      'Aumentar monitoreo en la zona (humedad, asentamientos). Revisar y limpiar drenajes. Limitar tránsito de maquinaria pesada y controlar cargas.';
  } else if (riskLevel === 'ALTO') {
    // Recomendaciones más específicas, cercanas al PDF
    if (triggers.heavyRain) {
      recommendation =
        'Implementar medidas preventivas: instalar drenaje superficial/zanjas en el sector afectado y proteger excavaciones. Reducir carga y reforzar taludes. Preparar plan de contingencia.';
    } else if (triggers.weakBearing || triggers.weakShear) {
      recommendation =
        'Reducir cargas sobre la zona crítica (maquinaria/almacenamiento). Reforzar cimentación/taludes y aumentar control de compactación. Preparar plan de contingencia.';
    } else {
      recommendation =
        'Implementar medidas preventivas: drenaje superficial/zanjas, reducir cargas, proteger excavaciones y taludes. Preparar plan de contingencia.';
    }
  } else if (riskLevel === 'CRÍTICO') {
    if (triggers.extremeRain) {
      recommendation =
        'Paralizar inmediatamente. Suspender excavaciones y tránsito en la zona afectada. Ejecutar drenaje de emergencia y asegurar taludes/cimentación antes de reiniciar.';
    } else {
      recommendation =
        'Paralizar actividades en la zona afectada. Ejecutar drenaje de emergencia, asegurar taludes/cimentación y revaluar condiciones antes de reiniciar.';
    }
  }

  // Ventana estimada de riesgo (horas), útil para tablero/tesis
  let estimatedRiskWindowHours = 6;
  if (riskLevel === 'BAJO') estimatedRiskWindowHours = 24;
  else if (riskLevel === 'MEDIO') estimatedRiskWindowHours = 12;
  else if (riskLevel === 'ALTO') estimatedRiskWindowHours = 8;
  else if (riskLevel === 'CRÍTICO') estimatedRiskWindowHours = 4;
  if (triggers.extremeRain) estimatedRiskWindowHours = 3;

  const explanation = {
    inputs: {
      precipitation24hMm: precipitation24h,
      humidityPct,
      windSpeedMs,
      soilType: soil.type,
      moistureIndex,
      waterTableDepthM,
      bearingCapacityKpa,
      shearStrengthKpa,
    },
    normalizedFactors: {
      rainFactor,
      humidityFactor,
      moistureFactor,
      waterTableFactor,
      bearingWeakFactor,
      shearWeakFactor,
      soilTypeWeight: typeW,
    },
    triggers,
    scoreModel: {
      baseScore: clamp(base01 * 100, 0, 100),
      boost,
      score,
      riskLevel,
      estimatedRiskWindowHours,
    },
  };

  return { score, riskLevel, probableCause, recommendation, estimatedRiskWindowHours, explanation };
}

const insertEval = db.prepare(`
  INSERT INTO risk_evaluations (
    created_at, lat, lon, soil_type,
    bearing_capacity_kpa, soil_moisture_index, shear_strength_kpa, water_table_depth_m,
    precipitation_24h_mm, humidity_pct, wind_speed_ms,
    score, risk_level, probable_cause, recommendation
  ) VALUES (
    @created_at, @lat, @lon, @soil_type,
    @bearing_capacity_kpa, @soil_moisture_index, @shear_strength_kpa, @water_table_depth_m,
    @precipitation_24h_mm, @humidity_pct, @wind_speed_ms,
    @score, @risk_level, @probable_cause, @recommendation
  );
`);

const insertClimateSample = db.prepare(`
  INSERT INTO climate_samples (
    project_id, zone_id, lat, lon,
    temp_c, feels_like_c, precipitation_24h_mm, humidity_pct,
    pressure_hpa, wind_speed_ms, wind_deg, gust_ms,
    clouds_pct, visibility_m, condition_text, condition_icon,
    source, sampled_at, created_at
  ) VALUES (
    @project_id, @zone_id, @lat, @lon,
    @temp_c, @feels_like_c, @precipitation_24h_mm, @humidity_pct,
    @pressure_hpa, @wind_speed_ms, @wind_deg, @gust_ms,
    @clouds_pct, @visibility_m, @condition_text, @condition_icon,
    @source, @sampled_at, @created_at
  );
`);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/projects/:projectId/climate/latest', authRequired, (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  const zoneId = req.query.zoneId ? Number(req.query.zoneId) : null;

  let sql = `SELECT id, project_id as projectId, zone_id as zoneId, lat, lon,
              temp_c as tempC, feels_like_c as feelsLikeC,
              precipitation_24h_mm as precipitation24hMm,
              humidity_pct as humidityPct, pressure_hpa as pressureHpa,
              wind_speed_ms as windSpeedMs, wind_deg as windDeg, gust_ms as gustMs,
              clouds_pct as cloudsPct, visibility_m as visibilityM,
              condition_text as conditionText, condition_icon as conditionIcon,
              source, sampled_at as sampledAt, created_at as createdAt
       FROM climate_samples
       WHERE project_id = ?`;
  const params = [projectId];
  if (zoneId) {
    sql += ' AND zone_id = ?';
    params.push(zoneId);
  }
  sql += ' ORDER BY id DESC LIMIT 1';

  const row = db.prepare(sql).get(...params);
  res.json({ item: row ?? null });
});

app.get('/projects/:projectId/climate', authRequired, (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  const limit = clamp(Number(req.query.limit ?? 100), 1, 1000);
  const zoneId = req.query.zoneId ? Number(req.query.zoneId) : null;

  let sql = `SELECT id, project_id as projectId, zone_id as zoneId, lat, lon,
              temp_c as tempC, feels_like_c as feelsLikeC,
              precipitation_24h_mm as precipitation24hMm,
              humidity_pct as humidityPct, pressure_hpa as pressureHpa,
              wind_speed_ms as windSpeedMs, wind_deg as windDeg, gust_ms as gustMs,
              clouds_pct as cloudsPct, visibility_m as visibilityM,
              condition_text as conditionText, condition_icon as conditionIcon,
              source, sampled_at as sampledAt, created_at as createdAt
       FROM climate_samples
       WHERE project_id = ?`;
  const params = [projectId];

  if (zoneId) {
    sql += ' AND zone_id = ?';
    params.push(zoneId);
  }

  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  res.json({ items: rows });
});

async function fetchFromOpenWeatherMap(lat, lon) {
  const apiKey = '27cdebbf8a12ea7d57e6ce16981bc860';
  const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=es`;
  
  const { default: f } = await import('node-fetch');
  const res = await f(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenWeatherMap Error: ${text}`);
  }
  const data = await res.json();

  return {
    tempC: data.main?.temp,
    feelsLikeC: data.main?.feels_like,
    humidityPct: data.main?.humidity,
    pressureHpa: data.main?.pressure,
    windSpeedMs: data.wind?.speed,
    windDeg: data.wind?.deg,
    gustMs: data.wind?.gust,
    cloudsPct: data.clouds?.all,
    visibilityM: data.visibility,
    conditionText: data.weather?.[0]?.description,
    conditionIcon: data.weather?.[0]?.icon,
    precipitation24hMm: data.rain?.['1h'] || data.rain?.['3h'] || 0, // OWM baseline is smaller but better than 0
    sampledAt: new Date().toISOString(),
    source: 'openweathermap'
  };
}

app.post('/projects/:projectId/climate/refresh', authRequired, roleRequired(['INGENIERO', 'ADMIN']), async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  const zoneId = req.body.zoneId ? Number(req.body.zoneId) : null;

  let lat, lon;
  if (zoneId) {
    const zone = db.prepare('SELECT lat, lon FROM zones WHERE id = ? AND project_id = ?').get(zoneId, projectId);
    if (!zone) return res.status(404).json({ error: 'Zone not found' });
    lat = zone.lat;
    lon = zone.lon;
  } else {
    const project = db.prepare('SELECT lat, lon FROM projects WHERE id = ?').get(projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    lat = project.lat;
    lon = project.lon;
  }

  try {
    const data = await fetchFromOpenWeatherMap(lat, lon);
    const now = new Date().toISOString();

    const info = insertClimateSample.run({
      project_id: projectId,
      zone_id: zoneId,
      lat: lat,
      lon: lon,
      temp_c: data.tempC,
      feels_like_c: data.feelsLikeC,
      precipitation_24h_mm: data.precipitation24hMm,
      humidity_pct: data.humidityPct,
      pressure_hpa: data.pressureHpa,
      wind_speed_ms: data.windSpeedMs,
      wind_deg: data.windDeg,
      gust_ms: data.gustMs,
      clouds_pct: data.cloudsPct,
      visibility_m: data.visibilityM,
      condition_text: data.conditionText,
      condition_icon: data.conditionIcon,
      source: data.source,
      sampled_at: data.sampledAt,
      created_at: now
    });

    res.json({ id: info.lastInsertRowid, ...data });
  } catch (err) {
    console.error('Refresh climate failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/projects/:projectId/climate', authRequired, roleRequired(['INGENIERO', 'ADMIN']), (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

  const schema = z.object({
    tempC: z.number().optional().nullable(),
    humidityPct: z.number().optional().nullable(),
    windSpeedMs: z.number().optional().nullable(),
    precipitation24hMm: z.number().optional().nullable(),
    conditionText: z.string().optional().nullable(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const project = db.prepare('SELECT lat, lon FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const now = new Date().toISOString();
  const d = parsed.data;

  const info = insertClimateSample.run({
    project_id: projectId,
    lat: project.lat,
    lon: project.lon,
    temp_c: d.tempC ?? null,
    feels_like_c: null,
    precipitation_24h_mm: d.precipitation24hMm ?? null,
    humidity_pct: d.humidityPct ?? null,
    pressure_hpa: null,
    wind_speed_ms: d.windSpeedMs ?? null,
    wind_deg: null,
    gust_ms: null,
    clouds_pct: null,
    visibility_m: null,
    condition_text: d.conditionText ?? 'Manual',
    condition_icon: null,
    source: 'manual',
    sampled_at: now,
    created_at: now
  });

  res.json({ id: info.lastInsertRowid });
});

app.get('/projects/:projectId/activities', authRequired, (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  const limit = clamp(Number(req.query.limit ?? 500), 1, 2000);

  const rows = db
    .prepare(
      `SELECT id, project_id as projectId, name,
              planned_start as plannedStart, planned_end as plannedEnd,
              actual_start as actualStart, actual_end as actualEnd,
              status, progress_pct as progressPct, notes,
              created_by as createdBy, created_at as createdAt, updated_at as updatedAt
       FROM project_activities
       WHERE project_id = ?
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(projectId, limit);

  res.json({ items: rows });
});

app.post('/projects/:projectId/activities', authRequired, roleRequired(['INGENIERO', 'ADMIN']), (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

  const schema = z.object({
    name: z.string().min(1),
    plannedStart: z.string().optional().nullable(),
    plannedEnd: z.string().optional().nullable(),
    actualStart: z.string().optional().nullable(),
    actualEnd: z.string().optional().nullable(),
    status: z.enum(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'BLOQUEADA']).optional(),
    progressPct: z.number().min(0).max(100).optional().nullable(),
    notes: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const now = new Date().toISOString();
  const d = parsed.data;
  const info = db
    .prepare(
      `INSERT INTO project_activities (
         project_id, name, planned_start, planned_end, actual_start, actual_end,
         status, progress_pct, notes, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      projectId,
      d.name,
      d.plannedStart ?? null,
      d.plannedEnd ?? null,
      d.actualStart ?? null,
      d.actualEnd ?? null,
      d.status ?? 'PENDIENTE',
      d.progressPct ?? null,
      d.notes ?? null,
      req.user?.id ?? null,
      now,
      now
    );

  res.json({ id: info.lastInsertRowid });
});

app.put('/projects/:projectId/activities/:activityId', authRequired, roleRequired(['INGENIERO', 'ADMIN']), (req, res) => {
  const projectId = Number(req.params.projectId);
  const activityId = Number(req.params.activityId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  if (!Number.isFinite(activityId)) return res.status(400).json({ error: 'Invalid activityId' });

  const schema = z.object({
    name: z.string().min(1).optional(),
    plannedStart: z.string().optional().nullable(),
    plannedEnd: z.string().optional().nullable(),
    actualStart: z.string().optional().nullable(),
    actualEnd: z.string().optional().nullable(),
    status: z.enum(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'BLOQUEADA']).optional(),
    progressPct: z.number().min(0).max(100).optional().nullable(),
    notes: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const d = parsed.data;
  const fields = [];
  const params = [];
  if (d.name !== undefined) {
    fields.push('name = ?');
    params.push(d.name);
  }
  if (d.plannedStart !== undefined) {
    fields.push('planned_start = ?');
    params.push(d.plannedStart);
  }
  if (d.plannedEnd !== undefined) {
    fields.push('planned_end = ?');
    params.push(d.plannedEnd);
  }
  if (d.actualStart !== undefined) {
    fields.push('actual_start = ?');
    params.push(d.actualStart);
  }
  if (d.actualEnd !== undefined) {
    fields.push('actual_end = ?');
    params.push(d.actualEnd);
  }
  if (d.status !== undefined) {
    fields.push('status = ?');
    params.push(d.status);
  }
  if (d.progressPct !== undefined) {
    fields.push('progress_pct = ?');
    params.push(d.progressPct);
  }
  if (d.notes !== undefined) {
    fields.push('notes = ?');
    params.push(d.notes);
  }

  if (fields.length === 0) return res.json({ ok: true });

  fields.push('updated_at = ?');
  const now = new Date().toISOString();
  params.push(now);
  params.push(projectId);
  params.push(activityId);

  const sql = `UPDATE project_activities SET ${fields.join(', ')} WHERE project_id = ? AND id = ?`;
  const info = db.prepare(sql).run(...params);
  if (info.changes === 0) return res.status(404).json({ error: 'Activity not found' });

  res.json({ ok: true, updatedAt: now });
});

app.delete('/projects/:projectId/activities/:activityId', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const projectId = Number(req.params.projectId);
  const activityId = Number(req.params.activityId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  if (!Number.isFinite(activityId)) return res.status(404).json({ error: 'Invalid activityId' });

  const info = db.prepare('DELETE FROM project_activities WHERE project_id = ? AND id = ?').run(projectId, activityId);
  if (info.changes === 0) return res.status(404).json({ error: 'Activity not found' });
  res.json({ ok: true });
});

app.get('/alerts', authRequired, (req, res) => {
  const limit = clamp(Number(req.query.limit ?? 200), 1, 1000);
  const rows = db
    .prepare(
      `SELECT a.id, a.project_id as projectId, a.zone_id as zoneId, a.created_at as createdAt,
              a.score, a.risk_level as riskLevel, a.probable_cause as probableCause, a.recommendation,
              a.source, a.acknowledged_at as acknowledgedAt, a.acknowledged_by as acknowledgedBy, a.resolved_at as resolvedAt,
              a.response_action as responseAction, a.response_at as responseAt, a.response_by as responseBy
       FROM alerts a
       ORDER BY a.id DESC
       LIMIT ?`
    )
    .all(limit);

  res.json({ items: rows });
});

app.get('/reports/summary', authRequired, roleRequired(['GERENTE', 'ADMIN', 'INGENIERO']), (req, res) => {
  const baselineMode = String(req.query.mode ?? 'both'); // pre|post|both
  const projectId = req.query.projectId != null ? Number(req.query.projectId) : null;

  const where = [];
  const params = [];
  if (Number.isFinite(projectId)) {
    where.push('a.project_id = ?');
    params.push(projectId);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db
    .prepare(
      `SELECT a.id, a.project_id as projectId, a.created_at as createdAt,
              a.risk_level as riskLevel, a.acknowledged_at as acknowledgedAt,
              a.response_at as responseAt,
              p.baseline_start_at as baselineStartAt
       FROM alerts a
       JOIN projects p ON p.id = a.project_id
       ${whereSql}
       ORDER BY a.id DESC
       LIMIT 5000`
    )
    .all(...params);

  function inMode(r) {
    if (baselineMode === 'both') return true;
    const b = r.baselineStartAt;
    if (!b) return baselineMode === 'pre';
    if (baselineMode === 'pre') return r.createdAt < b;
    if (baselineMode === 'post') return r.createdAt >= b;
    return true;
  }

  const filtered = rows.filter(inMode);
  const totalAlerts = filtered.length;
  const acknowledged = filtered.filter((x) => x.acknowledgedAt).length;

  const responseTimesMin = filtered
    .filter((x) => x.acknowledgedAt)
    .map((x) => (new Date(x.acknowledgedAt).getTime() - new Date(x.createdAt).getTime()) / 60000)
    .filter((x) => Number.isFinite(x) && x >= 0);

  const avgResponseMin = responseTimesMin.length
    ? responseTimesMin.reduce((a, b) => a + b, 0) / responseTimesMin.length
    : null;

  const responded = filtered.filter((x) => x.responseAt).length;
  const respondedPct = totalAlerts > 0 ? (responded / totalAlerts) * 100 : null;

  const actionTimesMin = filtered
    .filter((x) => x.responseAt)
    .map((x) => (new Date(x.responseAt).getTime() - new Date(x.createdAt).getTime()) / 60000)
    .filter((x) => Number.isFinite(x) && x >= 0);

  const avgActionMin = actionTimesMin.length
    ? actionTimesMin.reduce((a, b) => a + b, 0) / actionTimesMin.length
    : null;

  const countsByLevel = filtered.reduce(
    (acc, r) => {
      acc[r.riskLevel] = (acc[r.riskLevel] ?? 0) + 1;
      return acc;
    },
    { BAJO: 0, MEDIO: 0, ALTO: 0, 'CRÍTICO': 0 }
  );

  // continuidad operativa: horas de paralización registradas manualmente
  const evWhere = [];
  const evParams = [];
  if (Number.isFinite(projectId)) {
    evWhere.push('project_id = ?');
    evParams.push(projectId);
  }
  const evWhereSql = evWhere.length ? `WHERE ${evWhere.join(' AND ')}` : '';

  const events = db
    .prepare(
      `SELECT e.started_at as startedAt, e.ended_at as endedAt, p.baseline_start_at as baselineStartAt
       FROM project_events e
       JOIN projects p ON p.id = e.project_id
       ${evWhereSql} AND e.type = 'PARALIZACION'`
        .replace('WHERE  AND', 'WHERE')
    )
    .all(...evParams);

  const evFiltered = events.filter((r) => {
    if (baselineMode === 'both') return true;
    const b = r.baselineStartAt;
    if (!b) return baselineMode === 'pre';
    if (baselineMode === 'pre') return r.startedAt < b;
    if (baselineMode === 'post') return r.startedAt >= b;
    return true;
  });

  const downtimeHours = evFiltered
    .filter((e) => e.endedAt)
    .map((e) => (new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()) / 3600000)
    .filter((x) => Number.isFinite(x) && x >= 0)
    .reduce((a, b) => a + b, 0);

  res.json({
    mode: baselineMode,
    projectId: Number.isFinite(projectId) ? projectId : null,
    totalAlerts,
    acknowledgedAlerts: acknowledged,
    avgResponseMinutes: avgResponseMin,
    respondedAlerts: responded,
    respondedPct,
    avgActionMinutes: avgActionMin,
    countsByLevel,
    downtimeHours,
  });
});

app.get('/reports/summary.pdf', authRequired, roleRequired(['GERENTE', 'ADMIN', 'INGENIERO']), (req, res) => {
  try {
    const projectId = req.query.projectId != null && req.query.projectId !== '' ? Number(req.query.projectId) : null;
    if (req.query.projectId != null && req.query.projectId !== '' && !Number.isFinite(projectId)) {
      return res.status(400).json({ error: 'Invalid projectId' });
    }

    // Reutiliza el endpoint /reports/summary internamente (sin HTTP) duplicando la lógica mínima necesaria
    function computeSummary(baselineMode) {
      const where = [];
      const params = [];
      if (Number.isFinite(projectId)) {
        where.push('a.project_id = ?');
        params.push(projectId);
      }
      const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const rows = db
        .prepare(
          `SELECT a.id, a.project_id as projectId, a.created_at as createdAt,
                  a.risk_level as riskLevel, a.acknowledged_at as acknowledgedAt,
                  a.response_at as responseAt,
                  p.baseline_start_at as baselineStartAt
           FROM alerts a
           JOIN projects p ON p.id = a.project_id
           ${whereSql}
           ORDER BY a.id DESC
           LIMIT 5000`
        )
        .all(...params);

      function inMode(r) {
        if (baselineMode === 'both') return true;
        const b = r.baselineStartAt;
        if (!b) return baselineMode === 'pre';
        if (baselineMode === 'pre') return r.createdAt < b;
        if (baselineMode === 'post') return r.createdAt >= b;
        return true;
      }

      const filtered = rows.filter(inMode);
      const totalAlerts = filtered.length;
      const acknowledged = filtered.filter((r) => !!r.acknowledgedAt).length;
      const responded = filtered.filter((r) => !!r.responseAt).length;
      const respondedPct = totalAlerts > 0 ? (responded / totalAlerts) * 100 : 0;

      const responseMins = filtered
        .filter((r) => r.acknowledgedAt)
        .map((r) => (new Date(r.acknowledgedAt).getTime() - new Date(r.createdAt).getTime()) / 60000)
        .filter((x) => Number.isFinite(x) && x >= 0);
      const avgResponseMin = responseMins.length ? responseMins.reduce((a, b) => a + b, 0) / responseMins.length : null;

      const actionMins = filtered
        .filter((r) => r.acknowledgedAt && r.responseAt)
        .map((r) => (new Date(r.responseAt).getTime() - new Date(r.acknowledgedAt).getTime()) / 60000)
        .filter((x) => Number.isFinite(x) && x >= 0);
      const avgActionMin = actionMins.length ? actionMins.reduce((a, b) => a + b, 0) / actionMins.length : null;

      const countsByLevel = filtered.reduce(
        (acc, r) => {
          const k = r.riskLevel;
          acc[k] = (acc[k] ?? 0) + 1;
          return acc;
        },
        { BAJO: 0, MEDIO: 0, ALTO: 0, 'CRÍTICO': 0 }
      );

      const evWhere = [];
      const evParams = [];
      if (Number.isFinite(projectId)) {
        evWhere.push('e.project_id = ?');
        evParams.push(projectId);
      }
      const evWhereSql = evWhere.length ? `WHERE ${evWhere.join(' AND ')}` : '';
      const events = db
        .prepare(
          `SELECT e.started_at as startedAt, e.ended_at as endedAt, p.baseline_start_at as baselineStartAt
           FROM project_events e
           JOIN projects p ON p.id = e.project_id
           ${evWhereSql} AND e.type = 'PARALIZACION'`
            .replace('WHERE  AND', 'WHERE')
        )
        .all(...evParams);

      const evFiltered = events.filter((r) => {
        if (baselineMode === 'both') return true;
        const b = r.baselineStartAt;
        if (!b) return baselineMode === 'pre';
        if (baselineMode === 'pre') return r.startedAt < b;
        if (baselineMode === 'post') return r.startedAt >= b;
        return true;
      });

      const downtimeHours = evFiltered
        .filter((e) => e.endedAt)
        .map((e) => (new Date(e.endedAt).getTime() - new Date(e.startedAt).getTime()) / 3600000)
        .filter((x) => Number.isFinite(x) && x >= 0)
        .reduce((a, b) => a + b, 0);

      return {
        mode: baselineMode,
        projectId: Number.isFinite(projectId) ? projectId : null,
        totalAlerts,
        acknowledgedAlerts: acknowledged,
        avgResponseMinutes: avgResponseMin,
        respondedAlerts: responded,
        respondedPct,
        avgActionMinutes: avgActionMin,
        countsByLevel,
        downtimeHours,
      };
    }

    const pre = computeSummary('pre');
    const post = computeSummary('post');

    const projectName = Number.isFinite(projectId)
      ? db.prepare('SELECT name FROM projects WHERE id = ?').get(projectId)?.name
      : null;

    const nowStr = new Date().toLocaleString();

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="reporte_pre_post_${(projectName ?? 'todos').replace(/[^a-zA-Z0-9_-]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf"`
    );

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    let started = false;
    const safeAbort = () => {
      try {
        if (!res.destroyed) res.destroy();
      } catch {
        // ignore
      }
      try {
        doc.destroy();
      } catch {
        // ignore
      }
    };

    doc.on('error', (err) => {
      try {
        console.error('PDF generation error:', err);
      } catch {
        // ignore
      }
      if (!started && !res.headersSent) {
        res.status(500).json({ error: 'PDF generation failed' });
        return;
      }
      safeAbort();
    });

    res.on('error', () => {
      safeAbort();
    });

    res.on('close', () => {
      safeAbort();
    });

    doc.pipe(res);

    const pageW = doc.page.width;
    const margin = doc.page.margins.left;
    const contentW = pageW - doc.page.margins.left - doc.page.margins.right;
    const brand = '#4F46E5';
    const text = '#111827';
    const muted = '#6B7280';
    const border = '#E5E7EB';

    function drawHeader() {
      const h = 72;
      doc.save();
      doc.rect(0, 0, pageW, h).fill(brand);
      doc.fillColor('#FFFFFF');
      doc.fontSize(16).text('Sistema de Inteligencia Geotécnica', margin, 20, { width: contentW });
      doc.fontSize(11).fillColor('rgba(255,255,255,0.9)').text('Reporte comparativo PRE / POST', margin, 44, { width: contentW });
      doc.restore();
      doc.fillColor(text);
      doc.y = h + 18;
    }

    function drawMetaCard() {
      const x = margin;
      const y0 = doc.y;
      const h = 54;
      doc.roundedRect(x, y0, contentW, h, 10).fill('#F8FAFC');
      doc.roundedRect(x, y0, contentW, h, 10).strokeColor(border).stroke();

      doc.fillColor(muted).fontSize(9).text('FECHA', x + 14, y0 + 12);
      doc.fillColor(text).fontSize(11).text(nowStr, x + 14, y0 + 24, { width: contentW / 2 - 14 });

      doc.fillColor(muted).fontSize(9).text('PROYECTO', x + contentW / 2 + 10, y0 + 12);
      doc.fillColor(text).fontSize(11).text(projectName ?? 'Todos los proyectos', x + contentW / 2 + 10, y0 + 24, { width: contentW / 2 - 20 });

      doc.y = y0 + h + 18;
    }

    function sectionTitle(title) {
      doc.fillColor(text).fontSize(13).text(title, margin, doc.y, { width: contentW });
      doc.moveDown(0.6);
    }

    function drawFooter() {
      const y0 = doc.page.height - doc.page.margins.bottom + 18;
      doc.save();
      doc.fillColor(muted).fontSize(8);
      doc.text(`Generado: ${nowStr}`, margin, y0, { width: contentW, align: 'left' });
      doc.text(`Página ${doc.page.number}`, margin, y0, { width: contentW, align: 'right' });
      doc.restore();
    }

    function drawBadge(label, { bg, fg }, x, y) {
      const padX = 8;
      const padY = 4;
      const w = doc.widthOfString(label, { size: 10 }) + padX * 2;
      const h = 10 + padY * 2;
      doc.roundedRect(x, y, w, h, 999).fill(bg);
      doc.fillColor(fg).fontSize(10).text(label, x + padX, y + padY, { width: w - padX * 2, align: 'center' });
      doc.fillColor(text);
      return { w, h };
    }

    function levelStyle(level) {
      if (level === 'BAJO') return { bg: '#DCFCE7', fg: '#166534' };
      if (level === 'MEDIO') return { bg: '#FEF9C3', fg: '#854D0E' };
      if (level === 'ALTO') return { bg: '#FFEDD5', fg: '#9A3412' };
      return { bg: '#FEE2E2', fg: '#991B1B' };
    }

    function drawTableHeader({ y, col1, col2, col3, col4, wLabel, wPre, wPost, wDelta }) {
      doc.rect(col1, y - 6, (col4 + wDelta) - col1, 22).fill('#F1F5F9');
      doc.fillColor(muted).fontSize(10);
      doc.text('Métrica', col1, y, { width: wLabel });
      doc.text('PRE', col2, y, { width: wPre, align: 'right' });
      doc.fillColor(brand).text('POST', col3, y, { width: wPost, align: 'right' });
      doc.fillColor(muted).text('Δ%', col4, y, { width: wDelta, align: 'right' });
      doc.fillColor(text);
      doc.moveTo(col1, y + 16).lineTo(col4 + wDelta, y + 16).strokeColor(border).stroke();
    }

    const tableX = margin;
    let y = doc.y;
    const wLabel = 280;
    const wPre = 70;
    const wPost = 70;
    const wDelta = 65;
    const gap = 10;
    const col1 = tableX;
    const col2 = col1 + wLabel + gap;
    const col3 = col2 + wPre + gap;
    const col4 = col3 + wPost + gap;

    function fmtNumber(v, digits = 1) {
      if (v == null) return '-';
      const n = Number(v);
      if (!Number.isFinite(n)) return '-';
      return n.toFixed(digits);
    }

    function fmtInt(v) {
      if (v == null) return '-';
      const n = Number(v);
      if (!Number.isFinite(n)) return '-';
      return String(Math.round(n));
    }

    drawTableHeader({ y, col1, col2, col3, col4, wLabel, wPre, wPost, wDelta });
    y += 26;

    let zebra = false;
    function row(label, preVal, postVal, fmt = (v) => (v == null ? '-' : String(v))) {
      // Simple page-break guard (si el contenido crece)
      if (y > 760) {
        doc.addPage();
        drawHeader();
        drawMetaCard();
        y = doc.y;
        sectionTitle('Resumen de métricas (cont.)');
        y = doc.y;
        drawTableHeader({ y, col1, col2, col3, col4, wLabel, wPre, wPost, wDelta });
        y += 26;
      }
      zebra = !zebra;
      if (zebra) {
        doc.rect(col1, y - 4, (col4 + wDelta) - col1, 20).fill('#FAFAFB');
      }
      doc.fontSize(11).fillColor('#111827').text(label, col1, y, { width: wLabel });
      doc.fontSize(11).fillColor('#111827').text(fmt(preVal), col2, y, { width: wPre, align: 'right' });
      doc.fontSize(11).fillColor('#111827').text(fmt(postVal), col3, y, { width: wPost, align: 'right' });
      const preN = preVal == null ? null : Number(preVal);
      const postN = postVal == null ? null : Number(postVal);
      const imp =
        preN != null && postN != null && Number.isFinite(preN) && Number.isFinite(postN) && preN !== 0
          ? ((preN - postN) / preN) * 100
          : null;
      doc
        .fontSize(11)
        .fillColor(imp != null && imp > 0 ? '#059669' : imp != null && imp < 0 ? '#DC2626' : muted)
        .text(imp == null ? '-' : `${imp > 0 ? '-' : '+'}${Math.abs(imp).toFixed(1)}`, col4, y, { width: wDelta, align: 'right' });
      doc.fillColor(text);
      doc.moveTo(col1, y + 16).lineTo(col4 + wDelta, y + 16).strokeColor('#F1F5F9').stroke();
      y += 20;
    }

    row('Alertas totales', pre.totalAlerts, post.totalAlerts, fmtInt);
    row('Alertas reconocidas', pre.acknowledgedAlerts, post.acknowledgedAlerts, fmtInt);
    row('Acciones correctivas', pre.respondedAlerts, post.respondedAlerts, fmtInt);
    row('Tiempo respuesta (min)', pre.avgResponseMinutes, post.avgResponseMinutes, (v) => fmtNumber(v, 1));
    row('Tiempo acción correctiva (min)', pre.avgActionMinutes, post.avgActionMinutes, (v) => fmtNumber(v, 1));
    row('Horas paralización', pre.downtimeHours, post.downtimeHours, (v) => fmtNumber(v, 1));

    // Bloque: Alertas por nivel (card compacto)
    let by = y + 18;
    if (by > 720) {
      doc.addPage();
      drawHeader();
      drawMetaCard();
      by = doc.y;
    }
    doc.y = by;
    sectionTitle('Alertas por nivel de riesgo');
    by = doc.y;

    const cardX = margin;
    const cardW = contentW;
    const rowH = 24;
    const cardH = 18 + rowH * 4 + 14;
    doc.roundedRect(cardX, by, cardW, cardH, 10).fill('#FFFFFF');
    doc.roundedRect(cardX, by, cardW, cardH, 10).strokeColor(border).stroke();

    const innerX = cardX + 14;
    let cy = by + 12;
    const colNameW = 190;
    const colPreW = 90;
    const colPostW = 90;
    const colPreX = innerX + colNameW;
    const colPostX = colPreX + colPreW;

    doc.fillColor(muted).fontSize(9).text('Nivel', innerX, cy);
    doc.text('PRE', colPreX, cy, { width: colPreW, align: 'right' });
    doc.fillColor(brand).text('POST', colPostX, cy, { width: colPostW, align: 'right' });
    doc.fillColor(text);
    cy += 12;
    doc.moveTo(innerX, cy).lineTo(cardX + cardW - 14, cy).strokeColor('#F1F5F9').stroke();
    cy += 8;

    const levels = ['BAJO', 'MEDIO', 'ALTO', 'CRÍTICO'];
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      if (i % 2 === 0) {
        doc.rect(cardX + 6, cy - 4, cardW - 12, rowH).fill('#FAFAFB');
      }
      drawBadge(level, levelStyle(level), innerX, cy);
      doc.fillColor(text).fontSize(11).text(String(pre.countsByLevel?.[level] ?? 0), colPreX, cy + 2, { width: colPreW, align: 'right' });
      doc.fillColor(text).fontSize(11).text(String(post.countsByLevel?.[level] ?? 0), colPostX, cy + 2, { width: colPostW, align: 'right' });
      cy += rowH;
    }

    by = by + cardH + 12;

    const blockX = margin;
    const blockW = contentW;

    // Bloque: Nota (wrap con width fijo)
    const note =
      'Nota: PRE/POST se calcula según baseline del proyecto (baseline_start_at). Este PDF es un resumen para la tesis.\n' +
      'El sistema registra clima automático, alertas, ACK, acciones correctivas, paralizaciones y actividades para evidenciar impacto.';

    if (by > 740) {
      doc.addPage();
      drawHeader();
      drawMetaCard();
      by = doc.y;
    }
    doc.fontSize(9).fillColor(muted).text(note, blockX, by, { width: blockW, align: 'left' });
    doc.fillColor(text);

    drawFooter();

    doc.end();
  } catch (err) {
    try {
      console.error('reports/summary.pdf error:', err);
    } catch {
      // ignore
    }
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to generate PDF' });
    }
  }
});

app.get('/reports/alerts.csv', authRequired, roleRequired(['GERENTE', 'ADMIN']), (req, res) => {
  const projectId = req.query.projectId != null && req.query.projectId !== '' ? Number(req.query.projectId) : null;
  if (req.query.projectId != null && req.query.projectId !== '' && !Number.isFinite(projectId)) {
    return res.status(400).json({ error: 'Invalid projectId' });
  }

  const whereSql = projectId != null ? 'WHERE a.project_id = ?' : '';
  const params = projectId != null ? [projectId] : [];

  const rows = db
    .prepare(
      `SELECT a.id, a.project_id as projectId, a.zone_id as zoneId, a.created_at as createdAt,
              a.score, a.risk_level as riskLevel, a.probable_cause as probableCause, a.recommendation,
              a.source, a.acknowledged_at as acknowledgedAt, a.acknowledged_by as acknowledgedBy, a.resolved_at as resolvedAt,
              a.response_action as responseAction, a.response_at as responseAt, a.response_by as responseBy,
              p.baseline_start_at as baselineStartAt
       FROM alerts a
       JOIN projects p ON p.id = a.project_id
       ${whereSql}
       ORDER BY a.id ASC`
    )
    .all(...params);

  const header = [
    'id',
    'projectId',
    'zoneId',
    'createdAt',
    'score',
    'riskLevel',
    'source',
    'acknowledgedAt',
    'acknowledgedBy',
    'resolvedAt',
    'responseAction',
    'responseAt',
    'responseBy',
    'baselineStartAt',
    'probableCause',
    'recommendation',
  ];

  const escape = (v) => {
    const s = String(v ?? '');
    if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.projectId,
        r.zoneId ?? '',
        r.createdAt,
        r.score,
        r.riskLevel,
        r.source,
        r.acknowledgedAt ?? '',
        r.acknowledgedBy ?? '',
        r.resolvedAt ?? '',
        r.responseAction ?? '',
        r.responseAt ?? '',
        r.responseBy ?? '',
        r.baselineStartAt ?? '',
        r.probableCause,
        r.recommendation,
      ]
        .map(escape)
        .join(',')
    );
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="alerts.csv"');
  res.send(lines.join('\n'));
});

app.get('/docs/manual.pdf', authRequired, (req, res) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'attachment; filename="manual_usuario_sistema_inteligencia_geotecnica.pdf"');

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  doc.pipe(res);

  const nowStr = new Date().toLocaleString();

  doc.fontSize(18).fillColor('#111827').text('Manual de Usuario', { align: 'left' });
  doc.fontSize(13).fillColor('#374151').text('Sistema de Inteligencia Geotécnica (SIG)');
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor('#6B7280').text(`Generado: ${nowStr}`);
  doc.moveDown(1);

  function h1(title) {
    doc.moveDown(0.6);
    doc.fontSize(13).fillColor('#111827').text(title, { underline: true });
    doc.moveDown(0.2);
  }

  function p(text) {
    doc.fontSize(10.5).fillColor('#111827').text(text, { align: 'left' });
    doc.moveDown(0.3);
  }

  function bullets(items) {
    doc.fontSize(10.5).fillColor('#111827');
    for (const it of items) {
      doc.text(`- ${it}`);
    }
    doc.moveDown(0.3);
  }

  h1('1. Objetivo del sistema');
  p(
    'El SIG permite monitorear riesgo geotécnico por proyecto y zona integrando datos geotécnicos, clima, motor de riesgo, alertas en tiempo real, gestión del proyecto y reportes PRE/POST para tesis.'
  );

  h1('2. Requisitos y ejecución');
  p('Requisitos: Node.js, terminal (PowerShell/CMD) y navegador.');
  bullets([
    'Backend: ejecutar npm install y npm run dev en /backend (API: http://localhost:3001)',
    'Frontend: ejecutar npm install y npm run dev en /frontend (UI: http://localhost:5173)',
  ]);

  h1('3. Acceso (Login)');
  bullets(['Ingresar correo y contraseña.', 'El sistema usa token JWT para consumir la API.']);

  h1('4. Mapa');
  bullets([
    'Visualiza proyectos por ubicación.',
    'Indicadores por nivel de riesgo (CRÍTICO con marcador pulsante).',
    'Actualización en tiempo real (WebSocket) cuando llegan alertas.',
  ]);

  h1('5. Proyecto (Panel de control)');
  bullets([
    'KPIs: riesgo actual, total de alertas, tiempo respuesta, horas paralización.',
    'Presupuesto/cronograma: plan vs real.',
    'Paralización: iniciar/detener, historial y duración.',
    'Actividades: planificadas vs ejecutadas, progreso, iniciar y completar.',
  ]);

  h1('6. Alertas (ACK, respuesta, resolución)');
  bullets([
    'ACK: reconoce la alerta (impacta tiempo de respuesta).',
    'Respuesta: registra acción correctiva (impacta métricas PRE/POST).',
    'Resolver: marca la alerta como cerrada.',
  ]);

  h1('7. Reportes PRE/POST');
  bullets([
    'Comparación PRE/POST según baseline_start_at.',
    'Descarga CSV filtrable por proyecto.',
    'Descarga PDF resumen para anexar a tesis.',
  ]);

  h1('8. Problemas comunes');
  bullets([
    'Missing token: debes iniciar sesión desde el frontend o enviar Authorization en pruebas.',
    'EADDRINUSE 3001: hay otro proceso usando el puerto; cierra la instancia anterior.',
    'Failed to fetch/CORS: normalmente por backend no reiniciado o extensiones (ej. IDM).',
  ]);

  doc.moveDown(0.8);
  doc.fontSize(9).fillColor('#6B7280').text('Fin del manual.', { align: 'left' });

  doc.end();
});

app.post('/projects/:projectId/events/paralizacion', authRequired, roleRequired(['INGENIERO', 'ADMIN']), (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

  const schema = z.object({
    zoneId: z.number().int().positive().optional().nullable(),
    notes: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  // Verificar si ya hay una paralización activa
  const active = db
    .prepare('SELECT id FROM project_events WHERE project_id = ? AND type = ? AND ended_at IS NULL ORDER BY id DESC LIMIT 1')
    .get(projectId, 'PARALIZACION');
  if (active) {
    return res.status(409).json({ error: 'Ya existe una paralización activa', activeId: active.id });
  }

  const now = new Date().toISOString();
  const zoneId = parsed.data.zoneId ?? null;

  const info = db
    .prepare(
      `INSERT INTO project_events (project_id, zone_id, type, started_at, ended_at, notes, created_by, created_at)
       VALUES (?, ?, 'PARALIZACION', ?, NULL, ?, ?, ?)`
    )
    .run(projectId, zoneId, now, parsed.data.notes ?? null, req.user.sub, now);

  res.json({ id: info.lastInsertRowid, startedAt: now });
});

app.post('/projects/:projectId/events/paralizacion/:eventId/stop', authRequired, roleRequired(['INGENIERO', 'ADMIN']), (req, res) => {
  const projectId = Number(req.params.projectId);
  const eventId = Number(req.params.eventId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  if (!Number.isFinite(eventId)) return res.status(400).json({ error: 'Invalid eventId' });

  const schema = z.object({
    notes: z.string().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body ?? {});

  const now = new Date().toISOString();

  const cur = db
    .prepare('SELECT id, started_at, ended_at FROM project_events WHERE id = ? AND project_id = ? AND type = ?')
    .get(eventId, projectId, 'PARALIZACION');
  if (!cur) return res.status(404).json({ error: 'Not found' });
  if (cur.ended_at) return res.status(409).json({ error: 'Paralización ya finalizada' });

  const extraNotes = parsed.data?.notes ?? null;
  const finalNotes = extraNotes
    ? (cur.notes ? `${cur.notes}\n--- Final ---\n${extraNotes}` : extraNotes)
    : cur.notes;

  db.prepare(
    'UPDATE project_events SET ended_at = ?, notes = COALESCE(?, notes) WHERE id = ? AND project_id = ?'
  ).run(now, finalNotes, eventId, projectId);

  const startedAt = new Date(cur.started_at).getTime();
  const endedAt = new Date(now).getTime();
  const durationMinutes = Math.round((endedAt - startedAt) / 60000);

  res.json({ ok: true, endedAt: now, durationMinutes, durationHours: (durationMinutes / 60).toFixed(2) });
});

app.get('/projects/:projectId/events/paralizacion', authRequired, (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

  const rows = db
    .prepare(
      `SELECT id, project_id as projectId, zone_id as zoneId, type, started_at as startedAt,
              ended_at as endedAt, notes, created_by as createdBy, created_at as createdAt
       FROM project_events
       WHERE project_id = ? AND type = ?
       ORDER BY id DESC`
    )
    .all(projectId, 'PARALIZACION');

  const items = rows.map((r) => {
    const started = new Date(r.startedAt).getTime();
    const ended = r.endedAt ? new Date(r.endedAt).getTime() : null;
    const now = Date.now();
    const durationMs = ended ? ended - started : now - started;
    const durationMinutes = Math.round(durationMs / 60000);
    return {
      ...r,
      isActive: !r.endedAt,
      durationMinutes,
      durationHours: (durationMinutes / 60).toFixed(2),
    };
  });

  res.json({ items });
});

app.put('/projects/:projectId', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

  const schema = z.object({
    name: z.string().min(1).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lon: z.number().min(-180).max(180).optional(),
    status: z.enum(['ACTIVO', 'PAUSADO', 'CERRADO']).optional(),
    plannedBudget: z.number().positive().optional().nullable(),
    plannedStart: z.string().optional().nullable(),
    plannedEnd: z.string().optional().nullable(),
    actualBudget: z.number().min(0).optional().nullable(),
    actualEnd: z.string().optional().nullable(),
    sentinelEnabled: z.boolean().optional(),
    scanFrequencyMinutes: z.coerce.number().min(1).max(10080).optional()
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const cur = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!cur) return res.status(404).json({ error: 'Not found' });

  const fields = [];
  const params = [];
  const d = parsed.data;
  if (d.name != null) {
    fields.push('name = ?');
    params.push(d.name);
  }
  if (d.lat != null) {
    fields.push('lat = ?');
    params.push(d.lat);
  }
  if (d.lon != null) {
    fields.push('lon = ?');
    params.push(d.lon);
  }
  if (d.status != null) {
    fields.push('status = ?');
    params.push(d.status);
  }
  if (d.plannedBudget !== undefined) {
    fields.push('planned_budget = ?');
    params.push(d.plannedBudget);
  }
  if (d.plannedStart !== undefined) {
    fields.push('planned_start = ?');
    params.push(d.plannedStart);
  }
  if (d.plannedEnd !== undefined) {
    fields.push('planned_end = ?');
    params.push(d.plannedEnd);
  }
  if (d.actualBudget !== undefined) {
    fields.push('actual_budget = ?');
    params.push(d.actualBudget);
  }
  if (d.actualEnd !== undefined) {
    fields.push('actual_end = ?');
    params.push(d.actualEnd);
  }
  if (d.sentinelEnabled !== undefined) {
    fields.push('sentinel_enabled = ?');
    params.push(d.sentinelEnabled ? 1 : 0);
  }
  if (d.scanFrequencyMinutes !== undefined) {
    fields.push('scan_frequency_minutes = ?');
    params.push(d.scanFrequencyMinutes);
  }

  if (fields.length === 0) return res.json({ ok: true });
  db.prepare(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`).run(...params, projectId);
  res.json({ ok: true });
});

app.delete('/projects/:projectId', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

  const cur = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!cur) return res.status(404).json({ error: 'Not found' });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM alerts WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM project_events WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM geotech_profiles WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM zones WHERE project_id = ?').run(projectId);
    db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
  });
  tx();

  res.json({ ok: true });
});

app.post('/alerts/:alertId/ack', authRequired, roleRequired(['INGENIERO', 'ADMIN']), (req, res) => {
  const alertId = Number(req.params.alertId);
  if (!Number.isFinite(alertId)) return res.status(400).json({ error: 'Invalid alertId' });
  const now = new Date().toISOString();
  db.prepare('UPDATE alerts SET acknowledged_at = COALESCE(acknowledged_at, ?), acknowledged_by = COALESCE(acknowledged_by, ?) WHERE id = ?')
    .run(now, req.user.sub, alertId);
  res.json({ ok: true });
});

app.post('/alerts/:alertId/resolve', authRequired, roleRequired(['INGENIERO', 'ADMIN']), (req, res) => {
  const alertId = Number(req.params.alertId);
  if (!Number.isFinite(alertId)) return res.status(400).json({ error: 'Invalid alertId' });
  const now = new Date().toISOString();
  db.prepare('UPDATE alerts SET resolved_at = COALESCE(resolved_at, ?) WHERE id = ?').run(now, alertId);
  res.json({ ok: true });
});

app.post('/alerts/:alertId/respond', authRequired, roleRequired(['INGENIERO', 'ADMIN']), (req, res) => {
  const alertId = Number(req.params.alertId);
  if (!Number.isFinite(alertId)) return res.status(400).json({ error: 'Invalid alertId' });

  const schema = z.object({
    action: z.string().min(1).max(2000),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE alerts SET response_action = ?, response_at = COALESCE(response_at, ?), response_by = COALESCE(response_by, ?) WHERE id = ?'
  ).run(parsed.data.action, now, req.user.sub, alertId);

  res.json({ ok: true, responseAt: now });
});

app.post('/debug/projects/:projectId/alerts/create', authRequired, roleRequired(['ADMIN']), (req, res) => {
  if (String(process.env.NODE_ENV ?? '').toLowerCase() === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

  const schema = z.object({
    riskLevel: z.enum(['MEDIO', 'ALTO', 'CRÍTICO']).optional(),
    score: z.number().optional(),
    probableCause: z.string().optional(),
    recommendation: z.string().optional(),
    source: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const cur = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId);
  if (!cur) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
  const riskLevel = parsed.data.riskLevel ?? 'ALTO';
  const score = parsed.data.score ?? (riskLevel === 'MEDIO' ? 55 : riskLevel === 'ALTO' ? 75 : 92);
  const probableCause = parsed.data.probableCause ?? 'Alerta de prueba (debug)';
  const recommendation = parsed.data.recommendation ?? 'Registrar acción correctiva y documentar respuesta.';
  const source = parsed.data.source ?? 'debug';

  const info = insertAlert.run({
    project_id: projectId,
    zone_id: null,
    created_at: now,
    score,
    risk_level: riskLevel,
    probable_cause: probableCause,
    recommendation,
    source,
  });

  const wsPayload = {
    alertId: info.lastInsertRowid,
    projectId,
    zoneId: null,
    createdAt: now,
    score,
    riskLevel,
    probableCause,
    recommendation,
    source,
  };
  broadcast({ type: 'risk_alert', payload: wsPayload });

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.post('/auth/login', (req, res) => {
  const schema = z.object({ email: z.string().email(), password: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

  const user = db
    .prepare('SELECT id, email, password_hash as passwordHash, role FROM users WHERE email = ?')
    .get(parsed.data.email);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = bcrypt.compareSync(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ sub: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

app.post('/auth/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requerido' });

  const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (!user) {
    // No revelamos si el correo existe o no por seguridad, pero enviamos 200 para no dar pistas
    return res.json({ ok: true, message: 'Si el correo existe, se enviará un código' });
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60000).toISOString(); // 15 mins
  const now = new Date().toISOString();

  db.prepare('INSERT INTO password_reset_codes (email, code, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(email, code, expiresAt, now);

  try {
    await transporter.sendMail({
      from: '"SIG Geotecnia" <ruizruizpiero2@gmail.com>',
      to: email,
      subject: 'Código de recuperación de contraseña',
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
          <h2>Recuperación de Contraseña</h2>
          <p>Has solicitado restablecer tu contraseña en el Sistema de Inteligencia Geotécnica.</p>
          <p>Tu código de verificación es:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #4f46e5; margin: 20px 0;">
            ${code}
          </div>
          <p>Este código expirará en 15 minutos.</p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #64748b;">Si no solicitaste este cambio, simplemente ignora este correo.</p>
        </div>
      `
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('Error sending email:', err);
    res.status(500).json({ error: 'Error enviando el correo' });
  }
});

app.post('/auth/verify-code', (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) return res.status(400).json({ error: 'Email y código requeridos' });

  const row = db.prepare('SELECT id FROM password_reset_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1')
    .get(email, code, new Date().toISOString());

  if (!row) {
    return res.status(400).json({ error: 'Código inválido o expirado' });
  }

  res.json({ ok: true });
});

app.post('/auth/reset-password', (req, res) => {
  const { email, code, newPassword } = req.body;
  if (!email || !code || !newPassword) return res.status(400).json({ error: 'Faltan campos requeridos' });

  const reset = db.prepare('SELECT id FROM password_reset_codes WHERE email = ? AND code = ? AND used = 0 AND expires_at > ? ORDER BY id DESC LIMIT 1')
    .get(email, code, new Date().toISOString());

  if (!reset) {
    return res.status(400).json({ error: 'Sesión de recuperación inválida' });
  }

  const hash = bcrypt.hashSync(newPassword, 10);

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(hash, email);
    db.prepare('UPDATE password_reset_codes SET used = 1 WHERE id = ?').run(reset.id);
  });
  tx();

  res.json({ ok: true });
});

app.get('/auth/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

app.get('/projects', authRequired, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, name, lat, lon, status, planned_budget as plannedBudget,
              planned_start as plannedStart, planned_end as plannedEnd,
              actual_budget as actualBudget, actual_end as actualEnd,
              baseline_start_at as baselineStartAt,
              sentinel_enabled as sentinel_enabled,
              scan_frequency_minutes as scan_frequency_minutes,
              last_scan_at as last_scan_at,
              created_at as createdAt
       FROM projects
       ORDER BY id ASC`
    )
    .all();
  res.json({ items: rows });
});

app.get('/projects/:projectId', authRequired, (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

  const row = db
    .prepare(
      `SELECT id, name, lat, lon, status, planned_budget as plannedBudget,
              planned_start as plannedStart, planned_end as plannedEnd,
              actual_budget as actualBudget, actual_end as actualEnd,
              baseline_start_at as baselineStartAt,
              sentinel_enabled as sentinel_enabled,
              scan_frequency_minutes as scan_frequency_minutes,
              last_scan_at as last_scan_at,
              created_at as createdAt
       FROM projects
       WHERE id = ?`
    )
    .get(projectId);

  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ project: row });
});

app.post('/projects/:projectId/baseline/start', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  const now = new Date().toISOString();
  db.prepare('UPDATE projects SET baseline_start_at = COALESCE(baseline_start_at, ?) WHERE id = ?').run(now, projectId);
  res.json({ ok: true, baselineStartAt: now });
});



app.post('/projects', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    lat: z.number().min(-90).max(90),
    lon: z.number().min(-180).max(180),
    plannedBudget: z.number().positive().optional(),
    plannedStart: z.string().optional(),
    plannedEnd: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO projects (name, lat, lon, status, planned_budget, planned_start, planned_end, created_at)
       VALUES (@name, @lat, @lon, 'ACTIVO', @planned_budget, @planned_start, @planned_end, @created_at)`
    )
    .run({
      name: parsed.data.name,
      lat: parsed.data.lat,
      lon: parsed.data.lon,
      planned_budget: parsed.data.plannedBudget ?? null,
      planned_start: parsed.data.plannedStart ?? null,
      planned_end: parsed.data.plannedEnd ?? null,
      created_at: now,
    });

  res.json({ id: info.lastInsertRowid });
});

app.get('/projects/:projectId/zones', authRequired, (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  const rows = db
    .prepare('SELECT id, project_id as projectId, name, created_at as createdAt FROM zones WHERE project_id = ? ORDER BY id ASC')
    .all(projectId);
  res.json({ items: rows });
});

app.post('/projects/:projectId/zones', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  const schema = z.object({ name: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

  const now = new Date().toISOString();
  const info = db.prepare('INSERT INTO zones (project_id, name, created_at) VALUES (?, ?, ?)').run(projectId, parsed.data.name, now);
  res.json({ id: info.lastInsertRowid });
});

app.put('/projects/:projectId/zones/:zoneId', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const projectId = Number(req.params.projectId);
  const zoneId = Number(req.params.zoneId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  if (!Number.isFinite(zoneId)) return res.status(400).json({ error: 'Invalid zoneId' });

  const schema = z.object({ name: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload' });

  const cur = db.prepare('SELECT id FROM zones WHERE id = ? AND project_id = ?').get(zoneId, projectId);
  if (!cur) return res.status(404).json({ error: 'Not found' });

  db.prepare('UPDATE zones SET name = ? WHERE id = ? AND project_id = ?').run(parsed.data.name, zoneId, projectId);
  res.json({ ok: true });
});

app.delete('/projects/:projectId/zones/:zoneId', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const projectId = Number(req.params.projectId);
  const zoneId = Number(req.params.zoneId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  if (!Number.isFinite(zoneId)) return res.status(400).json({ error: 'Invalid zoneId' });

  const cur = db.prepare('SELECT id FROM zones WHERE id = ? AND project_id = ?').get(zoneId, projectId);
  if (!cur) return res.status(404).json({ error: 'Not found' });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM alerts WHERE project_id = ? AND zone_id = ?').run(projectId, zoneId);
    db.prepare('DELETE FROM project_events WHERE project_id = ? AND zone_id = ?').run(projectId, zoneId);
    db.prepare('DELETE FROM geotech_profiles WHERE project_id = ? AND zone_id = ?').run(projectId, zoneId);
    db.prepare('DELETE FROM zones WHERE id = ? AND project_id = ?').run(zoneId, projectId);
  });
  tx();

  res.json({ ok: true });
});

app.get('/projects/:projectId/geotech', authRequired, (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

  const zoneId = req.query.zoneId ? Number(req.query.zoneId) : null;
  const includeArchived = req.query.includeArchived === 'true';
  const limit = clamp(Number(req.query.limit ?? 100), 1, 1000);

  let sql = `
    SELECT 
      gp.id, gp.project_id as projectId, gp.zone_id as zoneId,
      gp.lat, gp.lon, gp.soil_type as soilType,
      gp.bearing_capacity_kpa as bearingCapacityKpa,
      gp.soil_moisture_index as soilMoistureIndex,
      gp.shear_strength_kpa as shearStrengthKpa,
      gp.water_table_depth_m as waterTableDepthM,
      gp.replaced_by as replacedBy,
      gp.archived_at as archivedAt,
      gp.archived_by as archivedBy,
      gp.updated_at as updatedAt,
      cs.temp_c as climateTemp,
      cs.humidity_pct as climateHumidity,
      cs.wind_speed_ms as climateWind,
      cs.condition_text as climateCondition,
      cs.condition_icon as climateIcon
    FROM geotech_profiles gp
    LEFT JOIN climate_samples cs ON cs.id = gp.climate_sample_id
    WHERE gp.project_id = ?
  `;
  const params = [projectId];

  if (zoneId) {
    sql += ' AND gp.zone_id = ?';
    params.push(zoneId);
  }
  if (!includeArchived) {
    sql += ' AND gp.archived_at IS NULL';
  }

  sql += ' ORDER BY gp.id DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  res.json({ items: rows });
});

app.delete('/projects/:projectId/geotech/:profileId', authRequired, roleRequired(['ADMIN']), (req, res) => {
  const projectId = Number(req.params.projectId);
  const profileId = Number(req.params.profileId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  if (!Number.isFinite(profileId)) return res.status(400).json({ error: 'Invalid profileId' });

  const cur = db.prepare('SELECT id FROM geotech_profiles WHERE id = ? AND project_id = ?').get(profileId, projectId);
  if (!cur) return res.status(404).json({ error: 'Not found' });

  db.prepare('DELETE FROM geotech_profiles WHERE id = ? AND project_id = ?').run(profileId, projectId);
  res.json({ ok: true });
});

app.post('/projects/:projectId/geotech/:profileId/archive', authRequired, roleRequired(['ADMIN']), (req, res) => {
  const projectId = Number(req.params.projectId);
  const profileId = Number(req.params.profileId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  if (!Number.isFinite(profileId)) return res.status(400).json({ error: 'Invalid profileId' });

  const cur = db.prepare('SELECT id FROM geotech_profiles WHERE id = ? AND project_id = ?').get(profileId, projectId);
  if (!cur) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
  db.prepare(
    'UPDATE geotech_profiles SET archived_at = COALESCE(archived_at, ?), archived_by = COALESCE(archived_by, ?) WHERE id = ? AND project_id = ?'
  ).run(now, req.user.sub, profileId, projectId);
  res.json({ ok: true, archivedAt: now });
});

app.post('/projects/:projectId/geotech/:profileId/replace', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const projectId = Number(req.params.projectId);
  const profileId = Number(req.params.profileId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });
  if (!Number.isFinite(profileId)) return res.status(400).json({ error: 'Invalid profileId' });

  const base = db
    .prepare(
      `SELECT id, zone_id as zoneId
       FROM geotech_profiles
       WHERE id = ? AND project_id = ?`
    )
    .get(profileId, projectId);
  if (!base) return res.status(404).json({ error: 'Not found' });

  const schema = z.object({
    zoneId: z.number().int().positive().optional().nullable(),
    lat: z.number().optional().nullable(),
    lon: z.number().optional().nullable(),
    soilType: z.string().min(1),
    bearingCapacityKpa: z.number().optional().nullable(),
    moistureIndex: z.number().optional().nullable(),
    shearStrengthKpa: z.number().optional().nullable(),
    waterTableDepthM: z.number().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const now = new Date().toISOString();
  const d = parsed.data;

  const tx = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO geotech_profiles (
           project_id, zone_id, lat, lon, soil_type, 
           bearing_capacity_kpa, soil_moisture_index, shear_strength_kpa, water_table_depth_m, 
           updated_at, climate_sample_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        projectId,
        d.zoneId ?? base.zoneId ?? null,
        d.lat ?? base.lat ?? null,
        d.lon ?? base.lon ?? null,
        d.soilType,
        d.bearingCapacityKpa ?? null,
        d.moistureIndex ?? null,
        d.shearStrengthKpa ?? null,
        d.waterTableDepthM ?? null,
        now,
        base.climate_sample_id // Mantener el vínculo de clima si existía
      );

    const newId = info.lastInsertRowid;
    db.prepare(
      'UPDATE geotech_profiles SET replaced_by = ?, archived_at = COALESCE(archived_at, ?), archived_by = COALESCE(archived_by, ?) WHERE id = ? AND project_id = ?'
    ).run(newId, now, req.user.sub, profileId, projectId);

    return newId;
  });

  const newId = tx();
  res.json({ ok: true, id: newId, replacedId: profileId, updatedAt: now });
});

app.put('/projects/:projectId/geotech', authRequired, roleRequired(['INGENIERO', 'ADMIN']), async (req, res) => {
  const projectId = Number(req.params.projectId);
  if (!Number.isFinite(projectId)) return res.status(400).json({ error: 'Invalid projectId' });

  const schema = z.object({
    zoneId: z.number().int().positive().optional().nullable(),
    lat: z.number().optional().nullable(),
    lon: z.number().optional().nullable(),
    soilType: z.string().min(1),
    bearingCapacityKpa: z.number().optional().nullable(),
    moistureIndex: z.number().optional().nullable(),
    shearStrengthKpa: z.number().optional().nullable(),
    waterTableDepthM: z.number().optional().nullable(),
    captureClimate: z.boolean().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const now = new Date().toISOString();
  const d = parsed.data;

  let climateSampleId = null;
  if (d.captureClimate) {
    try {
      let clat = null, clon = null;
      if (d.zoneId) {
        const zone = db.prepare('SELECT lat, lon FROM zones WHERE id = ?').get(d.zoneId);
        if (zone && zone.lat != null && zone.lon != null) {
          clat = zone.lat;
          clon = zone.lon;
          console.log(`[GEOTECH] Usando coordenadas de ZONA ${d.zoneId}: ${clat}, ${clon}`);
        } else {
          console.warn(`[GEOTECH] Zona ${d.zoneId} no tiene coordenadas, usando coordenadas de PROYECTO.`);
        }
      }

      if (clat == null || clon == null) {
        const proj = db.prepare('SELECT lat, lon FROM projects WHERE id = ?').get(projectId);
        if (proj) {
          clat = proj.lat;
          clon = proj.lon;
          console.log(`[GEOTECH] Usando coordenadas de PROYECTO ${projectId}: ${clat}, ${clon}`);
        }
      }

      if (clat != null && clon != null) {
        const cdata = await fetchFromOpenWeatherMap(clat, clon);
        const nowLocal = new Date().toISOString();
        const info = insertClimateSample.run({
          project_id: projectId,
          zone_id: d.zoneId || null,
          lat: clat,
          lon: clon,
          temp_c: cdata.tempC,
          feels_like_c: cdata.feelsLikeC,
          precipitation_24h_mm: cdata.precipitation24hMm,
          humidity_pct: cdata.humidityPct,
          pressure_hpa: cdata.pressureHpa,
          wind_speed_ms: cdata.windSpeedMs,
          wind_deg: cdata.windDeg,
          gust_ms: cdata.gustMs,
          clouds_pct: cdata.cloudsPct,
          visibility_m: cdata.visibilityM,
          condition_text: cdata.conditionText,
          condition_icon: cdata.conditionIcon,
          source: 'openweathermap',
          sampled_at: cdata.sampledAt,
          created_at: nowLocal
        });
        climateSampleId = info.lastInsertRowid;
      } else {
        console.error('[GEOTECH] No se pudieron determinar coordenadas para captura de clima.');
      }
    } catch (e) {
      console.error('[GEOTECH] Error en auto-captura de clima:', e);
    }
  }

  const info = db
    .prepare(
      `INSERT INTO geotech_profiles (
        project_id, zone_id, lat, lon, soil_type,
        bearing_capacity_kpa, soil_moisture_index, shear_strength_kpa, water_table_depth_m,
        updated_at, climate_sample_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      projectId,
      d.zoneId ?? null,
      d.lat ?? null,
      d.lon ?? null,
      d.soilType,
      d.bearingCapacityKpa ?? null,
      d.moistureIndex ?? null,
      d.shearStrengthKpa ?? null,
      d.waterTableDepthM ?? null,
      now,
      climateSampleId
    );

  res.json({ id: info.lastInsertRowid, climateSampleId });
});

app.get('/climate', async (req, res) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return res.status(400).json({ error: 'Missing or invalid lat/lon' });
  }

  try {
    const climate = await fetchClimateFromOpenMeteo(lat, lon);
    res.json({
      lat,
      lon,
      climate: {
        precipitation24hMm: climate.precipitation24hMm,
        humidityPct: climate.humidityPct,
        windSpeedMs: climate.windSpeedMs,
      },
      source: climate.source,
    });
  } catch (e) {
    res.status(502).json({ error: 'Climate fetch failed', details: e?.message ?? String(e) });
  }
});

app.post('/risk/evaluate', async (req, res) => {
  const parsed = EvaluateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });
  }

  const { location, soil } = parsed.data;
  let climate = parsed.data.climate;

  if (!isSoilTypeAllowed(soil?.type)) {
    return res.status(400).json({ error: 'Tipo de suelo no permitido' });
  }

  const hasAnyClimate =
    climate &&
    (typeof climate.precipitation24hMm === 'number' ||
      typeof climate.humidityPct === 'number' ||
      typeof climate.windSpeedMs === 'number');

  if (!hasAnyClimate && location?.lat != null && location?.lon != null) {
    try {
      climate = await fetchClimateFromOpenMeteo(location.lat, location.lon);
    } catch {
      climate = climate ?? undefined;
    }
  }

  const result = computeRisk({ soil, climate });

  const now = new Date().toISOString();
  const row = {
    created_at: now,
    lat: location?.lat ?? null,
    lon: location?.lon ?? null,
    soil_type: soil.type,
    bearing_capacity_kpa: soil.bearingCapacityKpa ?? null,
    soil_moisture_index: soil.moistureIndex ?? null,
    shear_strength_kpa: soil.shearStrengthKpa ?? null,
    water_table_depth_m: soil.waterTableDepthM ?? null,
    precipitation_24h_mm: climate?.precipitation24hMm ?? null,
    humidity_pct: climate?.humidityPct ?? null,
    wind_speed_ms: climate?.windSpeedMs ?? null,
    score: result.score,
    risk_level: result.riskLevel,
    probable_cause: result.probableCause,
    recommendation: result.recommendation,
  };

  const info = insertEval.run(row);

  const response = {
    id: info.lastInsertRowid,
    createdAt: now,
    score: result.score,
    riskLevel: result.riskLevel,
    probableCause: result.probableCause,
    recommendation: result.recommendation,
    explanation: result.explanation,
  };

  const projectId = Number(req.query.projectId);
  const zoneId = req.query.zoneId != null ? Number(req.query.zoneId) : null;
  const hasProject = Number.isFinite(projectId);
  const hasZone = zoneId == null ? true : Number.isFinite(zoneId);

  let alertId = null;
  if (hasProject && hasZone && response.riskLevel !== 'BAJO') {
    const aInfo = insertAlert.run({
      project_id: projectId,
      zone_id: zoneId,
      created_at: now,
      score: response.score,
      risk_level: response.riskLevel,
      probable_cause: response.probableCause,
      recommendation: response.recommendation,
      source: 'manual',
    });
    alertId = aInfo.lastInsertRowid;
  }

  const wsPayload = { ...response, alertId, projectId: hasProject ? projectId : null, zoneId: hasZone ? zoneId : null };
  broadcast({ type: 'risk_alert', payload: wsPayload });

  res.json(response);
});

app.get('/risk/history', authRequired, (req, res) => {
  const limit = clamp(Number(req.query.limit ?? 50), 1, 500);

  const riskLevel = String(req.query.riskLevel ?? '').trim();
  const soilType = String(req.query.soilType ?? '').trim();
  const q = String(req.query.q ?? '').trim();
  const from = String(req.query.from ?? '').trim();
  const to = String(req.query.to ?? '').trim();

  const where = [];
  const params = [];

  if (riskLevel) {
    where.push('risk_level = ?');
    params.push(riskLevel);
  }
  if (soilType) {
    where.push('soil_type = ?');
    params.push(soilType);
  }
  if (from) {
    where.push('created_at >= ?');
    params.push(from);
  }
  if (to) {
    where.push('created_at <= ?');
    params.push(to);
  }
  if (q) {
    where.push('(probable_cause LIKE ? OR recommendation LIKE ?)');
    params.push(`%${q}%`, `%${q}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sql = `SELECT id, created_at as createdAt, lat, lon, soil_type as soilType,
                      score, risk_level as riskLevel, probable_cause as probableCause, recommendation
               FROM risk_evaluations
               ${whereSql}
               ORDER BY id DESC
               LIMIT ?`;

  const rows = db.prepare(sql).all(...params, limit);
  res.json({ items: rows });
});

const server = // ─────────────────────────────────────────────
// TELEMETRY & SYSTEM CONTROL
// ─────────────────────────────────────────────

app.get('/admin/telemetry', authRequired, roleRequired(['ADMIN']), (req, res) => {
  const masterStatus = db.prepare("SELECT value FROM global_settings WHERE key = 'sentinel_master_active'").get()?.value;
  const lastHeartbeat = db.prepare("SELECT value FROM global_settings WHERE key = 'sentinel_last_heartbeat'").get()?.value;
  const projectStats = db.prepare("SELECT count(*) as total, sum(sentinel_enabled) as active FROM projects WHERE status = 'ACTIVO'").get();
  const alertStats24h = db.prepare("SELECT count(*) as count FROM alerts WHERE created_at > datetime('now', '-1 day')").get();
  
  res.json({
    masterActive: masterStatus === '1',
    lastHeartbeat,
    monitoredProjects: projectStats.total || 0,
    activeSentinels: projectStats.active || 0,
    alerts24h: alertStats24h.count || 0
  });
});

app.post('/admin/telemetry/toggle-master', authRequired, roleRequired(['ADMIN']), (req, res) => {
  const { active } = req.body;
  db.prepare("UPDATE global_settings SET value = ? WHERE key = 'sentinel_master_active'").run(active ? '1' : '0');
  res.json({ ok: true, masterActive: active });
});

app.get('/admin/rules', authRequired, roleRequired(['ADMIN']), (req, res) => {
  const rules = db.prepare('SELECT * FROM risk_rules ORDER BY id DESC').all();
  res.json({ items: rules });
});

app.post('/admin/rules', authRequired, roleRequired(['ADMIN']), (req, res) => {
  const schema = z.object({
    soilType: z.string(),
    climateVariable: z.enum(['humidity', 'rain', 'wind', 'moisture']),
    operator: z.enum(['>', '<', '>=', '<=']),
    thresholdValue: z.number(),
    resultingRisk: z.enum(['ALTO', 'MEDIO', 'BAJO'])
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Invalid payload', details: parsed.error.issues });

  const d = parsed.data;
  db.prepare(`
    INSERT INTO risk_rules (soil_type, climate_variable, operator, threshold_value, resulting_risk, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(d.soilType, d.climateVariable, d.operator, d.thresholdValue, d.resultingRisk, new Date().toISOString());
  
  res.json({ ok: true });
});

app.delete('/admin/rules/:id', authRequired, roleRequired(['ADMIN']), (req, res) => {
  db.prepare('DELETE FROM risk_rules WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/admin/scan-logs', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const limit = clamp(Number(req.query.limit ?? 50), 1, 1000);
  const rows = db.prepare(`
    SELECT l.*, p.name as projectName 
    FROM scan_logs l
    LEFT JOIN projects p ON l.project_id = p.id
    ORDER BY l.executed_at DESC LIMIT ?
  `).all(limit);
  res.json({ items: rows });
});

app.post('/admin/scan-logs/:id/explain', authRequired, roleRequired(['ADMIN', 'INGENIERO']), async (req, res) => {
  const logId = Number(req.params.id);
  const log = db.prepare(`SELECT * FROM scan_logs WHERE id = ?`).get(logId);
  if (!log) return res.status(404).json({ error: 'Log no encontrado' });

  try {
    const climate = log.climate_snapshot ? JSON.parse(log.climate_snapshot) : {};
    const geotech = log.geotech_snapshot ? JSON.parse(log.geotech_snapshot) : {};

    const prompt = `Actúa como un Ingeniero Geotécnico Experto. Analiza este resultado del Sentinel (Motor de Riesgo).
Veredicto del sistema: ${log.result_level || 'DESCONOCIDO'}
Datos del Clima:
- Lluvia (24h): ${climate.precipitation24hMm || 0}mm
- Humedad Relativa: ${climate.humidityPct || 0}%
- Viento: ${climate.windSpeedMs || 0}m/s

Datos Geotécnicos:
- Tipo de Suelo: ${geotech.type || 'Desconocido'}
- Capacidad Portante: ${geotech.bearingCapacityKpa || 0}kPa
- Índice de Humedad del Suelo (0-1): ${geotech.moistureIndex || 0}
- Resistencia al Corte: ${geotech.shearStrengthKpa || 0}kPa
- Profundidad de la Capa Freática: ${geotech.waterTableDepthM || 0}m

Se requiere: 
1. Un fundamento claro y preciso sobre si el nivel de riesgo asignado tiene sentido físico.
2. Una solución matemática o validación técnica: menciona un límite o umbral (por ejemplo: "Debido a que la precipitación de ${climate.precipitation24hMm || 0}mm es superior a X... y en un suelo tipo ${geotech.type || 'Desconocido'}, el peso unitario se incrementa reduciendo la capacidad portante y el esfuerzo efectivo en Y").
Mantenlo en máximo 2 párrafos altamente profesionales pero claros para el administrador del panel.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer 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',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errTxt = await response.text();
      console.error('OpenRouter Error:', errTxt);
      return res.status(500).json({ error: 'Error del proveedor de IA' });
    }

    const aiData = await response.json();
    const explanation = aiData.choices?.[0]?.message?.content || 'No se pudo generar explicación.';

    res.json({ explanation });
  } catch (err) {
    console.error('Error in /admin/scan-logs/:id/explain:', err);
    res.status(500).json({ error: 'Error interno del servidor al contactar IA' });
  }
});

app.listen(3001, () => {
  console.log('Backend listening on http://localhost:3001');
});

const wss = new WebSocketServer({ server });

function broadcast(message) {
  const data = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
}

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'hello', payload: { ok: true } }));
});

function getLatestGeotechProfile(projectId, zoneId) {
  if (zoneId == null) {
    return db
      .prepare(
        `SELECT soil_type as soilType, bearing_capacity_kpa as bearingCapacityKpa,
                soil_moisture_index as moistureIndex, shear_strength_kpa as shearStrengthKpa,
                water_table_depth_m as waterTableDepthM
         FROM geotech_profiles
         WHERE project_id = ? AND zone_id IS NULL
         ORDER BY id DESC
         LIMIT 1`
      )
      .get(projectId);
  }

  return db
    .prepare(
      `SELECT soil_type as soilType, bearing_capacity_kpa as bearingCapacityKpa,
              soil_moisture_index as moistureIndex, shear_strength_kpa as shearStrengthKpa,
              water_table_depth_m as waterTableDepthM
       FROM geotech_profiles
       WHERE project_id = ? AND zone_id = ?
       ORDER BY id DESC
       LIMIT 1`
    )
    .get(projectId, zoneId);
}

async function evaluateProjectZone({ projectId, zoneId, lat, lon }) {
  const profile = getLatestGeotechProfile(projectId, zoneId);
  if (!profile) return;

  let climate;
  try {
    climate = await fetchClimateFromOpenMeteo(lat, lon);
  } catch {
    return;
  }

  const soil = {
    type: profile.soilType,
    bearingCapacityKpa: profile.bearingCapacityKpa ?? undefined,
    moistureIndex: profile.moistureIndex ?? undefined,
    shearStrengthKpa: profile.shearStrengthKpa ?? undefined,
    waterTableDepthM: profile.waterTableDepthM ?? undefined,
  };

  const result = computeRisk({ soil, climate });

  const now = new Date().toISOString();

  if (result.riskLevel === 'BAJO') {
    return;
  }

  const aInfo = insertAlert.run({
    project_id: projectId,
    zone_id: zoneId,
    created_at: now,
    score: result.score,
    risk_level: result.riskLevel,
    probable_cause: result.probableCause,
    recommendation: result.recommendation,
    source: 'cron',
  });

  const wsPayload = {
    alertId: aInfo.lastInsertRowid,
    projectId,
    zoneId,
    createdAt: now,
    score: result.score,
    riskLevel: result.riskLevel,
    probableCause: result.probableCause,
    recommendation: result.recommendation,
    explanation: result.explanation,
  };

  broadcast({ type: 'risk_alert', payload: wsPayload });
}

async function evaluateProjectZone({ projectId, zoneId, lat, lon }) {
  const profile = getLatestGeotechProfile(projectId, zoneId);
  if (!profile) return;

  let climate;
  let now = new Date().toISOString();
  try {
    climate = await fetchClimateFromOpenMeteo(lat, lon);
  } catch (err) {
    db.prepare(`INSERT INTO scan_logs (project_id, zone_id, executed_at, success, error_message) VALUES (?, ?, ?, 0, ?)`).run(projectId, zoneId, now, err.message);
    return;
  }

  const soil = {
    type: profile.soilType,
    bearingCapacityKpa: profile.bearingCapacityKpa ?? undefined,
    moistureIndex: profile.moistureIndex ?? undefined,
    shearStrengthKpa: profile.shearStrengthKpa ?? undefined,
    waterTableDepthM: profile.waterTableDepthM ?? undefined,
  };

  const result = computeRisk({ soil, climate });

  // Log de ejecución
  db.prepare(`
    INSERT INTO scan_logs (project_id, zone_id, executed_at, climate_snapshot, geotech_snapshot, result_level, success) 
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `).run(projectId, zoneId, now, JSON.stringify(climate), JSON.stringify(soil), result.riskLevel);

  if (result.riskLevel === 'BAJO') {
    return;
  }

  const aInfo = insertAlert.run({
    project_id: projectId,
    zone_id: zoneId,
    created_at: now,
    score: result.score,
    risk_level: result.riskLevel,
    probable_cause: result.probableCause,
    recommendation: result.recommendation,
    source: 'sentinel',
  });

  const wsPayload = {
    alertId: aInfo.lastInsertRowid,
    projectId,
    zoneId,
    createdAt: now,
    score: result.score,
    riskLevel: result.riskLevel,
    probableCause: result.probableCause,
    recommendation: result.recommendation,
    explanation: result.explanation,
  };

  broadcast({ type: 'risk_alert', payload: wsPayload });
}

let cronRunning = false;
async function cronTick() {
  if (cronRunning) return;
  
  // 1. Verificar Master Kill Switch
  const masterStatus = db.prepare("SELECT value FROM global_settings WHERE key = 'sentinel_master_active'").get()?.value;
  if (masterStatus !== '1') return;

  cronRunning = true;
  db.prepare("UPDATE global_settings SET value = ? WHERE key = 'sentinel_last_heartbeat'").run(new Date().toISOString());

  try {
    // 2. Proyectos con sentinel activado
    const projects = db
      .prepare(`SELECT id, lat, lon, scan_frequency_minutes, last_scan_at FROM projects WHERE status = 'ACTIVO' AND sentinel_enabled = 1 ORDER BY id ASC`)
      .all();

    const nowTime = Date.now();
    for (const p of projects) {
      // 3. Respetar frecuencia
      const lastScan = p.last_scan_at ? new Date(p.last_scan_at).getTime() : 0;
      const freqMs = (p.scan_frequency_minutes || 60) * 60 * 1000;
      if (nowTime - lastScan < freqMs) continue;

      let climate = null;
      try {
        climate = await fetchClimateFromOpenMeteo(p.lat, p.lon);
        const now = new Date().toISOString();
        insertClimateSample.run({
          project_id: p.id,
          lat: p.lat,
          lon: p.lon,
          precipitation_24h_mm: climate?.precipitation24hMm ?? null,
          humidity_pct: climate?.humidityPct ?? null,
          wind_speed_ms: climate?.windSpeedMs ?? null,
          source: climate?.source ?? 'open-meteo',
          sampled_at: now,
          created_at: now,
        });
        db.prepare("UPDATE projects SET last_scan_at = ? WHERE id = ?").run(now, p.id);
      } catch {
        // ignore climate fetch failures for cron continuity
      }

      const zones = db.prepare('SELECT id FROM zones WHERE project_id = ? ORDER BY id ASC').all(p.id);
      for (const z of zones) {
        await evaluateProjectZone({ projectId: p.id, zoneId: z.id, lat: p.lat, lon: p.lon });
      }
    }
  } catch (err) {
    console.error('[SENTINEL] Error en CronTick:', err);
  } finally {
    cronRunning = false;
  }
}

// ─────────────────────────────────────────────
// CHAT IA — Ollama RAG endpoint
// ─────────────────────────────────────────────
const OLLAMA_BASE = process.env.OLLAMA_BASE || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

function buildSystemContext() {
  const now = new Date().toISOString();

  // Projects
  const projects = db.prepare(`
    SELECT id, name, status, lat, lon,
           planned_budget as plannedBudget,
           planned_start as plannedStart,
           planned_end as plannedEnd,
           baseline_start_at as baselineStartAt,
           created_at as createdAt
    FROM projects ORDER BY id ASC
  `).all();

  // Alerts (last 50 unresolved first, then resolved)
  const alerts = db.prepare(`
    SELECT a.id, a.project_id as projectId, a.zone_id as zoneId,
           a.created_at as createdAt,
           a.score, a.risk_level as riskLevel,
           a.probable_cause as probableCause,
           a.recommendation,
           a.acknowledged_at as acknowledgedAt,
           a.resolved_at as resolvedAt,
           p.name as projectName
    FROM alerts a
    LEFT JOIN projects p ON p.id = a.project_id
    ORDER BY a.id DESC LIMIT 50
  `).all();

  // Geotech profiles (active only)
  const geotech = db.prepare(`
    SELECT g.id, g.project_id as projectId, g.zone_id as zoneId,
           g.soil_type as soilType,
           g.bearing_capacity_kpa as bearingCapacityKpa,
           g.soil_moisture_index as soilMoistureIndex,
           g.shear_strength_kpa as shearStrengthKpa,
           g.water_table_depth_m as waterTableDepthM,
           g.updated_at as updatedAt,
           p.name as projectName
    FROM geotech_profiles g
    LEFT JOIN projects p ON p.id = g.project_id
    WHERE g.archived_at IS NULL
    ORDER BY g.id DESC LIMIT 100
  `).all();

  // Activities (last 100)
  const activities = db.prepare(`
    SELECT a.id, a.project_id as projectId, a.name,
           a.status, a.progress_pct as progressPct,
           a.planned_start as plannedStart,
           a.planned_end as plannedEnd,
           a.actual_start as actualStart,
           a.actual_end as actualEnd,
           a.notes, a.updated_at as updatedAt,
           p.name as projectName
    FROM project_activities a
    LEFT JOIN projects p ON p.id = a.project_id
    ORDER BY a.id DESC LIMIT 100
  `).all();

  // Zones
  const zones = db.prepare(`
    SELECT z.id, z.project_id as projectId, z.name, z.created_at as createdAt,
           p.name as projectName
    FROM zones z
    LEFT JOIN projects p ON p.id = z.project_id
    ORDER BY z.id ASC
  `).all();

  // Users (no passwords)
  const users = db.prepare(`
    SELECT id, email, role, created_at as createdAt FROM users ORDER BY id ASC
  `).all();

  // Risk evaluations (last 20)
  const risks = db.prepare(`
    SELECT id, created_at as createdAt, soil_type as soilType,
           score, risk_level as riskLevel,
           probable_cause as probableCause, recommendation,
           lat, lon
    FROM risk_evaluations ORDER BY id DESC LIMIT 20
  `).all();

  // Stats
  const activeProjects = projects.filter(p => p.status === 'ACTIVO').length;
  const criticalAlerts = alerts.filter(a => a.riskLevel === 'CRÍTICO' && !a.resolvedAt).length;
  const highAlerts = alerts.filter(a => a.riskLevel === 'ALTO' && !a.resolvedAt).length;
  const unresolvedAlerts = alerts.filter(a => !a.resolvedAt).length;

  return `Eres LORE-IA, un asistente de inteligencia geotécnica integrado al sistema de gestión de proyectos.
Fecha y hora actual: ${now}

INSTRUCCIONES DE FORMATO:
- Responde siempre en ESPAÑOL de forma concisa.
- PROHIBIDO USAR FORMATO MARKDOWN: No uses asteriscos (** o *) para negritas o listas.
- Para listas usa guiones simples (-) o números (1, 2, 3).
- Para títulos o énfasis usa MAYÚSCULAS o simplemente texto plano claro.
- Solo debes responder con información REAL que esté en el sistema. No inventes datos. Si no tienes la información, dilo claramente.

=== RESUMEN DEL SISTEMA ===
- Proyectos totales: ${projects.length} (${activeProjects} activos)
- Alertas no resueltas: ${unresolvedAlerts} (${criticalAlerts} críticas, ${highAlerts} altas)
- Perfiles geotécnicos activos: ${geotech.length}
- Actividades registradas: ${activities.length}
- Zonas configuradas: ${zones.length}
- Usuarios del sistema: ${users.length}

=== PROYECTOS ===
${projects.map(p => `[ID:${p.id}] "${p.name}" | Estado: ${p.status} | Coords: ${p.lat?.toFixed(4)}, ${p.lon?.toFixed(4)} | Presupuesto: ${p.plannedBudget ? `S/.${p.plannedBudget.toLocaleString()}` : 'No definido'} | Inicio: ${p.plannedStart || 'N/A'} | Fin: ${p.plannedEnd || 'N/A'} | Creado: ${p.createdAt}`).join('\n')}

=== ALERTAS (últimas 50) ===
${alerts.length === 0 ? 'Sin alertas registradas.' : alerts.map(a => `[ID:${a.id}] Proyecto: "${a.projectName}" | Riesgo: ${a.riskLevel} | Score: ${a.score?.toFixed(1)} | Causa: ${a.probableCause} | Recomendación: ${a.recommendation} | ${a.resolvedAt ? `RESUELTA: ${a.resolvedAt}` : a.acknowledgedAt ? `Reconocida: ${a.acknowledgedAt}` : 'PENDIENTE'} | Creada: ${a.createdAt}`).join('\n')}

=== PERFILES GEOTÉCNICOS ACTIVOS ===
${geotech.length === 0 ? 'Sin perfiles activos.' : geotech.map(g => `[ID:${g.id}] Proyecto: "${g.projectName}" | Suelo: ${g.soilType} | Capacidad portante: ${g.bearingCapacityKpa ?? 'N/A'} kPa | Humedad: ${g.soilMoistureIndex ?? 'N/A'} | Cortante: ${g.shearStrengthKpa ?? 'N/A'} kPa | NF: ${g.waterTableDepthM ?? 'N/A'} m | Actualizado: ${g.updatedAt}`).join('\n')}

=== ACTIVIDADES ===
${activities.length === 0 ? 'Sin actividades.' : activities.map(a => `[ID:${a.id}] Proyecto: "${a.projectName}" | "${a.name}" | Estado: ${a.status} | Progreso: ${a.progressPct ?? 0}% | Inicio: ${a.plannedStart || 'N/A'} | Fin: ${a.plannedEnd || 'N/A'} | Notas: ${a.notes || 'Sin notas'}`).join('\n')}

=== ZONAS ===
${zones.length === 0 ? 'Sin zonas.' : zones.map(z => `[ID:${z.id}] Proyecto: "${z.projectName}" | Zona: "${z.name}" | Creada: ${z.createdAt}`).join('\n')}

=== USUARIOS DEL SISTEMA ===
${users.map(u => `[ID:${u.id}] ${u.email} | Rol: ${u.role} | Desde: ${u.createdAt}`).join('\n')}

=== EVALUACIONES DE RIESGO RECIENTES ===
${risks.length === 0 ? 'Sin evaluaciones recientes.' : risks.map(r => `[ID:${r.id}] ${r.createdAt} | Tipo suelo: ${r.soilType} | Score: ${r.score?.toFixed(1)} | Nivel: ${r.riskLevel} | Causa: ${r.probableCause}`).join('\n')}`;
}

app.post('/chat', authRequired, async (req, res) => {
  console.log('[CHAT] Nuevo mensaje recibido');
  const { message, history = [], model, sessionId } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message requerido' });
  }

  const orModel = (typeof model === 'string' && model.trim()) ? model.trim() : 'openai/gpt-4o-mini';
  console.log(`[CHAT] Usando modelo OpenRouter: ${orModel}`);

  // Save user message to DB if sessionId is present
  if (sessionId) {
    try {
      // Verify session ownership
      const session = db.prepare('SELECT id FROM chat_sessions WHERE id = ? AND user_id = ?').get(sessionId, req.user.sub);
      if (session) {
        db.prepare('INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)')
          .run(sessionId, 'user', message, new Date().toISOString());

        // Update session title if it's the first message
        const msgCount = db.prepare('SELECT COUNT(*) as count FROM chat_messages WHERE session_id = ?').get(sessionId).count;
        if (msgCount <= 2) {
          const snippet = message.substring(0, 40) + (message.length > 40 ? '...' : '');
          db.prepare('UPDATE chat_sessions SET title = ? WHERE id = ?').run(snippet, sessionId);
        }
      } else {
        console.warn(`[CHAT] Intento de acceso a sesión no autorizada: sub=${req.user.sub} sessionId=${sessionId}`);
      }
    } catch (err) {
      console.error('[CHAT] Error guardando mensaje de usuario:', err);
    }
  }

  const systemContext = buildSystemContext();
  console.log('[CHAT] Contexto del sistema generado');
  const messages = [
    { role: 'system', content: systemContext },
    ...(Array.isArray(history) ? history.slice(-20) : []),
    { role: 'user', content: message },
  ];

  // Set up SSE streaming
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let fullResponse = '';

  try {
    console.log(`[CHAT] Llamando a OpenRouter...`);
    const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 
        'Authorization': 'Bearer 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',
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({
        model: orModel,
        messages,
        stream: true,
        temperature: 0.2,
        max_tokens: 1024,
      }),
    });

    if (!orRes.ok) {
      const errText = await orRes.text();
      console.error(`[CHAT] Error de OpenRouter: ${errText}`);
      res.write(`data: ${JSON.stringify({ error: `OpenRouter error: ${errText}` })}\n\n`);
      return res.end();
    }

    console.log('[CHAT] OpenRouter respondió, iniciando streaming...');
    const reader = orRes.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log('[CHAT] Streaming completado');
        if (sessionId) {
          db.prepare('INSERT INTO chat_messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)')
            .run(sessionId, 'assistant', fullResponse, new Date().toISOString());
        }
        res.write(`data: {"done": true}\n\n`);
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (let line of lines) {
        line = line.trim();
        if (!line || line === 'data: [DONE]') continue;
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6));
            const contentChunk = json.choices?.[0]?.delta?.content || '';
            if (contentChunk) {
              fullResponse += contentChunk;
              // Simulamos el mismo JSON que usábamos con Ollama para no romper el frontend
              res.write(`data: ${JSON.stringify({ token: contentChunk })}\n\n`);
            }
          } catch (e) {
            // Ignorar líneas malformadas
          }
        }
      }
    }

    res.end();
  } catch (err) {
    console.error(`[CHAT] Error en el túnel a OpenRouter: ${err.message}`);
    res.write(`data: ${JSON.stringify({ error: `Error conectando con OpenRouter: ${err.message}` })}\n\n`);
    res.end();
  }
});

app.get('/chat/status', authRequired, async (req, res) => {
  return res.json({ 
    available: true, 
    models: ['openai/gpt-4o-mini', 'google/gemini-flash-1.5', 'anthropic/claude-3-haiku'] 
  });
});

app.post('/admin/ollama/start', authRequired, roleRequired(['ADMIN', 'INGENIERO']), (req, res) => {
  const { spawn } = require('child_process');
  console.log('[OLLAMA] Intentando iniciar servicio...');

  try {
    // Usar cmd /c para Windows para que el proceso se desvincule bien
    const proc = spawn('cmd', ['/c', 'start', 'ollama', 'serve'], {
      detached: true,
      stdio: 'ignore'
    });
    proc.unref();

    console.log('[OLLAMA] Proceso invocado');
    res.json({ success: true, message: 'Intentando iniciar Ollama en una nueva ventana...' });
  } catch (err) {
    console.error(`[OLLAMA] Fallo al iniciar: ${err.message}`);
    res.status(500).json({ error: 'Error al intentar iniciar Ollama', details: err.message });
  }
});

// ─────────────────────────────────────────────
// CHAT PERSISTENCE — Session Management
// ─────────────────────────────────────────────

// List all sessions for current user
app.get('/chat/sessions', authRequired, (req, res) => {
  try {
    const sessions = db.prepare(`
      SELECT s.*, 
             (SELECT content FROM chat_messages WHERE session_id = s.id ORDER BY id ASC LIMIT 1) as first_msg
      FROM chat_sessions s
      WHERE s.user_id = ?
      ORDER BY s.created_at DESC
    `).all(req.user.sub);
    res.json(sessions);
  } catch (err) {
    console.error('[CHAT] Error al cargar sesiones:', err);
    res.status(500).json({ error: 'Error al cargar sesiones' });
  }
});

// Get messages for a session
app.get('/chat/sessions/:id', authRequired, (req, res) => {
  try {
    const session = db.prepare('SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?').get(req.params.id, req.user.sub);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const messages = db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY id ASC').all(req.params.id);
    res.json({ session, messages });
  } catch (err) {
    console.error('[CHAT] Error al cargar mensajes:', err);
    res.status(500).json({ error: 'Error al cargar mensajes' });
  }
});

// Create new session
app.post('/chat/sessions', authRequired, (req, res) => {
  const { title } = req.body;
  try {
    const result = db.prepare(`
      INSERT INTO chat_sessions (user_id, title, created_at)
      VALUES (?, ?, ?)
    `).run(req.user.sub, title || 'Nueva Conversación', new Date().toISOString());

    res.json({ id: result.lastInsertRowid, title: title || 'Nueva Conversación' });
  } catch (err) {
    console.error('[CHAT] Error al crear sesión:', err);
    res.status(500).json({ error: 'Error al crear sesión' });
  }
});

// Delete session
app.delete('/chat/sessions/:id', authRequired, (req, res) => {
  try {
    const result = db.prepare('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?').run(req.params.id, req.user.sub);
    if (result.changes === 0) return res.status(404).json({ error: 'Sesión no encontrada' });
    res.json({ success: true });
  } catch (err) {
    console.error('[CHAT] Error al borrar sesión:', err);
    res.status(500).json({ error: 'Error al borrar sesión' });
  }
});

const CRON_INTERVAL_MS = Number(process.env.CRON_INTERVAL_MS ?? 10 * 60 * 1000);
setInterval(() => {
  cronTick();
}, CRON_INTERVAL_MS);

cronTick();
