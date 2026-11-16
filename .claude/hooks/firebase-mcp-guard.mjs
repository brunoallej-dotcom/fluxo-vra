#!/usr/bin/env node
// PreToolUse (mcp__firebase__.*)
// O MCP do Firebase usa a credencial do `firebase login` (dono do projeto), que
// ignora as Firestore Security Rules. Allowlist: só tools de leitura conhecidas
// passam direto; todo o resto (inclusive tools novas com nomes desconhecidos)
// exige confirmação humana. A tool que lista usuários (e-mails = PII) também pede.
import { readFileSync } from 'node:fs';

// Leitura: get/list/query/validate/read e consultas de status.
const READ_ONLY = /(^|_)(get|list|query|validate|read)(_|$)|^firestore_run_aggregation_query$|^firebase_deploy_status$/;
// Alteram só a configuração local do CLI (projeto ativo, diretório), não a produção.
const LOCAL_ONLY = new Set(['firebase_get_environment', 'firebase_update_environment']);
const PII_TOOLS = new Set(['auth_get_users', 'auth_get_user', 'auth_list_users']);

function ask(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason },
  }));
  process.exit(0);
}

let tool = '';
try {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  tool = String(event.tool_name ?? '').replace(/^mcp__firebase__/, '');
} catch (err) {
  ask(`firebase-mcp-guard: não consegui analisar a chamada (${err?.message ?? err}); confirme manualmente.`);
}

if (PII_TOOLS.has(tool)) {
  ask(`firebase-mcp-guard: "${tool}" devolve dados pessoais (e-mails) dos usuários. Confirme se é necessário.`);
}
if (LOCAL_ONLY.has(tool) || READ_ONLY.test(tool)) process.exit(0);

ask(`firebase-mcp-guard: "${tool}" não é uma tool de leitura conhecida e pode alterar o projeto Firebase de produção com credencial de dono (as Security Rules não se aplicam). Confirme se quer mesmo executar.`);
