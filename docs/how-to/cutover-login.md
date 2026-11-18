# Como ligar o login em produção (cutover)

Para o dono do projeto. Este é o roteiro em papel da skill `auth-cutover`:
no Claude Code, escreva `/auth-cutover` e ele conduz os mesmos passos, um de
cada vez. Os passos de console (Firebase) são **seus**; o Claude explica,
espera você confirmar e só então segue.

> **ATENÇÃO — a ordem importa.**
> Publicar as regras do banco (`firestore.rules`) **antes** do `index.html`
> novo **derruba o app para todos**: o app antigo não sabe fazer login, então
> as regras novas passam a bloquear tudo. Faça os passos na ordem abaixo e
> **não pule nenhum**. As regras são o penúltimo passo (6), nunca antes.

## Antes de começar (tudo isto precisa estar certo)

- As Ondas 1, 2 e 3 estão marcadas como concluídas em
  `docs/plan/implementation-waves.md`.
- Os testes estão verdes **agora**: peça ao Claude para rodar
  `npm run test:rules` e `npm run test:e2e` e mostrar o resultado.
- Os deploys saem da `main`, com a verificação automática (CI) verde no
  último commit.
- As perguntas Q1 (4ª pessoa: Luiza) e Q2 (hospedagem: Firebase Hosting em
  `crm.somosvra.com.br`) já estão respondidas no `NOTES.md`.
- Você tem em mãos o e-mail de cada uma das 4 pessoas (pode ser corporativo ou
  pessoal; o acesso é controlado pelo app, não pelo tipo de e-mail).

## Passo a passo (nesta ordem)

### 1. Backup do Firestore

- **O que fazer:** deixar um backup agendado (ou recuperação a qualquer
  momento, o PITR) ativo no Firestore, no console do Firebase.
- **Por que primeiro:** depois do login, uma pessoa da equipe ainda consegue
  sobrescrever as tarefas inteiras (limitação da Fase 1). Sem backup, não há
  volta fácil.
- **Atenção:** o plano gratuito (Spark) não oferece backup agendado nem PITR.
  Se o backup ainda não estiver decidido, **pare aqui** e resolva antes
  (veja "Riscos conhecidos" no `NOTES.md`). Além disso, peça ao Claude uma
  cópia local fresca dos dados (pasta `backups/`, que não vai para o git).
  No cutover de 2026-11-18 a decisão foi seguir só com a cópia local fresca e
  montar o backup diário pelo GitHub Actions logo depois (`NOTES.md`, decisões).
- **Confirme antes de seguir:** o backup existe e você sabe restaurá-lo.

### 2. Login por e-mail e senha (Authentication)

No console do Firebase, projeto `fluxo-app-59174`, menu Authentication:

1. Aba **Sign-in method** (Método de login): ative **E-mail/senha** e salve.
2. **Configurações → Ações do usuário**: desative o **cadastro público**
   (para ninguém criar conta sozinho). Os nomes exatos dos botões podem variar
   um pouco no console.
3. Na mesma tela, confirme que a **proteção contra enumeração de e-mail**
   está ligada (em projetos novos já vem ligada). Ela impede que alguém
   descubra quem tem conta.
4. **Configurações → Política de senha**: modo **Exigir a aplicação** e
   tamanho mínimo **10**, sem exigir maiúscula, número ou símbolo (senha longa
   protege mais e é mais fácil de lembrar).

### 3. Domínio autorizado

- Authentication → **Configurações → Domínios autorizados**: confirme que
  `crm.somosvra.com.br` está na lista (o `localhost` já vem).
- O domínio já é servido pelo Firebase Hosting (spec de hospedagem, §4): sem
  isso o login não funciona nele.

### 4. Contas e perfis das 4 pessoas

- Para cada pessoa: crie a conta em Authentication → Users (senha aleatória
  longa; **você não precisa saber a senha**, ela vai criar a própria no passo
  5) e crie o documento `fluxo_users/{uid}` com `active: true`.
- O passo a passo detalhado, campo a campo, está em
  [`adicionar-pessoa.md`](adicionar-pessoa.md). As 4 pessoas e seus dados
  estão na tabela da spec, seção 1 (Bruno, Júlia, Vinicius e Luiza).
- **Confirme antes de seguir:** 4 contas no Auth e 4 documentos em
  `fluxo_users`, todos com `active: true`, e o ID de cada documento é
  **idêntico** ao UID da conta correspondente.

### 5. Publicar o `index.html` novo e testar o login

**5a. Publicar.** Com a `main` e a verificação automática verde, o Claude roda:

```bash
npx firebase deploy --only hosting --project prod
```

Esse comando mexe em produção: o Claude só roda depois do seu "sim" explícito.
Nesta etapa as regras do banco **ainda são as de contenção**, que já aceitam
o formato novo; por isso o app novo funciona normalmente.

**5b. Primeiro acesso das 4 pessoas.** Cada uma:

1. abre `https://crm.somosvra.com.br`;
2. digita o e-mail e clica em **Esqueci minha senha**;
3. abre o e-mail (veja também o spam), cria a própria senha e volta para entrar.

**Confirme antes de seguir:** as 4 pessoas entraram. Os dois CEOs veem a
"CEO View"; Vinicius e Luiza não. Se alguém aparecer com "Seu acesso ainda não
foi liberado", falta ou está errado o perfil dela (passo 4).

### 6. Publicar as regras completas

Só agora. O Claude:

1. mostra a diferença (diff) do `firestore.rules`;
2. espera o seu "sim" explícito;
3. a partir da `main` com a verificação verde, roda:

```bash
npx firebase deploy --only firestore:rules --project prod
```

### 7. Teste negativo e conferência final

- Sem login, uma leitura do banco tem de ser recusada (`permission-denied`, no
  navegador, ou erro 403 numa consulta direta). O Claude faz essa leitura, só de
  leitura, e mostra o resultado.
- Com login, cada papel vê o que deve: CEO View só para `ceo`; criar uma tarefa
  funciona para todos.

## Se der errado

| Sintoma | O que fazer |
|---|---|
| O app quebrou depois do passo 6 | Console → Firestore → **Regras** → histórico: republique a versão anterior. Depois peça ao Claude para investigar com o agent `firestore-rules-auditor`. **Não** reverta só o app: com as regras novas no ar, o app antigo não funciona. |
| Dados sobrescritos ou sumidos | Restaure pelo backup do passo 1. |
| Alguém não consegue entrar | Confira o perfil dela (`active: true`, ID igual ao UID) e se o domínio está autorizado (passo 3). |
| O e-mail de nova senha não chega | Veja o spam; confirme que o e-mail da conta no Auth está certo. |

## Ao terminar

Peça ao Claude para: marcar a Onda 4 como concluída em
`docs/plan/implementation-waves.md` e no `NOTES.md`, registrar a data do
cutover no diário e remover o item "Banco aberto em produção" dos riscos.

## Correspondência com a skill `auth-cutover` e o plano

Este roteiro segue a lista da Onda 4b do plano. A skill divide em mais passos:

| Este roteiro | Skill `auth-cutover` | Onda 4b |
|---|---|---|
| 1. Backup | 1 | 1 |
| 2. Login por e-mail e senha | 2 | 2 |
| 3. Domínio autorizado | 3 | 3 |
| 4. Contas e perfis | 4 | 4 |
| 5a. Publicar o `index.html` | 5 | 5 |
| 5b. Primeiro acesso | 6 | 5 ("login testado pelas 4 pessoas") |
| 6. Publicar as regras | 7 | 6 |
| 7. Teste negativo e conferência | 8 | 7 |
