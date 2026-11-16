#!/usr/bin/env node
// PostToolUse (Edit | Write | MultiEdit)
// - *.json: confere se continua JSON válido.
// - index.html: checa a sintaxe de cada <script> inline com `node --check`.
// Se algo quebrou, devolve o erro ao agente para ele corrigir na hora.
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function checkJson(filePath) {
  if (/\/(node_modules|\.vscode)\//.test(filePath)) return;
  try {
    JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (err) {
    block(`validate-edit: ${basename(filePath)} deixou de ser JSON válido — ${err.message}. Corrija antes de seguir.`);
  }
}

function checkInlineScripts(filePath) {
  const html = readFileSync(filePath, 'utf8');
  const scriptRe = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  const dir = mkdtempSync(join(tmpdir(), 'fluxo-check-'));
  const errors = [];
  try {
    let match;
    let n = 0;
    while ((match = scriptRe.exec(html)) !== null) {
      const attrs = match[1] ?? '';
      const body = match[2];
      if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
      const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) ?? [])[1]?.toLowerCase() ?? '';
      if (type && type !== 'module' && type !== 'text/javascript') continue; // JSON, templates etc.
      n += 1;
      const startLine = lineOf(html, match.index);
      const file = join(dir, `script-${n}.${type === 'module' ? 'mjs' : 'js'}`);
      writeFileSync(file, body);
      const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 20000 });
      if (res.status !== 0) {
        const detail = (res.stderr || res.stdout || '').split('\n').filter(Boolean).slice(0, 6).join('\n');
        errors.push(`<script> que começa em index.html:${startLine}:\n${detail}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (errors.length) {
    block(`validate-edit: erro de sintaxe JavaScript no index.html (a linha no erro é relativa ao início do <script>).\n${errors.join('\n\n')}`);
  }
}

try {
  const event = JSON.parse(readFileSync(0, 'utf8'));
  const filePath = String(event.tool_input?.file_path ?? '');
  if (filePath && existsSync(filePath)) {
    if (filePath.endsWith('.json')) checkJson(filePath);
    else if (basename(filePath) === 'index.html') checkInlineScripts(filePath);
  }
} catch (err) {
  process.stderr.write(`validate-edit: erro interno (${err?.message ?? err})\n`);
}
process.exit(0);
