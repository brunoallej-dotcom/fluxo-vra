# Como adicionar (ou desativar) uma pessoa no Fluxo

Para o dono do projeto. Não existe tela de administração dentro do app: as
pessoas são cadastradas **por você, no console do Firebase**, em dois lugares:
a **conta** (e-mail e senha, no Authentication) e o **perfil** (nome, papel e
rotina, no Firestore). Console: <https://console.firebase.google.com>, projeto
`fluxo-app-59174`.

Quem cria a conta nunca precisa saber a senha: a própria pessoa cria a dela no
primeiro acesso.

## Passo a passo

### 1. Criar a conta (Authentication)

1. Authentication → aba **Users** → **Add user**.
2. Digite o e-mail da pessoa e uma senha **aleatória e longa**, com pelo menos
   10 caracteres, que é o mínimo da política de senha (use um gerador de
   senhas; não guarde nem envie essa senha a ninguém).
3. Depois de criada, copie o **UID** da conta (coluna "User UID").

### 2. Criar o perfil (Firestore)

1. Firestore Database → aba **Data**.
2. Abra (ou crie, na primeira vez) a coleção `fluxo_users`.
3. **Add document**. No campo **Document ID**, cole o **UID** da conta,
   **idêntico**, sem espaços. Se o ID for diferente, a pessoa entra mas vê
   "Seu acesso ainda não foi liberado".
4. Crie os campos abaixo. Atenção ao **tipo** de cada um:

| Campo | Tipo | O que colocar | Exemplo |
|---|---|---|---|
| `personId` | string | Identificador da pessoa: começa com letra, só letras, números e `_`, até 32 caracteres, **sem espaço nem acento**. É o mesmo valor que as tarefas gravam em "responsável". | `Luiza` |
| `name` | string | Nome que aparece na tela (1 a 60 caracteres; pode ter acento). | `Luiza` |
| `initial` | string | 1 ou 2 letras do avatar. | `L` |
| `role` | string | `ceo` (vê a CEO View) ou `staff` (equipe). Escreva exatamente assim, minúsculo. | `staff` |
| `title` | string | Cargo ou área exibido na tela (até 40 caracteres). | `Equipe` |
| `routineId` | string | Qual rotina a pessoa usa; veja a regra abaixo. | `routine_Luiza` |
| `active` | **boolean** | `true` para liberar o acesso. Escolha o tipo "boolean", não texto. | `true` |
| `color` | string (opcional) | Cor do avatar no formato `#RRGGBB`. Sem ela, o app escolhe uma cor da paleta. | `#2F6FED` |

Não crie campo de e-mail: o e-mail fica só no Authentication (privacidade).
O formato oficial dos campos está em `contracts/openapi.v1.yaml`
(`UserProfile`); campo a mais, faltando ou de tipo errado pode fazer o login
falhar para a pessoa.

### Regra do `routineId`

- Quem usa rotina própria: `routine_` seguido do `personId`. Exemplo:
  `routine_Vinicius`, `routine_Luiza`. A rotina começa vazia.
- Bruno e Júlia **compartilham** a rotina: os dois usam `routine`.
- O `routineId` precisa ser `routine` ou `routine_` + letras, números ou `_`.

### 3. Primeiro acesso da pessoa

1. Ela abre `https://crm.somosvra.com.br`.
2. Digita o e-mail e clica em **Esqueci minha senha**.
3. Abre o e-mail recebido (veja também o spam), cria a própria senha e entra.

Confira que ela entrou e que aparece o nome certo na saudação. Papel `ceo`
mostra a "CEO View"; `staff` não mostra.

## Dados das 4 pessoas iniciais

| `personId` | `name` | `role` | `title` | `routineId` |
|---|---|---|---|---|
| `Bruno` | Bruno | `ceo` | Operacional | `routine` |
| `Julia` | Júlia | `ceo` | Estratégia | `routine` |
| `Vinicius` | Vinicius | `staff` | Equipe | `routine_Vinicius` |
| `Luiza` | Luiza | `staff` | Equipe | `routine_Luiza` |

## Desativar uma pessoa

1. Firestore → `fluxo_users` → documento da pessoa → mude `active` para
   **`false`** (boolean).
2. O efeito é imediato: nas próximas leituras e gravações o banco recusa o
   acesso e o app mostra "Seu acesso foi encerrado." e volta ao login.
3. **Não apague** o documento do perfil se a pessoa tem tarefas antigas: o
   nome dela continua aparecendo nessas tarefas, mas ela deixa de poder ser
   escolhida como responsável de tarefas novas.
4. Se a pessoa pedir a exclusão dos dados (LGPD), apague também a **conta** em
   Authentication → Users. Isso é à parte e não desfaz a desativação.

Para reativar, volte `active` para `true`.

## Erros comuns

| Sintoma | Causa provável |
|---|---|
| "Seu acesso ainda não foi liberado. Fale com um CEO." | Não existe `fluxo_users/{uid}`, o ID do documento não é o UID da conta, ou `active` não é `true` (boolean). |
| Pessoa entra mas não vê a CEO View (ou vê sem dever) | O `role` está errado ou escrito diferente de `ceo`/`staff`. |
| Tarefas da pessoa aparecem com o avatar "?" | O `personId` do perfil é diferente do que as tarefas gravaram em "responsável". |
| Não consegue criar a senha pelo "Esqueci minha senha" | O e-mail da conta no Authentication está diferente do digitado. |
