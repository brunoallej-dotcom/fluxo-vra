# ADR-0001 — Firebase Authentication com e-mail e senha

- **Status**: proposed
- **Data**: 2026-11-16
- **Spec**: [docs/specs/autenticacao-multiusuario.md](../specs/autenticacao-multiusuario.md)

## Contexto

O Fluxo é um `index.html` único, sem build e sem servidor próprio, que grava os
dados no Cloud Firestore (projeto `fluxo-app-59174`). Vai passar de uso pessoal
para uso da empresa: 4 pessoas (2 CEOs e 2 na equipe).

Hoje não há autenticação. A identidade é escolhida no navegador e as regras do
Firestore precisam estar abertas para o app funcionar, então os dados ficam
acessíveis a qualquer pessoa que conheça o ID do projeto (que é público).

Opções avaliadas:

1. **Firebase Authentication, e-mail e senha.** Já está no mesmo projeto e SDK;
   gratuito nesse volume; integra direto com as Security Rules
   (`request.auth.uid`); sem servidor.
2. **Firebase Authentication com Google.** Ainda mais simples (sem senha para
   gerenciar), mas exige que todos tenham conta Google e foi pedido login e senha.
3. **Backend próprio (ou Supabase) com sessão.** Exige servidor ou migração do
   banco; desproporcional para 4 pessoas.

## Decisão

Usar **Firebase Authentication com e-mail e senha** e um perfil por usuário em
`fluxo_users/{uid}` (papel `ceo` ou `staff`, `active`), escrito só pelo console.

- Cadastro público desativado; contas criadas pelo dono do projeto no console.
- Primeiro acesso por "Esqueci minha senha", para ninguém conhecer a senha alheia.
- A autorização mora nas Firestore Security Rules, versionadas em
  `firestore.rules` e testadas no emulador. A interface só esconde o que a
  pessoa não pode usar.
- Mesmo SDK e mesma versão já usados no app (`10.12.0`, CDN `gstatic`).

## Consequências

**Positivas**
- Identidade real por pessoa; papel e acesso controlados por quem administra o projeto.
- Regras deny-by-default fecham o acesso público ao banco.
- Sem servidor novo, sem custo novo, sem build.
- Abre caminho para Google login ou App Check sem trocar a base.

**Negativas / riscos**
- Administração de contas é manual no console (aceitável para 4 pessoas; uma tela
  de administração exigiria Cloud Functions com Admin SDK).
- Enquanto tarefas e reuniões ficarem num documento único, um membro ainda
  consegue sobrescrever tudo: mitigado por backups e `updatedBy`, resolvido na
  Fase 2.
- A ordem do cutover importa: publicar as regras antes do `index.html` novo
  derruba o app em produção.
