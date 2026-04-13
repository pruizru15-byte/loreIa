const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function main() {
  const projectId = Number(process.argv[2]);
  if (!Number.isFinite(projectId)) {
    console.error('Usage: node scripts/create_test_alert.js <projectId> [riskLevel]');
    process.exit(1);
  }

  const riskLevel = process.argv[3] || 'ALTO';

  const token = process.env.GEOTECH_TOKEN;
  if (!token) {
    console.error('Missing GEOTECH_TOKEN env var. Example (PowerShell):');
    console.error("  $env:GEOTECH_TOKEN='PASTE_TOKEN_HERE'\n  node scripts/create_test_alert.js 25 ALTO");
    process.exit(1);
  }

  const res = await fetch(`${API_BASE}/debug/projects/${projectId}/alerts/create`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ riskLevel }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error('Request failed:', res.status, text);
    process.exit(1);
  }

  console.log(text);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
