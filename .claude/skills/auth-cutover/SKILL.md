---
name: auth-cutover
description: Roteiro do cutover do login (Fase 1) em produção — liga o Firebase Auth e as regras do Firestore na ordem certa, sem derrubar o app. Use só quando o usuário invocar explicitamente para fazer o cutover.
disable-model-invocation: true
---

Conduza o cutover da Fase 1 com o usuário, um passo por vez. Os passos no
console do Firebase são feitos **pelo usuário**: você explica, espera ele
confirmar e só então segue.

## Pré-condições (pare se alguma falhar)

- Ondas 1, 2 e 3 marcadas como ✅ em `docs/plan/implementation-waves.md`.
- `npm run test:rules` e `npm run test:e2e` verdes agora (rode e mostre).
- Questões Q1 (4ª pessoa) e Q2 (hospedagem) respondidas no `NOTES.md`.

## Passos, nesta ordem

1. **Backup.** Usuário ativa backup agendado (ou PITR) do Firestore no console.
   Confirme antes de seguir: depois daqui não há volta fácil sem backup.
2. **Auth.** Usuário ativa o provedor "E-mail/senha", desativa o cadastro
   público (Authentication → Configurações → Ações do usuário) e confirma que a
   proteção contra enumeração de e-mail está ativa.
3. **Domínio.** O domínio onde o `index.html` é servido aparece em
   Authentication → Configurações → Domínios autorizados.
4. **Contas.** Usuário cria as 4 contas (senha aleatória longa) e, para cada uma,
   o documento `fluxo_users/{uid}` com os campos do contrato (`UserProfile`) e
   `active: true`. Ajude a montar os 4 documentos a partir da tabela da spec §1;
   o uid vem da lista de usuários do Auth.
5. **Publicar o `index.html` novo.** Pela hospedagem atual (Q2). Com as regras
   ainda abertas, o app novo já funciona.
6. **Primeiro acesso.** Cada pessoa usa "Esqueci minha senha", cria a própria
   senha e entra. Confirme as 4 antes de seguir.
7. **Publicar as regras.** Mostre o diff de `firestore.rules`, peça o "sim"
   explícito e rode `npx firebase deploy --only firestore:rules`.
8. **Conferir.** Sem login, uma leitura recebe `permission-denied`; com login,
   cada papel vê o que deve (CEO View só para `ceo`).

## Se der errado

- App quebrou depois do passo 7: republique a versão anterior das regras pelo
  histórico do console (Firestore → Regras) e investigue com o
  `firestore-rules-auditor`.
- Dados sobrescritos: restaure pelo backup do passo 1.

## Ao terminar

Marque a Onda 4 como ✅ no plano e no `NOTES.md`, registre a data do cutover no
diário e remova o item "Banco aberto em produção" dos riscos.
