#!/usr/bin/env node
// PreToolUse (Read | Edit | Write | MultiEdit | Bash)
// Bloqueia acesso a arquivos de segredo (.env, .env.local*, chaves de service
// account, tokens do Firebase CLI) e impede gravar chaves privadas em qualquer
// arquivo. `.env.example` é liberado.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const SECRET_FILE_PATTERNS = [
  /^\.env$/,
  /^\.env\.(?!example$).+/,          // .env.local, .env.production... (menos .env.example)
  /adminsdk.*\.json$/i,              // <projeto>-firebase-adminsdk-xxxx.json
  /service[-_]?account.*\.json$/i,
];
const SECRET_PATH_PATTERNS = [
  /configstore\/firebase-tools\.json$/, // tokens do `firebase login`
  /\.config\/gcloud\/.*credentials/,
];

// Montado em partes para este arquivo não casar consigo mesmo.
const PRIVATE_KEY = new RegExp(['-----BEGIN', '(?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE', 'KEY-----'].join(' '));
const SA_PRIVATE_KEY = new RegExp('"private' + '_key"\\s*:\\s*"-----');

// Comandos de leitura que, apontados para um .env, expõem o conteúdo.
const BASH_READERS = /\b(cat|less|more|head|tail|bat|nl|od|xxd|strings|base64|grep|rg|awk|sed|source|cp|scp|curl)\b/;
const BASH_ENV_TOKEN = /(^|[\s'"=<>/])\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s'"|;&)>])/;

function deny(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  }));
  process.exit(0);
}

function isSecretPath(filePath) {
  const name = basename(filePath);
  return SECRET_FILE_PATTERNS.some((re) => re.test(name))
    || SECRET_PATH_PATTERNS.some((re) => re.test(filePath));
}

function newContent(toolName, input) {
  if (toolName === 'Write') return input.content ?? '';
  if (toolName === 'Edit') return input.new_string ?? '';
  if (toolName === 'MultiEdit') return (input.edits ?? []).map((e) => e.new_string ?? '').join('\n');
  return '';
}

try {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  const toolName = event.tool_name ?? '';
  const input = event.tool_input ?? {};

  if (toolName === 'Bash') {
    const cmd = String(input.command ?? '');
    if (BASH_READERS.test(cmd) && BASH_ENV_TOKEN.test(cmd)) {
      deny('protect-secrets: este comando leria um arquivo .env. Segredos ficam fora do alcance do agente; peça ao usuário o valor específico de que precisa, ou use .env.example.');
    }
    process.exit(0);
  }

  const filePath = String(input.file_path ?? '');
  if (filePath && isSecretPath(filePath)) {
    deny(`protect-secrets: ${basename(filePath)} guarda segredos e está bloqueado para o agente. Use .env.example para documentar variáveis (só placeholders).`);
  }

  const content = newContent(toolName, input);
  if (content && (PRIVATE_KEY.test(content) || SA_PRIVATE_KEY.test(content))) {
    deny('protect-secrets: o conteúdo contém uma chave privada. Chaves nunca vão para arquivos do projeto; use variável de ambiente ou secret manager.');
  }
} catch (err) {
  // Falha do próprio hook não deve travar o trabalho; registra e libera.
  process.stderr.write(`protect-secrets: erro interno (${err?.message ?? err})\n`);
}
process.exit(0);
