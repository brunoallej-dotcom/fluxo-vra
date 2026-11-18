# AGENTS.md — Fluxo

Guia do projeto para qualquer agente de código (Claude Code, Codex e outros).
Instruções específicas do Claude Code ficam no `CLAUDE.md`.

## O que é

Fluxo é o dashboard de produtividade interno da VRA: tarefas, agenda semanal e
mensal, kanban, health score de clientes, CEO View, rotina base e relatórios.
Usuários: 4 pessoas (2 CEOs, 2 na equipe). Interface em português do Brasil.

## Stack

- **Um único arquivo `public/index.html`** (~4 800 linhas, ~420 KB): HTML + CSS + JS puro,
  sem build, sem framework, sem `node_modules` em runtime.
- **Bibliotecas via CDN**, com versão fixa: Chart.js 4.4.1 e Sortable 1.15.2
  (cdnjs), fonte Inter (Google Fonts), Firebase JS SDK **10.12.0** (gstatic).
- **Firebase**: Cloud Firestore (dados) e, a partir da Fase 1, Firebase
  Authentication (e-mail e senha). Projeto `fluxo-app-59174`.
- O `venv/` (Python 3.14) não tem dependências do projeto; o Python só é usado
  para servir o arquivo localmente.

## Como rodar

```bash
npm run serve   # python3 -m http.server 5500 --bind 127.0.0.1 --directory public
# abra http://localhost:5500  (use "localhost", que é domínio autorizado no Firebase Auth)
```

Não abra o arquivo direto (`file://`): o Firebase Auth não funciona nessa origem.

Tooling de testes (Node ≥ 24.12 e Java ≥ 21 para os emuladores):

```bash
npm ci
npm run check        # sintaxe dos <script> inline, versão única do Firebase SDK, tsc estrito
npm run test:hooks   # regressão dos hooks de segurança do Claude Code (.claude/hooks/)
npm run test:rules   # regras do Firestore no emulador (projeto demo-fluxo)
npm run test:hosting # cabeçalhos e deny-by-default do Firebase Hosting (emulador)
npm run test:e2e     # Playwright contra os emuladores (a partir da Onda 4a)
```

Emuladores e testes usam sempre o projeto `demo-fluxo`, isolado da produção.

## Mapa do `public/index.html`

Procure pelos marcadores com `grep -n`; os números de linha mudam.

| Trecho | Como achar |
|---|---|
| Config e inicialização do Firebase (módulo) | `grep -n "CONFIGURAÇÃO FIREBASE" public/index.html` |
| CSS (tema claro/escuro, avatares por pessoa) | entre `<style>` e `</style>` |
| **Logos em base64 — duas linhas de ~70 KB cada** | `grep -n -- "--logo-" public/index.html` — nunca leia essas linhas inteiras |
| Pessoas e identidade (`PEOPLE`, `me()`, `iAmCeo()`) | `grep -n "PESSOAS" public/index.html` |
| Sincronização com o Firestore | `grep -n "syncFromFirebase\|syncTrack" public/index.html` |
| Navegação entre páginas | `grep -n "function showPage" public/index.html` |
| Health Score (clientes) | `grep -n "hsPersist\|function hs" public/index.html` |
| Rotina | `grep -n "function routineKey" public/index.html` |

Leia o arquivo por trechos (offset/limit, `sed -n 'A,Bp'`) ou com `grep`;
nunca o arquivo inteiro de uma vez.

## Modelo de dados (Firestore)

Contrato completo: `contracts/openapi.v1.yaml`.

| Caminho | Conteúdo |
|---|---|
| `fluxo/tasks` | `{ data: "<JSON Task[]>" }` |
| `fluxo/meetings` | `{ data: "<JSON Meeting[]>" }` |
| `fluxo/routine`, `fluxo/routine_<personId>` | `{ data: "<JSON Routine>" }` |
| `fluxo_clients/{clientId}` | `{ data: "<JSON Client>" }` |
| `fluxo_users/{uid}` (Fase 1) | perfil e papel; escrito só pelo console |

Na Fase 1, todo documento de dados ganha `updatedBy` e `updatedAt`.

## Regras de trabalho

1. **Spec antes do código.** Features não triviais começam por
   `docs/specs/<feature>.md`; o roadmap está em
   `docs/plan/implementation-waves.md`; o status atual no `NOTES.md`.
2. **Contrato antes do código.** Mudou o formato de um documento? Atualize
   `contracts/openapi.v1.yaml` (ou crie a v2 se quebrar compatibilidade) antes.
3. **Autorização mora nas regras do Firestore** (`firestore.rules`), nunca só na
   interface. Esconder um botão não é controle de acesso.
4. **Edições mínimas.** Mude só o necessário; o arquivo é grande e compartilhado
   por todas as features. Siga o estilo existente (funções globais, `escHtml`
   para todo texto vindo de dados ao montar HTML, `hsSafeUrl` para links).
5. **Idioma.** Texto de interface em pt-BR. Identificadores novos em inglês,
   como a maioria das funções existentes (`saveState`, `renderDashboard`).
   Comentários podem ficar em português, como os atuais.
6. **Dependências.** Nada de npm em runtime. Script novo de CDN só com versão
   exata e de `cdnjs`, `jsdelivr` ou `gstatic` (Firebase). Módulos do Firebase
   sempre na mesma versão (`10.12.0`).
7. **Commits.** Conventional Commits em inglês, atômicos, em branch (nunca
   direto na `main`). Commit e push só quando o usuário pedir. A `main` só
   recebe PR com CI verde e squash merge. Isso é imposto pelo ruleset
   "Proteger main" do GitHub (gratuito porque o repositório é público): PR
   obrigatório, os dois checks do CI verdes com a branch atualizada, só squash
   merge, sem force push e sem exclusão. Localmente, o `.githooks/pre-push`
   (ativado pelo `npm install`) também recusa push direto na `main`.

## Hospedagem e deploy

- App servido pelo **Firebase Hosting** (plano gratuito): só o diretório
  `public/` é publicado; cabeçalhos de segurança no `firebase.json`
  ([spec](docs/specs/hospedagem.md), ADR-0002). Domínio: `crm.somosvra.com.br`.
- O projeto padrão do repositório é o `demo-fluxo` (isolado). Produção só com
  `--project prod`.
- Deploy só a partir da `main`, com o CI verde no commit e confirmação humana:
  `npx firebase deploy --only hosting --project prod` (app) e
  `npx firebase deploy --only firestore:rules --project prod` (regras).

## Segurança

- A `firebaseConfig` no `index.html` é identificador público do app web, não
  segredo. A proteção vem das Security Rules.
- **Nunca** versione nem cole no código: chave de service account
  (`*adminsdk*.json`), tokens do Firebase CLI, `.env`, `.env.local`.
- Não registre PII em `console.*` (e-mail, senha, tokens); registre só `e.code`.
- **Produção é sensível.** `firebase deploy` (regras ou hosting) e qualquer
  escrita/exclusão direta no Firestore de produção só com confirmação explícita
  do usuário. A ordem do cutover da Fase 1 está na Onda 4 do plano: publicar as
  regras antes do `index.html` novo derruba o app para todos.
- Ferramentas com credencial de dono do projeto (Firebase CLI, MCP do Firebase,
  Admin SDK) **ignoram as Security Rules**. Use só para leitura e inspeção,
  salvo pedido explícito.

## Documentação

- `docs/specs/` — specs de features
- `docs/plan/implementation-waves.md` — plano de ondas (fonte da verdade do roadmap)
- `docs/adr/` — decisões arquiteturais (formato Nygard)
- `contracts/openapi.v1.yaml` — contrato de dados do Firestore
- `NOTES.md` — status atual, roadmap espelhado e diário de sessões
