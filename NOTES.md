# NOTES — Fluxo

Memória de trabalho do projeto: status atual, roadmap e diário de sessões.
Leia antes de começar; atualize antes de encerrar.

## Current status

- **Fase atual**: Fase 1 — autenticação multiusuário (login e senha por pessoa).
- **Situação**: executando os pré-requisitos sequenciais S1–S4. O app em
  produção ainda **não tem login** e as regras do Firestore estão abertas.
- **Próximo passo**: concluir S1–S4 e avisar o usuário antes de iniciar a
  Onda 1 (o usuário pediu para não começar a Onda 1 sem avisar).

### Roadmap (espelho de `docs/plan/implementation-waves.md`)

| Passo | Entrega | Status |
|------|---------|--------|
| S1 | Docs da Fase 1 e config do Claude Code commitados numa branch | ⬜ |
| S2 | Cópia local dos dados; regras de contenção prontas (publicar só com confirmação); backup/PITR | ⬜ |
| S3 | Onda 0 | ⬜ |
| S4 | Interfaces congeladas na spec (§9) | ⬜ |

| Onda | Entrega | Depende de | Paralela com | Status |
|------|---------|------------|--------------|--------|
| 0 | Fundação: tooling Node, Firebase CLI, emuladores, regras de contenção + C01–C11, CI | S1 | — | ⬜ |
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

## Próximas fases (sem spec ainda)

- **Fase 2** — um documento por tarefa/reunião: elimina sobrescrita, permite
  regras por item (equipe edita só o que é seu) e histórico.
- Evoluções: App Check, login com Google, tela de administração de usuários
  (Cloud Functions + Admin SDK).

## Diário de sessões

### 2026-11-16

- Análise do `index.html`: app de arquivo único com Firestore, sem
  autenticação; identidade escolhida no navegador (`localStorage.fluxo_me`);
  pessoas fixas no código.
- Escritos: spec da Fase 1, ADR-0001, `contracts/openapi.v1.yaml`, plano de
  ondas, `AGENTS.md`, `CLAUDE.md`, agents/skills/hooks em `.claude/`,
  `settings.json`, `.mcp.json` e `.env.example`.
