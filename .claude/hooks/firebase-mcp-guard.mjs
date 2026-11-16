#!/usr/bin/env node
// PreToolUse (mcp__firebase__.*)
// O MCP do Firebase usa a credencial do `firebase login` (dono do projeto), que
// ignora as Firestore Security Rules. Toda tool que cria, altera, apaga, publica
// ou envia algo — e a que lista usuários (e-mails = PII) — exige confirmação
// humana, inclusive em modo automático.
import { readFileSync } from 'node:fs';

const WRITE_VERB = /(^|_)(create|add|update|delete|remove|set|deploy|send|init|login|logout|import|export|upload|write|enable|disable|execute|run|restore|rollback|publish)(_|$)/;
const PII_TOOLS = new Set(['auth_get_users', 'auth_get_user', 'auth_list_users']);

try {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  const tool = String(event.tool_name ?? '').replace(/^mcp__firebase__/, '');

  let reason = null;
  if (WRITE_VERB.test(tool)) {
    reason = `firebase-mcp-guard: "${tool}" altera o projeto Firebase de produção com credencial de dono (as Security Rules não se aplicam). Confirme se quer mesmo executar.`;
  } else if (PII_TOOLS.has(tool)) {
    reason = `firebase-mcp-guard: "${tool}" devolve dados pessoais (e-mails) dos usuários. Confirme se é necessário.`;
  }

  if (reason) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: reason,
      },
    }));
  }
} catch (err) {
  // Na dúvida, pede confirmação em vez de liberar.
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'ask',
      permissionDecisionReason: `firebase-mcp-guard: não consegui analisar a chamada (${err?.message ?? err}); confirme manualmente.`,
    },
  }));
}
process.exit(0);
