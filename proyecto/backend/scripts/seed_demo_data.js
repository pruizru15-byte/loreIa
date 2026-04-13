const Database = require('better-sqlite3');
const db = new Database('data.sqlite');

const P1_ID = 1;

// Set baseline to 15 days ago for project 1
const baselineDateStr = new Date(Date.now() - 15 * 86400000).toISOString();
db.prepare("UPDATE projects SET baseline_start_at = ? WHERE id = ?").run(baselineDateStr, P1_ID);

function rnd(min, max) {
  return Math.random() * (max - min) + min;
}

const insertAlert = db.prepare(`
  INSERT INTO alerts (
    project_id, created_at, score, risk_level, probable_cause, recommendation, source,
    acknowledged_at, acknowledged_by, resolved_at, response_action, response_at, response_by
  ) VALUES (
    ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 1
  );
`);

console.log('Borrando alertas antiguas del proy 1...');
db.prepare('DELETE FROM alerts WHERE project_id = ?').run(P1_ID);
db.prepare("DELETE FROM project_events WHERE project_id = ? AND type='PARALIZACION'").run(P1_ID);

// GENERAR DATOS PRE (Sin LORE-IA): 60 días antes del baseline hasta el baseline
const preStart = new Date(Date.now() - 75 * 86400000).getTime();
const preEnd = new Date(baselineDateStr).getTime();

// PRE: 55 alertas
for (let i = 0; i < 55; i++) {
  const ts = rnd(preStart, preEnd);
  const created = new Date(ts).toISOString();
  
  // PRE era ineficiente: Alto/Crítico, pocos ack, acciones lentas
  const isAck = Math.random() > 0.4; // 60% ack
  const isResp = isAck && Math.random() > 0.6; // 24% resp
  
  const score = rnd(50, 100);
  let risk = 'MEDIO';
  if (score > 85) risk = 'CRÍTICO';
  else if (score > 65) risk = 'ALTO';
  
  let ackAt = null, respAt = null, resvAt = null, act = null;
  
  if (isAck) {
    const delayMins = rnd(60, 300); // Tardan de 1 a 5 horas en reconocer
    ackAt = new Date(ts + delayMins * 60000).toISOString();
  }
  
  if (isResp) {
    const delayMins = rnd(180, 720); // Tardan de 3 a 12 horas en responder
    respAt = new Date(new Date(ackAt || created).getTime() + delayMins * 60000).toISOString();
    resvAt = new Date(new Date(respAt).getTime() + rnd(120, 400) * 60000).toISOString();
    act = 'Acción de control manual (Tardía)';
  }
  
  insertAlert.run(
    P1_ID, created, score, risk, 'Condiciones reportadas (PRE)', 'Recomendación estándar', 'manual_import',
    ackAt, resvAt, act, respAt
  );
}

// Eventos PRE de paralización: largos
const insertEvent = db.prepare(`
  INSERT INTO project_events (project_id, type, started_at, ended_at, notes, created_by, created_at)
  VALUES (?, 'PARALIZACION', ?, ?, 'Paralización PRE por contingencia', 1, ?)
`);
for (let i = 0; i < 3; i++) {
  const ts1 = rnd(preStart, preEnd - 86400000 * 2);
  const ts2 = ts1 + rnd(5, 12) * 3600000; // 5 a 12 horas
  insertEvent.run(P1_ID, new Date(ts1).toISOString(), new Date(ts2).toISOString(), new Date(ts1).toISOString());
}

// GENERAR DATOS POST (Con LORE-IA): Desde el baseline hasta hoy
const postStart = new Date(baselineDateStr).getTime();
const postEnd = Date.now();

// POST: 32 alertas
for (let i = 0; i < 32; i++) {
  const ts = rnd(postStart, postEnd);
  const created = new Date(ts).toISOString();
  
  // POST es eficiente: Mayormente Bajo/Medio, casi 100% ack, acciones rapidas
  const isAck = Math.random() > 0.05; // 95% ack
  const isResp = isAck && Math.random() > 0.05; // ~90% resp
  
  const score = rnd(20, 75);
  let risk = 'BAJO';
  if (score > 60) risk = 'ALTO';
  else if (score > 40) risk = 'MEDIO';
  
  let ackAt = null, respAt = null, resvAt = null, act = null;
  
  if (isAck) {
    const delayMins = rnd(1, 15); // Tardan 1 a 15 mins en reconocer (LORE-IA)
    ackAt = new Date(ts + delayMins * 60000).toISOString();
  }
  
  if (isResp) {
    const delayMins = rnd(10, 45); // Tardan 10 a 45 mins en responder (Eficiente)
    respAt = new Date(new Date(ackAt || created).getTime() + delayMins * 60000).toISOString();
    resvAt = new Date(new Date(respAt).getTime() + rnd(60, 120) * 60000).toISOString();
    act = 'Acción proactiva sugerida por LORE-IA';
  }
  
  insertAlert.run(
    P1_ID, created, score, risk, 'Saturación inicial / Detección temprana', 'Drenaje proactivo', 'LORE-IA Engine',
    ackAt, resvAt, act, respAt
  );
}

// Eventos POST de paralización: rápidos (preventivos)
for (let i = 0; i < 2; i++) {
  const ts1 = rnd(postStart, postEnd - 86400000 * 2);
  const ts2 = ts1 + rnd(0.5, 2.5) * 3600000; // 0.5 a 2.5 horas
  insertEvent.run(P1_ID, new Date(ts1).toISOString(), new Date(ts2).toISOString(), new Date(ts1).toISOString());
}

console.log('Datos demo insertados correctamente para el Proyecto 1 (Línea base ajustada).');
