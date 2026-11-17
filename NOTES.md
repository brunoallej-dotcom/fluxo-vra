# NOTES — Fluxo

Memória de trabalho do projeto: status atual, roadmap e diário de sessões.
Leia antes de começar; atualize antes de encerrar.

## Current status

- **Fase atual**: Fase 1 — autenticação multiusuário (login e senha por pessoa).
- **Situação**: S1, S3, S4 e S5 concluídos; S2 com pendência (backup).
  **App servido pelo Firebase Hosting em `https://crm.somosvra.com.br` desde
  2026-11-16.** Regras de contenção em produção desde 2026-11-16, verificadas pelo
  usuário no app. O app ainda **não tem login** e a **leitura continua pública**.
- **Restrição do usuário (2026-11-16): nenhum plano pago por enquanto** —
  Firebase Spark, GitHub Free. Consequências:
  - backup: sem PITR/backup gerenciado → exportação diária criptografada via
    GitHub Actions (spec a escrever); até lá, cópia local em `backups/`
    (recomendado ao usuário criptografar com `gpg -c`);
  - proteção da `main`: sem branch protection → `.githooks/pre-push` + regras
    `deny` do `git push` no `.claude/settings.json`.
- **S5**: concluído. PR #7 (`6088d65`); Hosting no `web.app` e, depois da
  troca de DNS, em `crm.somosvra.com.br` (ALIAS da CDN da Hostinger trocado
  por `CNAME crm → fluxo-app-59174.web.app`; certificado Google Trust Services
  emitido em ~16 min, renovação automática). Conferido: conteúdo idêntico,
  cabeçalhos, 404s; testado pelo usuário no navegador. **Pendente (RH-08):
  até 2026-11-23, apagar só os arquivos/site `crm` na Hostinger**, sem apagar
  os registros DNS `crm` e sem desligar a CDN do site (pode reescrever o
  DNS); conferir o CNAME depois. Plano de volta até lá: spec de hospedagem §4.
- **Frentes (desde 2026-11-17)**: A (front, Ondas 1 → 3) no **Codex**, pelo
  usuário; B e C com subagentes coordenados pelo Claude Code. **Onda 2 pronta**
  (regras completas + R01–R13 e X01–X17, auditadas) — **não publicar antes do
  cutover**: o app atual não grava `updatedBy`/`updatedAt` e cairia para
  todos. Onda 4a em PR (#11).
- **Próximo passo**: merge da Onda 4a; frente A segue no Codex; depois Onda 3 e
  cutover (4b), este só com o usuário.

### Roadmap (espelho de `docs/plan/implementation-waves.md`)

| Passo | Entrega | Status |
|------|---------|--------|
| S1 | Docs da Fase 1 e config do Claude Code commitados numa branch | ✅ |
| S2 | Cópia local dos dados; regras de contenção prontas (publicar só com confirmação); backup/PITR | 🟡 |
| S3 | Onda 0 | ✅ |
| S4 | Interfaces congeladas na spec (§9) | ✅ |
| S5 | Hospedagem: `public/`, Firebase Hosting com cabeçalhos, H01–H06, guarda-corpos da `main`, domínio `crm.somosvra.com.br` | ✅ |

| Onda | Entrega | Depende de | Paralela com | Status |
|------|---------|------------|--------------|--------|
| 0 | Fundação: tooling Node, Firebase CLI, emuladores, regras de contenção + C01–C11, CI | S1 | — | ✅ |
| 1 | Login, gate de sessão, "Sair", "Esqueci minha senha", autosave só com sessão | 0, S4 | 2, 4a | ⬜ |
| 2 | Regras do Firestore completas + testes R01–R13 | 0, S4 | 1, 3, 4a | ✅ (não publicada) |
| 3 | Pessoas dinâmicas, rotina por perfil, helper de escrita com auditoria, autosave só com alteração | 1 | 2, 4a | ⬜ |
| 4a | Testes E2E E01–E08 (test-first) | 0, S4 | 1, 2, 3 | ⬜ |
| 4b | Integração e cutover em produção | 2, 3, 4a | — | ⬜ |

Frentes paralelas depois de S1–S5: **A** = Ondas 1 → 3 (`public/index.html`,
front-end, sessão principal), **B** = Onda 2 (regras do banco), **C** = Onda 4a
(testes E2E).

## Decisões

| Data | Decisão | Onde |
|---|---|---|
| 2026-11-16 | Firebase Authentication com e-mail e senha; perfis em `fluxo_users/{uid}` escritos só pelo console | ADR-0001 (proposed) |
| 2026-11-16 | Papéis `ceo` (2 pessoas) e `staff` (2 pessoas); sem papel admin separado — contas geridas pelo dono do projeto no console | Spec §1 |
| 2026-11-16 | `personId` = valor atual de `Task.owner` (`Bruno`, `Julia`, `Vinicius`), para não migrar dados | Spec §1 |
| 2026-11-16 | Contrato de dados em OpenAPI 3.1 só com `components` (o app não tem API HTTP própria) | `contracts/openapi.v1.yaml` |
| 2026-11-16 | Regras de contenção provisórias antes do login, compatíveis com o app atual e com o formato da Fase 1 | Spec §5.3 |
| 2026-11-16 | Emuladores e testes sempre com o projeto `demo-fluxo` (isolado da produção) | Spec §9.2 |
| 2026-11-16 | Firebase Hosting (gratuito) publicando só `public/`; cabeçalhos AISAC no `firebase.json`; CSP rígida em Report-Only até refatorar os handlers inline | ADR-0002, spec de hospedagem |
| 2026-11-16 | Nenhum plano pago por enquanto (Firebase Spark, GitHub Free) | Decisão do usuário |
| 2026-11-16 | Supabase avaliado e adiado: reavaliar no ADR da Fase 2 (quando o modelo de dados for refeito); agora atrasaria o fechamento do banco | Conversa de 2026-11-16 |
| 2026-11-16 | 4ª pessoa: Luiza (`staff`, `routine_Luiza`) | Spec §1 |
| 2026-11-16 | gitleaks: exceção só da regra `generic-api-key` só em `tests/fixtures/users.json` (senhas fictícias do emulador), via `[[rules.allowlists]]` — sintaxe do gitleaks 8.24 | `.gitleaks.toml`, issue #2 |
| 2026-11-16 | `.firebaserc` com `default: demo-fluxo`; produção só pelo alias `prod` | `.firebaserc` |
| 2026-11-16 | Mensagens de commit e títulos de PR em inglês (AISAC git-workflow); docs e UI seguem em pt-BR | — |

## Questões em aberto

Detalhes e propostas na spec, §8.

- ~~Q1~~ — resolvida: Luiza.
- ~~Q2~~ — resolvida: Hostinger hoje → Firebase Hosting (`crm.somosvra.com.br`).
- **Q3** — A equipe pode excluir clientes?
- **Q4** — E-mail corporativo ou pessoal nas contas?
- **Q5** — "Manter conectado" opcional para computador compartilhado?
- **Q6** — A rotina de Bruno e Júlia continua compartilhada?

## Riscos conhecidos

- **Leitura pública em produção até o cutover** (Onda 4b): desde 2026-11-16
  as regras de contenção restringem caminhos, formato, tamanho e exclusões,
  mas qualquer pessoa com o ID do projeto ainda lê tudo e consegue sobrescrever
  tarefas/reuniões/clientes no formato aceito. Antes das regras de contenção:
  leitura e escrita totalmente abertas. **Confirmado em
  2026-11-16** via MCP: regras `match /{document=**} { allow read, write: if true; }`
  (sem prazo de expiração).
- **Sem recuperação de dados** (confirmado em 2026-11-16): nenhum backup
  agendado, PITR desativado, retenção de versões de 1 h, proteção contra exclusão
  do banco desativada. Banco `(default)` em `southamerica-east1`. Backup
  agendado e PITR exigem o plano Blaze.
- **Documento único para tarefas e reuniões**: gravações quase simultâneas se
  sobrescrevem (a última vence) e há o limite de 1 MiB por documento. Resolvido
  na Fase 2.
- **Ordem do cutover**: publicar `firestore.rules` antes do `index.html` novo
  derruba o app para todos.
- **Autoria só confiável depois da Onda 2**: com as regras de contenção,
  `updatedBy`/`updatedAt` têm o tipo conferido, mas qualquer um pode
  preenchê-los; a garantia (`updatedBy == request.auth.uid`) vem das regras completas.
- **Dependências de desenvolvimento**: 14 vulnerabilidades moderadas
  transitivas do `firebase-tools` (16/11/2026), aceitas por serem só tooling
  local/CI sem entrada não confiável; o CI falha em high/critical e o Dependabot
  propõe atualizações semanais. O `grpc-js` vulnerável dos testes foi forçado
  para 1.14.7 via `overrides`.
- **gitleaks-action**: grátis para conta pessoal; se o repositório for para uma
  organização, passa a exigir o secret `GITLEAKS_LICENSE`.
- **Hooks são guarda-corpo, não cofre**: `protect-secrets` não enxerga leitura
  indireta (grep recursivo, globs); a proteção real é não manter segredo no repositório.

## Próximas fases (sem spec ainda)

- **Fase 2** — um documento por tarefa/reunião: elimina sobrescrita, permite
  regras por item (equipe edita só o que é seu) e histórico.
- Evoluções: App Check, login com Google, tela de administração de usuários
  (Cloud Functions + Admin SDK).

## Diário de sessões

### 2026-11-16 (fim da noite) — domínio próprio no Firebase Hosting

- Console do Firebase: `crm.somosvra.com.br` adicionado (configuração rápida
  pediu CNAME). No hPanel, o `crm` era um único `ALIAS` para
  `crm.somosvra.com.br.cdn.hstgr.net` (TTL 300): apagado e substituído por
  `CNAME crm → fluxo-app-59174.web.app` (TTL 300). Tropeço: o campo *Nome*
  com `crm.` (ponto final) foi recusado.
- DNS público já resolvia para o Firebase logo depois; certificado em ~16 min;
  propagação na CDN do Firebase em poucos minutos (20/20 acessos válidos).
- No domínio próprio vale o HSTS do `firebase.json` (no `web.app` o Firebase
  impõe o dele). Usuário testou o app no navegador: ok.

### 2026-11-16 (noite) — caminho AISAC até a contenção em produção

- PR #1 (docs + Onda 0): revisão independente pediu correções (hook de
  segredos no Bash, falha fechada, guard do MCP como allowlist, permissões do
  CI, tipos de updatedBy/updatedAt); corrigidas com testes (`tests/hooks`, 41
  casos) e re-revisão "pode mergear".
- security-scan: só `npm audit` disponível; 5 high via `grpc-js` dos testes
  corrigidas com `overrides`; 14 moderate aceitas e registradas.
- gitleaks: falso positivo nas senhas fictícias da fixture; exceção restrita
  (issue #2) aprovada pelo usuário.
- Squash merge na `main` (`56a8538`), CI verde nesse commit, deploy das regras
  de contenção com `--project prod` e teste pós-deploy em produção (só leitura
  e gravações negadas; nada alterado).
- Verificação manual do usuário em produção (app servido em `localhost:5500`):
  sincronização ok, leitura de tarefas/reuniões/clientes ok, criar, concluir e
  apagar tarefa de teste ok com as regras de contenção.

### 2026-11-16 (tarde) — pré-requisitos S1–S4

- Regras de produção confirmadas via MCP: `allow read, write: if true`; sem
  backup, PITR desligado.
- S1: commits `a0051f7` (config do Claude Code) e `df38583` (docs) na branch
  `docs/fase-1-login`.
- S2: cópia local de produção em `backups/2026-11-16T19-33-05-839Z/`
  (`fluxo`: 3 docs; `fluxo_clients`: 8 docs), fora do git, permissão só do
  usuário, lida via REST sem credencial. Regras de contenção escritas,
  validadas pelo MCP e com C01–C11 verdes; os dados reais cabem nelas.
- S3: Onda 0 no commit `46d0151` (branch `chore/onda-0-fundacao`): `npm ci`,
  `npm run check` e `npm run test:rules` verdes.
- S4: spec §9 (seletores `data-testid`, modo emulador, fixture) e
  `tests/fixtures/users.json`.
- Achado: `setInterval(saveState, 30000)` regrava as tarefas a cada 30 s em
  cada aba → RF-16.

### 2026-11-16

- Análise do `index.html`: app de arquivo único com Firestore, sem
  autenticação; identidade escolhida no navegador (`localStorage.fluxo_me`);
  pessoas fixas no código.
- Escritos: spec da Fase 1, ADR-0001, `contracts/openapi.v1.yaml`, plano de
  ondas, `AGENTS.md`, `CLAUDE.md`, agents/skills/hooks em `.claude/`,
  `settings.json`, `.mcp.json` e `.env.example`.
