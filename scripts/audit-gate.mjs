// Gate de dependências do CI (SCA): falha em qualquer vulnerabilidade high ou
// critical do `npm audit`, exceto as exceções explícitas abaixo — cada uma com
// motivo e validade. Exceção vencida volta a bloquear; alerta novo bloqueia.
//
// Uso: `node scripts/audit-gate.mjs` (no CI, depois do `npm ci`).
// Teste local de validade: `AUDIT_GATE_TODAY=2027-01-01 node scripts/audit-gate.mjs`.
import { execFileSync } from 'node:child_process';

const EXCEPTIONS = [
  {
    advisory: 'GHSA-fc5q-39xc-vjpf', // picomatch <= 4.0.7: ReDoS com extglobs repetidos
    reason:
      'só tooling de desenvolvimento (vitest/vite/tinyglobby, node-gyp/re2 do firebase-tools); ' +
      'nenhum glob vem de entrada não confiável; nada vai para o app; sem versão corrigida ' +
      'publicada em 2026-11-17 (o "fix" do npm rebaixaria o vitest de 5 para 3)',
    until: '2026-12-31',
  },
];

function runAudit() {
  try {
    return execFileSync('npm', ['audit', '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // npm audit sai com código != 0 quando encontra vulnerabilidades; o JSON vem no stdout.
    if (e.stdout) return e.stdout;
    throw e;
  }
}

const report = JSON.parse(runAudit());
if (report.error) {
  console.error(`npm audit falhou: ${report.error.summary ?? report.error.code}`);
  process.exit(2);
}

const today = process.env.AUDIT_GATE_TODAY ?? new Date().toISOString().slice(0, 10);
const active = new Map(EXCEPTIONS.filter((x) => x.until >= today).map((x) => [x.advisory, x]));
const blocking = new Map();
const waived = new Map();

for (const [pkg, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  for (const via of vuln.via ?? []) {
    // Entradas string apontam para outro pacote; a gravidade real vem do alerta (objeto).
    if (typeof via !== 'object' || !['high', 'critical'].includes(via.severity)) continue;
    const id = String(via.url ?? via.source ?? '').split('/').pop();
    const line = `${via.severity} ${pkg}: ${via.title} (${via.url ?? via.source})`;
    (active.has(id) ? waived : blocking).set(`${id} ${pkg}`, { id, line });
  }
}

for (const { id, line } of waived.values()) {
  console.log(`exceção aceita até ${active.get(id).until}: ${line}`);
}
if (blocking.size > 0) {
  for (const { line } of blocking.values()) console.error(`BLOQUEIA: ${line}`);
  process.exit(1);
}
const counts = report.metadata?.vulnerabilities ?? {};
console.log(`ok: nenhuma vulnerabilidade high/critical fora das exceções (moderate: ${counts.moderate ?? 0})`);
