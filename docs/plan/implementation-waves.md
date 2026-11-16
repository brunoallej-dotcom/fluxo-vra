# Implementation waves — Autenticação multiusuário (Fase 1)

> Spec de origem: [`docs/specs/autenticacao-multiusuario.md`](../specs/autenticacao-multiusuario.md).
> Este arquivo é a fonte da verdade do roadmap de ondas; a tabela do
> `NOTES.md` espelha a coluna Status.

## Pré-requisitos sequenciais

Rodam na sessão principal, nesta ordem, antes de qualquer frente paralela.

| Passo | Entrega | Status |
|------|---------|--------|
| S1 | Docs da Fase 1 e config do Claude Code commitados numa branch (as worktrees nascem do último commit) | ✅ |
| S2 | Urgente: cópia local dos dados de produção (só leitura); regras de contenção prontas e testadas, publicadas só com confirmação; backup/PITR decidido pelo dono do projeto | 🟡 |
| S3 | Onda 0 (abaixo) | ✅ |
| S4 | Interfaces congeladas na spec (§9): seletores da tela de login, modo emulador, fixture de usuários de teste | ✅ |

## Ondas

| Onda | Entrega | Depende de | Paralela com | Status |
|------|---------|------------|--------------|--------|
| 0 | Fundação: tooling Node, Firebase CLI, emuladores, `firestore.rules` de contenção + testes C01–C11, CI | S1 | — | ✅ |
| 1 | Login, gate de sessão, "Sair", "Esqueci minha senha", autosave só com sessão (`index.html`) | 0, S4 | 2, 4a | ⬜ |
| 2 | Regras do Firestore completas + testes R01–R13 (`firestore.rules`, `tests/rules/`) | 0, S4 | 1, 3, 4a | ⬜ |
| 3 | Pessoas dinâmicas, rotina por perfil, helper de escrita com auditoria, autosave só com alteração (`index.html`) | 1 | 2, 4a | ⬜ |
| 4a | Testes E2E E01–E08, escritos antes da implementação (`tests/e2e/`, `docs/how-to/`) | 0, S4 | 1, 2, 3 | ⬜ |
| 4b | Integração (E2E verde com 1+2+3+4a) e cutover em produção | 2, 3, 4a | — | ⬜ |

### Frentes paralelas

Depois de S1–S4, três frentes rodam ao mesmo tempo, cada uma em sua worktree:

| Frente | Ondas | Arquivos (exclusivos) | Executor sugerido |
|---|---|---|---|
| A | 1 → 3 | `index.html` | Sessão principal (caminho crítico, arquivo único de 4 800 linhas) + revisão do `code-reviewer` |
| B | 2 | `firestore.rules`, `tests/rules/` | Subagente em worktree + auditoria do `firestore-rules-auditor` |
| C | 4a | `tests/e2e/`, `docs/how-to/` | Subagente em worktree |

- Só a Onda 0 mexe em `package.json`, `package-lock.json`, `firebase.json`,
  `.firebaserc`, `vitest.config.ts`, `playwright.config.ts` e
  `tests/fixtures/`. Se uma frente precisar mudar algum deles, para e pede à
  sessão principal.
- Ordem de merge, um PR por vez: B quando estiver pronta (não muda produção),
  A onda por onda, C por último (os testes só passam com A e B).
- Nada que toque produção (MCP do Firebase, `firebase deploy`) roda em subagente.

## Onda 0 — Fundação

- **Objetivo**: deixar o repositório pronto para testar regras e o app contra os
  emuladores, e ter regras de contenção prontas para publicar, sem mexer no
  comportamento do app.
- **Escopo (slices/arquivos)**: `package.json` (devDependencies pinadas:
  `firebase-tools@15.36.0`, `@firebase/rules-unit-testing@6.0.0`,
  `firebase@13.3.0` — só para os testes, o app segue com o SDK 10.12.0 do CDN —,
  `vitest@5.1.0`, `@playwright/test@1.65.1`, `typescript@7.0.2`),
  `package-lock.json`, `firebase.json` (regras + emuladores auth 9099 /
  firestore 8080 / UI 4000; **hosting fica para quando Q2 for respondida**),
  `.firebaserc`, `firestore.rules` com as **regras de contenção** (spec §5.3),
  `tests/rules/containment.test.ts` (C01–C11), `tests/fixtures/users.json`
  (spec §9.3), `vitest.config.ts`, `playwright.config.ts`, `tsconfig.json`,
  `scripts/check-inline-js.mjs`, scripts npm (`check`, `test:rules`,
  `test:e2e`, `serve`), `.github/workflows/ci.yml` (actions pinadas por SHA,
  `permissions: contents: read`, gitleaks + `npm run check` + `npm run
  test:rules`). Os emuladores rodam com `--project demo-fluxo` (nunca tocam a
  produção).
- **Depende de / paralela com**: depende de S1; é a base de todas as outras.
- **Critérios de aceite**:
  - `npm ci` termina sem erro.
  - `npm run check` termina com código 0.
  - `npm run test:rules` termina com código 0 e a saída lista C01–C11 como passou.
  - `git ls-files | grep -E '\.env(\.local)?$|adminsdk|serviceAccount|^backups/'` não retorna nada.
- **Goal command**: `/goal npm ci && npm run check && npm run test:rules terminam com código 0, a saída lista C01 a C11 como passed e nenhum arquivo de segredo ou backup está versionado, stop after 5 tries`

## Onda 1 — Login e gate de sessão

- **Objetivo**: ninguém vê nem lê dados sem estar logado com perfil ativo.
- **Escopo (slices/arquivos)**: `index.html` — módulo Firebase (importa
  `firebase-auth.js` 10.12.0; modo emulador da spec §9.2), tela de login
  (substitui `whoOverlay`, com os seletores da spec §9.1),
  `onAuthStateChanged`, checagem de `fluxo_users/{uid}`, evento
  `fluxo-session-start`, boot do estado local adiado para depois da sessão,
  "Sair" (menu do usuário + mobile), limpeza de `fluxo_*`, unsubscribes
  guardados em `syncFromFirebase`, `iAmCeo()` negando por padrão, autosave só
  com sessão ativa. Cobre RF-01 a RF-05, RF-07 a RF-09, RF-13, RF-14 e a parte
  "sessão" do RF-16.
- **Depende de / paralela com**: depende da 0 e de S4. Paralela com a 2 e a 4a
  (arquivos disjuntos; contrato e seletores congelados).
- **Critérios de aceite**:
  - `npm run check` termina com código 0.
  - `grep -c "fluxo_me\|openWhoPicker\|chooseWho" index.html` retorna 0.
  - Os seletores da spec §9.1 existem no `index.html`.
  - Com os emuladores rodando e `index.html?emulator=1`: sem sessão aparece só o
    login; login de CEO mostra o dashboard e a CEO View; login de `staff` não
    mostra a CEO View; "Sair" volta ao login e o `localStorage` fica sem
    chaves `fluxo_*` além do tema (conferido pela skill `verify`).
- **Goal command**: `/goal npm run check termina com código 0, grep -c "fluxo_me\|openWhoPicker\|chooseWho" index.html imprime 0 e todos os data-testid da spec §9.1 aparecem no index.html, stop after 6 tries`

## Onda 2 — Regras do Firestore

- **Objetivo**: o banco só aceita membros ativos, com payload válido e rotina
  restrita ao dono.
- **Escopo (slices/arquivos)**: `firestore.rules` (substitui a contenção pela
  versão da spec §5.2), `tests/rules/*.test.ts` com os casos R01–R13 (os testes
  de contenção C01–C11 saem junto com as regras de contenção), seed a partir de
  `tests/fixtures/users.json`.
- **Depende de / paralela com**: depende da 0 e de S4. Paralela com a 1, a 3 e
  a 4a (arquivos disjuntos; o contrato compartilhado está congelado na v1).
- **Critérios de aceite**:
  - `npm run test:rules` termina com código 0 e executa os 13 casos R01–R13.
  - A saída dos testes lista cada ID (R01…R13) como passou.
  - As regras **não** são publicadas nesta onda.
- **Goal command**: `/goal npm run test:rules termina com código 0 e a saída lista R01 a R13 como passed, stop after 8 tries`

## Onda 3 — Pessoas dinâmicas e auditoria

- **Objetivo**: nenhuma pessoa fixa no código; toda gravação registra quem
  gravou; nenhuma aba antiga sobrescreve o trabalho dos outros sem ter mudado nada.
- **Escopo (slices/arquivos)**: `index.html` — `PEOPLE` carregado de
  `fluxo_users` (ativos/inativos, ordenação), avatar com cor do perfil ou da
  paleta, `routineKey()`/`loadRoutine()` pelo `routineId` do perfil, `hsWhoKey`
  com nomes dinâmicos, helper `fbWrite` usado por `saveState`, `saveMeetings`,
  `saveRoutine`, `saveClient` e pela migração legada, autosave só com alteração
  local pendente. Cobre RF-06, RF-10, RF-11, RF-12, RF-15 e a parte
  "alteração" do RF-16.
- **Depende de / paralela com**: depende da 1 (precisa da sessão e do perfil).
  Paralela com a 2 e a 4a (arquivos disjuntos). Não é paralela com a 1 porque as
  duas mexem no `index.html`.
- **Critérios de aceite**:
  - `npm run check` termina com código 0.
  - `grep -n "'Vinicius'" index.html` não retorna nada.
  - `grep -c "setDoc(" index.html` retorna 1 (só dentro de `fbWrite`).
  - No emulador, criar uma tarefa gera `fluxo/tasks` com `updatedBy` igual ao uid logado.
- **Goal command**: `/goal npm run check termina com código 0, grep "'Vinicius'" index.html não encontra nada e grep -c "setDoc(" index.html imprime 1, stop after 6 tries`

## Onda 4a — Testes E2E (test-first)

- **Objetivo**: os fluxos críticos de login descritos na spec viram testes
  executáveis antes da implementação terminar.
- **Escopo (slices/arquivos)**: `tests/e2e/*.spec.ts` (E01–E08, contra os
  emuladores, usando só os seletores da spec §9.1 e a fixture §9.3),
  `docs/how-to/cutover-login.md`, `docs/how-to/adicionar-pessoa.md`.
- **Depende de / paralela com**: depende da 0 e de S4. Paralela com a 1, a 2 e a
  3. Os testes nascem falhando e passam conforme a frente A avança.
- **Critérios de aceite**:
  - `npx playwright test --list` lista os 8 casos E01–E08.
  - Nenhum teste usa seletor fora da spec §9.1.
  - Os dois how-to existem e seguem a ordem do cutover da Onda 4b.
- **Goal command**: `/goal npx playwright test --list lista E01 a E08 e grep -c "data-testid" tests/e2e/*.spec.ts só encontra seletores da spec §9.1, stop after 5 tries`

## Onda 4b — Integração e cutover em produção

- **Objetivo**: provar o fluxo de ponta a ponta e ligar o login em produção sem
  derrubar ninguém.
- **Escopo (slices/arquivos)**: correções de integração entre as frentes;
  passos manuais no console do Firebase, feitos pelo dono do projeto (skill
  `auth-cutover`).
- **Depende de / paralela com**: depende da 2, da 3 e da 4a. Sequencial (envolve produção).
- **Critérios de aceite**:
  - `npm run test:e2e` termina com código 0 e executa E01–E08.
  - Checklist de cutover concluído **nesta ordem**:
    1. Backup agendado ou PITR ativado no Firestore.
    2. Provedor e-mail/senha ativado; cadastro público desativado; proteção
       contra enumeração de e-mail ativada.
    3. Domínio de hospedagem em "Domínios autorizados" (Q2).
    4. 4 contas criadas e 4 documentos `fluxo_users/{uid}` com `active: true`.
    5. `index.html` novo publicado e login testado pelas 4 pessoas (as regras de
       contenção já aceitam o formato novo — spec §5.3).
    6. Só então `firestore.rules` completo publicado, a partir da `main` com CI
       verde (`firebase deploy --only firestore:rules --project prod`).
    7. Teste negativo em produção: leitura sem login recebe `permission-denied`.
- **Goal command**: `/goal npm run test:e2e termina com código 0 e a saída lista E01 a E08 como passed, stop after 8 tries` (os passos de produção são manuais e ficam fora do goal loop)

## Notas de execução

- Ondas sequenciais rodam na sessão principal, uma branch/PR por onda
  (squash merge, Conventional Commits).
- Uma onda sequencial pode rodar como um **goal loop**: invoque o Goal command
  dela e deixe o avaliador manter a sessão presa aos critérios de aceite em vez
  de confiar em "parece pronto". Feche a onda com a skill `verify` antes de
  marcá-la como ✅.
- Grupos paralelos (A, B, C) rodam em worktrees isoladas — uma frente por agent,
  com os resultados mergeados um PR por vez.
- Quando uma onda terminar, marque-a como ✅ aqui E no `NOTES.md`, e então
  atualize o status atual do `NOTES.md` antes de encerrar a sessão.
