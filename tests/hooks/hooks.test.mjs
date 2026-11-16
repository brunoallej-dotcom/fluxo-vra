// Testes de regressão dos hooks do Claude Code (.claude/hooks/).
// Rodam com o test runner nativo do Node: `npm run test:hooks`.
// Nenhum arquivo real de segredo é lido: os hooks recebem só entradas simuladas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const HOOKS = join(process.cwd(), '.claude/hooks');

// Dados de teste montados em partes para não disparar o próprio protect-secrets ao editar este arquivo.
const KEY = ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' ');
const SA_JSON = '{"private' + '_key": "-----BEGIN';
const ENV = '.env';

function run(hook, payload) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const r = spawnSync(process.execPath, [join(HOOKS, hook)], { input, encoding: 'utf8' });
  assert.equal(r.status, 0, `${hook} saiu com código ${r.status}: ${r.stderr}`);
  if (!r.stdout) return 'allow';
  const out = JSON.parse(r.stdout);
  return out.hookSpecificOutput?.permissionDecision ?? out.decision;
}

const bash = (command) => ({ tool_name: 'Bash', tool_input: { command } });
const read = (file_path) => ({ tool_name: 'Read', tool_input: { file_path } });
const mcp = (name) => ({ tool_name: `mcp__firebase__${name}` });

const protectCases = [
  ['Read .env.local', read(`/x/${ENV}.local`), 'deny'],
  ['Read .env', read(`/x/${ENV}`), 'deny'],
  ['Edit .env.production', { tool_name: 'Edit', tool_input: { file_path: `/x/${ENV}.production`, new_string: 'a' } }, 'deny'],
  ['Read .env.example', read(`/x/${ENV}.example`), 'allow'],
  ['Read chave adminsdk', read('/x/fluxo-firebase-adminsdk-ab12.json'), 'deny'],
  ['Read token do firebase login', read('/home/u/.config/configstore/firebase-tools.json'), 'deny'],
  ['Read index.html', read('/x/index.html'), 'allow'],
  ['Write com chave privada', { tool_name: 'Write', tool_input: { file_path: '/x/a.js', content: `${KEY}\nabc` } }, 'deny'],
  ['MultiEdit com private_key de SA', { tool_name: 'MultiEdit', tool_input: { file_path: '/x/a.json', edits: [{ new_string: SA_JSON }] } }, 'deny'],
  ['Write normal', { tool_name: 'Write', tool_input: { file_path: '/x/a.js', content: 'const a = 1;' } }, 'allow'],
  ['Bash cat .env.local', bash(`cat ${ENV}.local`), 'deny'],
  ['Bash grep em ./.env', bash(`grep KEY ./${ENV}`), 'deny'],
  ['Bash git show HEAD:.env', bash(`git show HEAD:${ENV}`), 'deny'],
  ['Bash node -e readFileSync(.env)', bash(`node -e "require('fs').readFileSync('${ENV}')"`), 'deny'],
  ['Bash cat token do firebase login', bash('cat ~/.config/configstore/firebase-tools.json'), 'deny'],
  ['Bash cp chave adminsdk', bash('cp fluxo-firebase-adminsdk-x.json /tmp/'), 'deny'],
  ['Bash cat .env.example', bash(`cat ${ENV}.example`), 'allow'],
  ['Bash source venv/bin/activate', bash('source venv/bin/activate'), 'allow'],
  ['Bash npm run test:rules', bash('npm run test:rules'), 'allow'],
  ['Bash git status', bash('git status'), 'allow'],
  ['entrada inválida (falha fechada)', 'nao-e-json', 'ask'],
];

const guardCases = [
  ['firestore_delete_document', mcp('firestore_delete_document'), 'ask'],
  ['firestore_update_document', mcp('firestore_update_document'), 'ask'],
  ['firestore_add_document', mcp('firestore_add_document'), 'ask'],
  ['firestore_delete_database', mcp('firestore_delete_database'), 'ask'],
  ['firebase_deploy', mcp('firebase_deploy'), 'ask'],
  ['auth_update_user', mcp('auth_update_user'), 'ask'],
  ['auth_set_sms_region_policy', mcp('auth_set_sms_region_policy'), 'ask'],
  ['tool desconhecida auth_revoke_tokens', mcp('auth_revoke_tokens'), 'ask'],
  ['auth_get_users (PII)', mcp('auth_get_users'), 'ask'],
  ['firestore_get_document', mcp('firestore_get_document'), 'allow'],
  ['firestore_list_documents', mcp('firestore_list_documents'), 'allow'],
  ['firestore_query_collection', mcp('firestore_query_collection'), 'allow'],
  ['firestore_run_aggregation_query', mcp('firestore_run_aggregation_query'), 'allow'],
  ['firebase_get_security_rules', mcp('firebase_get_security_rules'), 'allow'],
  ['firebase_validate_security_rules', mcp('firebase_validate_security_rules'), 'allow'],
  ['firebase_update_environment (só config local)', mcp('firebase_update_environment'), 'allow'],
  ['entrada inválida', 'nao-e-json', 'ask'],
];

for (const [label, payload, expected] of protectCases) {
  test(`protect-secrets: ${label} → ${expected}`, () => {
    assert.equal(run('protect-secrets.mjs', payload), expected);
  });
}

for (const [label, payload, expected] of guardCases) {
  test(`firebase-mcp-guard: ${label} → ${expected}`, () => {
    assert.equal(run('firebase-mcp-guard.mjs', payload), expected);
  });
}

test('validate-edit: JSON válido passa, JSON quebrado bloqueia', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fluxo-hooktest-'));
  const ok = join(dir, 'ok.json');
  const bad = join(dir, 'bad.json');
  writeFileSync(ok, '{"a": 1}');
  writeFileSync(bad, '{"a": 1,}');
  assert.equal(run('validate-edit.mjs', { tool_name: 'Write', tool_input: { file_path: ok } }), 'allow');
  assert.equal(run('validate-edit.mjs', { tool_name: 'Edit', tool_input: { file_path: bad } }), 'block');
});

test('validate-edit: index.html com erro de sintaxe bloqueia; válido (módulo + escape) passa', () => {
  const broken = join(mkdtempSync(join(tmpdir(), 'fluxo-hooktest-')), 'index.html');
  writeFileSync(broken, '<html><script type="module">import x from "y"; const a = ;</script></html>');
  const valid = join(mkdtempSync(join(tmpdir(), 'fluxo-hooktest-')), 'index.html');
  writeFileSync(valid, '<html><script src="https://x/y.js"></script><script type="module">import { a } from "https://x/a.js"; a();</script><script>const t = `<p>${1}<\\/script>`; function f(){ return t; }</script></html>');
  assert.equal(run('validate-edit.mjs', { tool_name: 'Edit', tool_input: { file_path: broken } }), 'block');
  assert.equal(run('validate-edit.mjs', { tool_name: 'Edit', tool_input: { file_path: valid } }), 'allow');
});

test('validate-edit: public/index.html real do projeto passa', () => {
  assert.equal(run('validate-edit.mjs', { tool_name: 'Edit', tool_input: { file_path: join(process.cwd(), 'public/index.html') } }), 'allow');
});

// Git hook pre-push (.githooks/pre-push): substituto local da branch protection.
const ZERO = '0'.repeat(40);
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
function prePush(lines) {
  const r = spawnSync('sh', [join(process.cwd(), '.githooks/pre-push'), 'origin', 'https://example.invalid/repo.git'], {
    input: lines.join('\n') + '\n',
    encoding: 'utf8',
  });
  return r.status;
}

test('pre-push: recusa push direto na main', () => {
  assert.equal(prePush([`refs/heads/main ${SHA_A} refs/heads/main ${SHA_B}`]), 1);
});

test('pre-push: recusa outra branch empurrada para a main (HEAD:main)', () => {
  assert.equal(prePush([`refs/heads/feat/x ${SHA_A} refs/heads/main ${SHA_B}`]), 1);
});

test('pre-push: recusa apagar a main', () => {
  assert.equal(prePush([`(delete) ${ZERO} refs/heads/main ${SHA_B}`]), 1);
});

test('pre-push: permite branch de feature (inclusive nova)', () => {
  assert.equal(prePush([`refs/heads/chore/x ${SHA_A} refs/heads/chore/x ${ZERO}`]), 0);
});

test('pre-push: recusa quando qualquer ref do lote é a main', () => {
  assert.equal(prePush([`refs/heads/chore/x ${SHA_A} refs/heads/chore/x ${ZERO}`, `refs/heads/main ${SHA_A} refs/heads/main ${SHA_B}`]), 1);
});
