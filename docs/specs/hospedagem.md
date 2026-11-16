# Spec — Hospedagem no Firebase Hosting (S5)

- **Status**: proposta (implementação no PR do S5)
- **Data**: 2026-11-16
- **Decisão arquitetural**: [ADR-0002](../adr/0002-firebase-hosting.md)
- **Relacionada**: [autenticação multiusuário](autenticacao-multiusuario.md) (Q2 resolvida por esta spec)

## 1. Visão geral

Hoje o time acessa o Fluxo em `https://crm.somosvra.com.br`, servido pela
Hostinger (CDN `hcdn`). O DNS de `somosvra.com.br` também está na Hostinger
(`dns-parking.com`). O arquivo publicado é idêntico ao `index.html` do
repositório (conferido em 2026-11-16).

A única proteção enviada hoje é `Content-Security-Policy: upgrade-insecure-requests`:
sem HSTS, sem `nosniff`, sem proteção contra o app ser embutido em outro site
(clickjacking).

**Objetivo.** Servir o mesmo app pelo Firebase Hosting (plano gratuito Spark),
com os cabeçalhos de segurança declarados como código no `firebase.json`,
publicando **só** o diretório `public/` (deny by default), sem mudar o
comportamento do app.

**Fora do escopo:** CSP rígida aplicada (exige refatorar os handlers inline —
ver §6), deploy automático pelo CI (vem junto com a identidade OIDC do backup
agendado), mudanças no `index.html`.

## 2. Requisitos

| ID | Requisito |
|---|---|
| RH-01 | Só o conteúdo de `public/` é publicado. Qualquer outro caminho do repositório (`package.json`, `docs/`, `tests/`, `backups/`, `.claude/`…) responde 404. |
| RH-02 | Todas as respostas levam: `Strict-Transport-Security: max-age=63072000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin` e `Permissions-Policy` negando câmera, microfone, geolocalização, pagamento, USB e sensores. |
| RH-03 | CSP **aplicada** só com diretivas que não quebram o app hoje: `upgrade-insecure-requests; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`. A CSP **alvo** (sem `unsafe-inline` em scripts) vai em `Content-Security-Policy-Report-Only`. |
| RH-04 | `/` e `/index.html` com `Cache-Control: no-cache`, para que cada deploy (em especial o do login) chegue a todos na hora. |
| RH-05 | Domínio próprio `crm.somosvra.com.br` com certificado emitido pelo Firebase; o domínio padrão `fluxo-app-59174.web.app` continua disponível. |
| RH-06 | Deploy só a partir da `main`, com o CI verde no commit, por `firebase deploy --only hosting --project prod` e com confirmação humana (regra `ask`). |
| RH-07 | Nenhuma mudança de comportamento do app: mesmo arquivo, mesmo banco, mesmas regras. |
| RH-08 | Depois da troca de DNS e da verificação, a cópia na Hostinger é removida (para não sobrar uma versão antiga do app no ar após o login). |

## 3. Design técnico

- `public/index.html` (movido com `git mv`, conteúdo idêntico).
- `firebase.json` → `hosting.public = "public"` e `hosting.headers` (RH-02 a RH-04).
- HSTS **sem** `preload`: o preload só vale para o domínio raiz e seria uma
  decisão para todo o `somosvra.com.br`.
- **Observado em produção (2026-11-16):** o Firebase Hosting impõe o próprio
  HSTS (`max-age=31556926; includeSubDomains; preload`) e ignora o valor do
  `firebase.json` no `web.app`. Conferir também no domínio próprio depois da
  troca de DNS. O teste H02 valida a configuração no emulador.
- Sem `Cross-Origin-Opener-Policy`: o relatório abre uma janela com
  `window.open` + `document.write`; não vale o risco nesta etapa.

### 3.1 Origens da CSP alvo (Report-Only)

| Diretiva | Origens | Motivo |
|---|---|---|
| `script-src` | `'self'`, `cdnjs.cloudflare.com`, `www.gstatic.com`, `apis.google.com` | Chart.js, Sortable, Firebase SDK; `apis.google.com` é carregado pelo Firebase Auth (resolvedor de popup/redirect) em alguns navegadores |
| `style-src` | `'self'`, `'unsafe-inline'`, `fonts.googleapis.com` | `<style>` e 120 `style=""` inline (risco baixo; fica fora da dívida principal) |
| `font-src` | `'self'`, `fonts.gstatic.com`, `data:` | fonte Inter |
| `img-src` | `'self'`, `data:`, `https:` | logos em base64 e imagens de documentos |
| `connect-src` | `firestore`, `identitytoolkit`, `securetoken`, `firebaseinstallations` (googleapis), `www.gstatic.com`, `apis.google.com` | Firestore e Firebase Auth |
| `frame-src` | `drive.google.com`, `docs.google.com`, `accounts.google.com`, `*.googleusercontent.com`, `fluxo-app-59174.firebaseapp.com` | prévia de documentos (o Drive pode redirecionar para login/conteúdo do Google) e iframe `/__/auth/iframe` do Firebase Auth |
| demais | `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'` | |

Sem endpoint de relatório: as violações aparecem só no console do navegador.
As origens do Firebase Auth foram incluídas antes do login existir (revisão do
PR #7): antes de promover esta CSP a aplicada, validar o login em Chrome,
Safari e celular, não só no console de um navegador.

## 4. Migração (passos, nesta ordem)

1. PR do S5 mergeado na `main`, CI verde.
2. `firebase deploy --only hosting --project prod` → app em `https://fluxo-app-59174.web.app`.
3. Conferir cabeçalhos (`curl -I`) e o app no `web.app` (o time ainda usa a Hostinger).
4. **Usuário**, no console do Firebase → Hosting → *Adicionar domínio personalizado* →
   `crm.somosvra.com.br`: o console mostra um registro TXT de verificação e os
   registros A do Firebase.
5. **Usuário**, no hPanel da Hostinger (DNS de `somosvra.com.br`): criar o TXT;
   **remover** os registros A (hoje `147.79.105.97`, `89.116.213.174`) **e AAAA**
   (IPv6 `2a02:4780:…`) de `crm`; criar os A indicados pelo Firebase. Sem remover
   os AAAA, quem usa IPv6 continua indo para a Hostinger.
6. Aguardar o certificado (até 24 h) e conferir `curl -I https://crm.somosvra.com.br`.
7. Manter a cópia da Hostinger por até 7 dias como plano de volta; depois, removê-la.

**Plano de volta:** restaurar os registros A/AAAA da Hostinger (anotar os valores
antes do passo 5).

## 5. Testes

Automáticos no Hosting Emulator (`npm run test:hosting`, também no CI):

| ID | Caso |
|---|---|
| H01 | `/` responde 200 com o app |
| H02 | cabeçalhos do RH-02 presentes |
| H03 | CSP aplicada só com as diretivas seguras; CSP alvo em Report-Only, sem `unsafe-inline` em scripts |
| H04 | `Cache-Control: no-cache` em `/` e `/index.html` |
| H05 | arquivos fora de `public/` respondem 404 (RH-01) |
| H06 | `public/` contém só `index.html` — arquivo novo ali (inclusive oculto) quebra o CI até ser incluído de propósito (RH-01) |

Manuais: passos 3 e 6 da §4.

## 6. Dívida registrada

- **CSP rígida aplicada**: exige trocar os 166 handlers inline (`onclick=` etc.)
  por `addEventListener` e usar hashes para os `<script>` inline. Terá spec
  própria depois da Fase 1 (mexe no mesmo arquivo da frente A).
- **Relatório de violações de CSP**: sem endpoint gratuito; por ora, só console.
