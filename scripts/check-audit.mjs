#!/usr/bin/env node
// Falla si `npm audit` encuentra vulnerabilidades de severidad alta o crítica que no estén en
// la lista de excepciones de la app (audit-allowlist.json). Cada excepción lleva motivo y fecha
// de vencimiento: al vencer, vuelve a fallar para obligar a revisarla (COPAYNI-9).
//
// Uso (desde la carpeta de la app): node ../../scripts/check-audit.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const BLOCKING = new Set(['high', 'critical']);
const today = new Date().toISOString().slice(0, 10);

const allowlist = existsSync('audit-allowlist.json')
  ? JSON.parse(readFileSync('audit-allowlist.json', 'utf8'))
  : [];

let report;
try {
  report = execFileSync('npm', ['audit', '--json'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
} catch (error) {
  // npm audit sale con código 1 cuando encuentra vulnerabilidades; el JSON sigue en stdout.
  report = error.stdout;
}
const { vulnerabilities = {} } = JSON.parse(report);

const advisories = new Map();
for (const { via } of Object.values(vulnerabilities)) {
  for (const advisory of via) {
    if (typeof advisory === 'object' && BLOCKING.has(advisory.severity)) {
      const id = advisory.url.split('/').pop();
      advisories.set(id, `${advisory.name} (${advisory.severity}): ${advisory.title}`);
    }
  }
}

const problems = [];
for (const [id, description] of advisories) {
  const exception = allowlist.find((entry) => entry.id === id);
  if (!exception) problems.push(`${id} ${description}`);
  else if (exception.expires < today) problems.push(`${id} excepción vencida el ${exception.expires}`);
  else console.log(`Excepción vigente hasta ${exception.expires}: ${id} ${description}`);
}

if (problems.length > 0) {
  console.error(`Vulnerabilidades sin resolver:\n${problems.map((p) => `- ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('Sin vulnerabilidades altas o críticas pendientes.');
