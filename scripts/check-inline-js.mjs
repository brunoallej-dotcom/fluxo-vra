#!/usr/bin/env node
// Checa o index.html sem build:
// 1. sintaxe de cada <script> inline (node --check);
// 2. todos os módulos do Firebase SDK carregados do gstatic na mesma versão.
// Uso: node scripts/check-inline-js.mjs [index.html]
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';

const file = process.argv[2] ?? 'index.html';
const html = readFileSync(file, 'utf8');
const errors = [];

const lineOf = (index) => html.slice(0, index).split('\n').length;

// 1. Sintaxe dos <script> inline
const scriptRe = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
const dir = mkdtempSync(join(tmpdir(), 'fluxo-check-'));
let checked = 0;
try {
  let match;
  while ((match = scriptRe.exec(html)) !== null) {
    const attrs = match[1] ?? '';
    const body = match[2];
    if (/\bsrc\s*=/.test(attrs) || !body.trim()) continue;
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) ?? [])[1]?.toLowerCase() ?? '';
    if (type && type !== 'module' && type !== 'text/javascript') continue;
    checked += 1;
    const tmp = join(dir, `script-${checked}.${type === 'module' ? 'mjs' : 'js'}`);
    writeFileSync(tmp, body);
    const res = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8', timeout: 20000 });
    if (res.status !== 0) {
      const detail = (res.stderr || res.stdout || '').split('\n').filter(Boolean).slice(0, 6).join('\n');
      errors.push(`sintaxe: <script> que começa em ${file}:${lineOf(match.index)} (linha do erro relativa ao início do script)\n${detail}`);
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// 2. Versão única do Firebase SDK
const versions = new Set([...html.matchAll(/gstatic\.com\/firebasejs\/(\d+\.\d+\.\d+)\//g)].map((m) => m[1]));
if (versions.size > 1) {
  errors.push(`firebase: módulos do SDK em versões diferentes (${[...versions].join(', ')}); use uma só.`);
}

if (errors.length) {
  console.error(errors.join('\n\n'));
  process.exit(1);
}
console.log(`ok: ${checked} <script> inline sem erro de sintaxe; Firebase SDK ${[...versions].join(', ') || '(não encontrado)'}`);
