---
name: firestore-rules
description: Edita, testa no emulador e (só com confirmação explícita) publica as Firestore Security Rules do Fluxo. Use quando o usuário pedir para criar ou mudar regras do Firestore, liberar ou restringir acesso a uma coleção, ou quando uma mudança no index.html passar a ler/gravar um caminho ou campo novo.
argument-hint: "[o que mudar nas regras]"
---

Mudança pedida nas regras: $ARGUMENTS

## Antes de editar

1. Leia a spec (`docs/specs/autenticacao-multiusuario.md` §4, §5.2 e §7.1) e o
   contrato (`contracts/openapi.v1.yaml`).
2. Se a mudança altera quem lê/grava o quê, atualize primeiro a tabela da spec
   §4 e, se mudar o formato de um documento, o contrato.
3. Se `firestore.rules`, `firebase.json` ou `package.json` ainda não existirem,
   a Onda 0 não foi feita: diga isso ao usuário e proponha fazê-la antes.

## Editar

- Mantenha deny-by-default: o `match /{document=**}` final nega tudo.
- Toda permissão começa por `isMember()`. Papel e identidade vêm de
  `fluxo_users/{request.auth.uid}`, nunca de campo enviado pelo cliente.
- Toda gravação de dados passa por `validPayload()`.
- Prefira `create`/`update`/`delete` separados a `write` quando os casos diferem.

## Testar (obrigatório)

1. Escreva ou ajuste os casos em `tests/rules/` **antes** da regra: um caso que
   deve passar e um que deve ser negado para cada mudança. Use o próximo ID livre
   (R14, R15…) e registre-o na spec §7.1.
2. Rode `npm run test:rules` (sobe o Firestore Emulator, roda os testes e derruba).
3. Só siga quando tudo estiver verde.
4. Peça ao agent `firestore-rules-auditor` uma auditoria do resultado.

## Publicar (só com confirmação)

- Nunca publique por conta própria. Mostre ao usuário o diff de `firestore.rules`,
  o resultado dos testes e o veredito do auditor, e pergunte se pode publicar.
- Na Fase 1, confira a ordem do cutover (Onda 4 do plano): o `index.html` que
  faz login e grava `updatedBy`/`updatedAt` precisa estar no ar **antes** das
  regras novas, senão o app para para todos.
- Com o "sim" explícito: `npx firebase deploy --only firestore:rules`.
- Depois: um teste negativo (leitura sem login deve dar `permission-denied`) e
  um positivo (login de um membro abre o dashboard).
