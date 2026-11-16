# NOTES — Fluxo

Memória de trabalho do projeto: status atual, roadmap e diário de sessões.
Leia antes de começar; atualize antes de encerrar.

## Current status

- **Fase atual**: Fase 1 — autenticação multiusuário (login e senha por pessoa).
- **Situação**: S1, S3 (Onda 0) e S4 concluídos; S2 parcial. O app em
  produção ainda **não tem login** e as regras do Firestore continuam abertas
  (as de contenção estão prontas e testadas, aguardando confirmação para publicar).
- **PR #1** (rascunho): `chore/onda-0-fundacao` → `main`, com docs + Onda 0 +
  correções da revisão. Revisão independente: "pode mergear". CI: check,
  dependências, hooks e regras verdes; gitleaks com exceção restrita à fixture
  (issue #2) — aguardando o run confirmar.
- **Caminho AISAC em andamento** (autorizado pelo usuário em 2026-11-16):
  CI verde → PR pronto → **aprovação do usuário para a supressão do gitleaks**
  (exigência AISAC; o autor não pode aprovar o próprio PR) → squash merge →
  deploy das regras de contenção a partir da `main` com `--project prod`
  (a regra `ask` pede confirmação) → usuário: Blaze + alerta de orçamento →
  PITR e backup por comando → apagar a cópia local → proteger a `main` → Q2.
- **Próximo passo depois disso**: frentes paralelas A/B/C. **Não iniciar a
  Onda 1 sem o usuário autorizar** (pedido explícito em 2026-11-16).

### Roadmap (espelho de `docs/plan/implementation-waves.md`)

| Passo | Entrega | Status |
|------|---------|--------|
| S1 | Docs da Fase 1 e config do Claude Code commitados numa branch | ✅ |
| S2 | Cópia local dos dados; regras de contenção prontas (publicar só com confirmação); backup/PITR | 🟡 |
| S3 | Onda 0 | ✅ |
| S4 | Interfaces congeladas na spec (§9) | ✅ |

| Onda | Entrega | Depende de | Paralela com | Status |
|------|---------|------------|--------------|--------|
| 0 | Fundação: tooling Node, Firebase CLI, emuladores, regras de contenção + C01–C11, CI | S1 | — | ✅ |
| 1 | Login, gate de sessão, "Sair", "Esqueci minha senha", autosave só com sessão | 0, S4 | 2, 4a | ⬜ |
| 2 | Regras do Firestore completas + testes R01–R13 | 0, S4 | 1, 3, 4a | ⬜ |
| 3 | Pessoas dinâmicas, rotina por perfil, helper de escrita com auditoria, autosave só com alteração | 1 | 2, 4a | ⬜ |
| 4a | Testes E2E E01–E08 (test-first) | 0, S4 | 1, 2, 3 | ⬜ |
| 4b | Integração e cutover em produção | 2, 3, 4a | — | ⬜ |

Frentes paralelas depois de S1–S4: **A** = Ondas 1 → 3 (`index.html`, sessão
principal), **B** = Onda 2 (regras), **C** = Onda 4a (E2E).

## Decisões

| Data | Decisão | Onde |
|---|---|---|
| 2026-11-16 | Firebase Authentication com e-mail e senha; perfis em `fluxo_users/{uid}` escritos só pelo console | ADR-0001 (proposed) |
| 2026-11-16 | Papéis `ceo` (2 pessoas) e `staff` (2 pessoas); sem papel admin separado — contas geridas pelo dono do projeto no console | Spec §1 |
| 2026-11-16 | `personId` = valor atual de `Task.owner` (`Bruno`, `Julia`, `Vinicius`), para não migrar dados | Spec §1 |
| 2026-11-16 | Contrato de dados em OpenAPI 3.1 só com `components` (o app não tem API HTTP própria) | `contracts/openapi.v1.yaml` |
| 2026-11-16 | Regras de contenção provisórias antes do login, compatíveis com o app atual e com o formato da Fase 1 | Spec §5.3 |
| 2026-11-16 | Emuladores e testes sempre com o projeto `demo-fluxo` (isolado da produção) | Spec §9.2 |
| 2026-11-16 | Hosting fora do `firebase.json` até decidir a hospedagem (Q2) | Plano, Onda 0 |
| 2026-11-16 | gitleaks: exceção só da regra `generic-api-key` só em `tests/fixtures/users.json` (senhas fictícias do emulador), via `[[rules.allowlists]]` — sintaxe do gitleaks 8.24 | `.gitleaks.toml`, issue #2 |
| 2026-11-16 | `.firebaserc` com `default: demo-fluxo`; produção só pelo alias `prod` | `.firebaserc` |
| 2026-11-16 | Mensagens de commit e títulos de PR em inglês (AISAC git-workflow); docs e UI seguem em pt-BR | — |

## Questões em aberto

Detalhes e propostas na spec, §8.

- **Q1** — Nome e `personId` da 4ª pessoa (equipe).
- **Q2** — Onde o `index.html` está hospedado hoje (domínio autorizado no Auth)?
- **Q3** — A equipe pode excluir clientes?
- **Q4** — E-mail corporativo ou pessoal nas contas?
- **Q5** — "Manter conectado" opcional para computador compartilhado?
- **Q6** — A rotina de Bruno e Júlia continua compartilhada?

## Riscos conhecidos

- **Banco aberto em produção até o cutover** (Onda 4): qualquer pessoa com o ID
  do projeto lê e grava os dados. Prioridade máxima. **Confirmado em
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
