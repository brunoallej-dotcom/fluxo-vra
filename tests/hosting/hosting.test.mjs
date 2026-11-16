// Testes da configuração do Firebase Hosting (docs/specs/hospedagem.md).
// Rodam contra o Hosting Emulator: `npm run test:hosting`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = `http://${process.env.FIREBASE_HOSTING_EMULATOR_HOST ?? '127.0.0.1:5000'}`;

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  return { status: res.status, headers: res.headers, body: await res.text() };
}

test('H01 serve o app na raiz', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.match(r.body, /<title>Fluxo — Dashboard de Produtividade<\/title>/);
});

test('H02 cabeçalhos de segurança obrigatórios (AISAC)', async () => {
  const { headers } = await get('/');
  assert.match(headers.get('strict-transport-security') ?? '', /max-age=63072000; includeSubDomains/);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.match(headers.get('permissions-policy') ?? '', /camera=\(\)/);
});

test('H03 CSP aplicada só com diretivas que não quebram o app; CSP rígida em Report-Only', async () => {
  const { headers } = await get('/');
  const enforced = headers.get('content-security-policy') ?? '';
  assert.match(enforced, /frame-ancestors 'none'/);
  assert.match(enforced, /object-src 'none'/);
  assert.doesNotMatch(enforced, /script-src/); // a rígida ainda quebraria os handlers inline
  const reportOnly = headers.get('content-security-policy-report-only') ?? '';
  assert.match(reportOnly, /script-src 'self' https:\/\/cdnjs\.cloudflare\.com https:\/\/www\.gstatic\.com;/);
  assert.doesNotMatch(reportOnly, /script-src[^;]*'unsafe-inline'/);
});

test('H04 index.html sem cache (deploys novos chegam na hora)', async () => {
  for (const path of ['/', '/index.html']) {
    const { headers } = await get(path);
    assert.equal(headers.get('cache-control'), 'no-cache', path);
  }
});

test('H05 deny by default: nada fora de public/ é servido', async () => {
  const forbidden = [
    '/package.json', '/firebase.json', '/firestore.rules', '/.firebaserc', '/.gitleaks.toml',
    '/AGENTS.md', '/NOTES.md', '/docs/specs/autenticacao-multiusuario.md',
    '/contracts/openapi.v1.yaml', '/tests/fixtures/users.json', '/backups/', '/.env.example',
    '/.claude/settings.json', '/scripts/check-inline-js.mjs',
  ];
  for (const path of forbidden) {
    const { status } = await get(path);
    assert.equal(status, 404, `${path} deveria dar 404 e deu ${status}`);
  }
});
