#!/usr/bin/env node
// PreToolUse (Read | Edit | Write | MultiEdit | Bash)
// Guarda-corpo contra acesso a segredos: .env, .env.local*, chaves de service
// account e tokens do Firebase CLI / gcloud; também impede gravar chave privada
// em qualquer arquivo. `.env.example` é liberado.
//
// Limite conhecido: não enxerga leitura indireta (grep recursivo sem citar o
// arquivo, globs como `.e*`, scripts que montam o caminho em tempo de execução).
// A proteção real é não manter segredo no repositório.
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
  /\.config\/gcloud\//,                 // credenciais do gcloud / ADC
];

// Em comandos Bash: qualquer menção a esses alvos, com qualquer verbo
// (cat, git show HEAD:.env, node -e "readFileSync('.env')", cp, source...).
const BASH_ENV_TOKEN = /(^|[\s'"=<>/:(`,])\.env(\.(?!example\b)[\w.-]+)?(?=$|[\s'"|;&)>`,])/;
const BASH_SECRET_TOKENS = [
  /firebase-tools\.json/,
  /configstore/,
  /\.config\/gcloud/,
  /application_default_credentials\.json/,
  /adminsdk[^\s'"]*\.json/i,
  /service[-_]?account[^\s'"]*\.json/i,
];

// Montado em partes para este arquivo não casar consigo mesmo.
const PRIVATE_KEY = new RegExp(['-----BEGIN', '(?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE', 'KEY-----'].join(' '));
const SA_PRIVATE_KEY = new RegExp('"private' + '_key"\\s*:\\s*"-----');

function decide(permissionDecision, reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision, permissionDecisionReason: reason },
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

let event;
try {
  event = JSON.parse(readFileSync(0, 'utf8'));
} catch (err) {
  // Falha fechada: sem conseguir analisar a chamada, pede confirmação humana.
  decide('ask', `protect-secrets: não consegui analisar a chamada (${err?.message ?? err}); confirme manualmente.`);
}

const toolName = event.tool_name ?? '';
const input = event.tool_input ?? {};

if (toolName === 'Bash') {
  const cmd = String(input.command ?? '');
  if (BASH_ENV_TOKEN.test(cmd)) {
    decide('deny', 'protect-secrets: o comando menciona um arquivo .env. Segredos ficam fora do alcance do agente; peça ao usuário o valor específico de que precisa, ou use .env.example.');
  }
  if (BASH_SECRET_TOKENS.some((re) => re.test(cmd))) {
    decide('deny', 'protect-secrets: o comando menciona credenciais (token do Firebase CLI, gcloud ou chave de service account). Esses arquivos ficam fora do alcance do agente.');
  }
  process.exit(0);
}

const filePath = String(input.file_path ?? '');
if (filePath && isSecretPath(filePath)) {
  decide('deny', `protect-secrets: ${basename(filePath)} guarda segredos e está bloqueado para o agente. Use .env.example para documentar variáveis (só placeholders).`);
}

const content = newContent(toolName, input);
if (content && (PRIVATE_KEY.test(content) || SA_PRIVATE_KEY.test(content))) {
  decide('deny', 'protect-secrets: o conteúdo contém uma chave privada. Chaves nunca vão para arquivos do projeto; use variável de ambiente ou secret manager.');
}
process.exit(0);
