# Spec — Autenticação multiusuário (login e senha por pessoa)

- **Status**: proposta (aguardando revisão)
- **Data**: 2026-11-16
- **Fase**: 1 de 2 (a Fase 2 — um documento por tarefa — terá spec própria)
- **Contrato de dados**: [`contracts/openapi.v1.yaml`](../../contracts/openapi.v1.yaml)
- **Decisão arquitetural**: [ADR-0001](../adr/0001-firebase-auth-email-senha.md)
- **Plano de ondas**: [`docs/plan/implementation-waves.md`](../plan/implementation-waves.md)

## 1. Visão geral

O Fluxo é um dashboard de produtividade (tarefas, agenda, kanban, health score de
clientes, CEO View, rotina e relatórios) em um único `public/index.html`, com dados no
Firebase Firestore. Foi feito para uso pessoal e agora vai ser usado pela empresa.

**Problema.** Hoje não existe autenticação:

- A identidade é escolhida numa tela "quem é você?" e gravada em
  `localStorage.fluxo_me`. Qualquer pessoa pode se passar por qualquer outra.
- As pessoas estão fixas no código (`PEOPLE`, cores de avatar no CSS, `'Vinicius'`
  e `'Bruno'` espalhados como padrão).
- `iAmCeo()` devolve `true` quando ninguém foi escolhido (permissão por padrão).
- Como não há login, as regras do Firestore precisam estar abertas para o app
  funcionar. O ID do projeto é público (está no HTML), então qualquer pessoa
  consegue ler, alterar ou apagar todos os dados da empresa.

**Objetivo.** Cada pessoa entra com o próprio e-mail e senha; o banco só aceita
leituras e gravações de quem está logado e cadastrado como membro ativo; a
identidade e o papel (CEO ou equipe) vêm da conta, nunca do navegador.

**Usuários iniciais (4):**

| `personId` | Nome | Papel (`role`) | Título | `routineId` |
|---|---|---|---|---|
| `Bruno` | Bruno | `ceo` | Operacional | `routine` |
| `Julia` | Júlia | `ceo` | Estratégia | `routine` |
| `Vinicius` | Vinicius | `staff` | Equipe | `routine_Vinicius` |
| `Luiza` | Luiza | `staff` | Equipe | `routine_Luiza` |

O `personId` é igual ao valor que as tarefas já gravam em `owner`, então os dados
existentes não precisam de migração.

**Fora do escopo desta fase:** um documento por tarefa, histórico de alterações,
permissões finas por tarefa, tela de administração de usuários dentro do app,
login com Google, multiempresa.

## 2. Requisitos

### 2.1 Funcionais

| ID | Requisito |
|---|---|
| RF-01 | A tela de login (e-mail + senha) é a primeira coisa exibida. Nenhum dado (tarefas, reuniões, clientes, rotina) é lido do Firestore nem renderizado a partir do cache local antes de a autenticação terminar e o perfil ser validado. |
| RF-02 | Falha de login mostra sempre a mesma mensagem genérica: "E-mail ou senha inválidos." Não revela se o e-mail existe. |
| RF-03 | "Esqueci minha senha" chama `sendPasswordResetEmail` e mostra sempre a mesma mensagem neutra: "Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha." |
| RF-04 | Depois do login, o app lê `fluxo_users/{uid}`. Se o documento não existir ou `active !== true`, faz `signOut` e mostra "Seu acesso ainda não foi liberado. Fale com um CEO." |
| RF-05 | `me()` passa a vir do perfil do usuário logado. A tela "quem é você?" (`openWhoPicker`/`chooseWho`) e a chave `localStorage.fluxo_me` deixam de existir. |
| RF-06 | A lista de pessoas (`PEOPLE`) é carregada de `fluxo_users`, ordenada por CEOs primeiro e depois por nome. Pessoas inativas continuam aparecendo como dono de tarefas antigas, mas não podem ser escolhidas como dono de tarefa nova. |
| RF-07 | Papel `ceo` vê a CEO View; papel `staff` não vê (comportamento atual mantido). Sem identidade, ninguém é CEO: `iAmCeo()` passa a negar por padrão. |
| RF-08 | Botão "Sair" na sidebar e no menu mobile: chama `signOut`, cancela todos os listeners do Firestore, apaga do `localStorage` as chaves `fluxo_*` (exceto `fluxo_theme` e `fluxo_theme_v2`) e volta para a tela de login. Se houver gravações pendentes (`SYNC.pending > 0`), pede confirmação antes. |
| RF-09 | A sessão continua aberta entre recarregamentos e abas (`browserLocalPersistence`) até a pessoa clicar em "Sair". Sair em uma aba leva todas as abas abertas de volta ao login. |
| RF-10 | A rotina usa o documento `fluxo/{routineId}` do perfil. Bruno e Júlia continuam compartilhando `routine`; a 4ª pessoa começa com a rotina vazia. Some o `'Vinicius'` fixo de `routineKey()` e `loadRoutine()`. |
| RF-11 | Toda gravação no Firestore inclui `updatedBy` (uid de quem gravou) e `updatedAt` (`serverTimestamp()`), por meio de um único helper de escrita. |
| RF-12 | O avatar de uma pessoa sem classe de cor no CSS usa a cor do perfil (`color`) ou, sem ela, uma cor da paleta padrão escolhida pelo `personId`. |
| RF-13 | Modo emulador para desenvolvimento e testes: em `localhost`, com `?emulator=1` na URL, o app usa o projeto `demo-fluxo` e conecta ao Auth Emulator (`127.0.0.1:9099`) e ao Firestore Emulator (`127.0.0.1:8080`). Fora de `localhost` o parâmetro é ignorado. Detalhes em §9.2. |
| RF-14 | Contas são criadas só pelo dono do projeto no console do Firebase, com o cadastro público desativado. No primeiro acesso a pessoa usa "Esqueci minha senha" para criar a própria senha; quem cria a conta nunca sabe a senha. |
| RF-15 | O parser de responsáveis do plano de ação (`hsWhoKey`, hoje com regex fixa para Bruno/Júlia/Vinicius) passa a reconhecer os nomes vindos de `fluxo_users`. |
| RF-16 | O salvamento automático (hoje `setInterval(saveState, 30000)`, que regrava o documento inteiro de tarefas a cada 30 s em cada aba aberta) só roda com sessão ativa (Onda 1) e só grava quando houver alteração local ainda não salva (Onda 3). Uma aba esquecida aberta não pode sobrescrever o trabalho dos outros. |

### 2.2 Não funcionais

| ID | Requisito |
|---|---|
| RNF-01 | **Deny by default no banco.** As regras do Firestore negam tudo que não estiver explicitamente liberado (ver §5.2). A proteção real está nas regras; esconder tela é só conveniência. |
| RNF-02 | **Sem dependência nova** além do módulo `firebase-auth.js` na **mesma versão** do SDK já usado (`10.12.0`), carregado do mesmo CDN `gstatic`. |
| RNF-03 | **Sem PII em logs.** `console.error` registra só o código do erro (`e.code`), nunca e-mail, senha ou token. |
| RNF-04 | **LGPD — minimização.** O perfil guarda nome, papel e título; o e-mail fica só no Firebase Auth. Desligar alguém = `active: false` (efeito imediato pelas regras) e, se pedido, exclusão da conta no console. |
| RNF-05 | **Proteção do login.** Usa a proteção nativa do Firebase Auth contra força bruta. A opção "Email enumeration protection" precisa estar ativada no console. App Check fica como evolução. |
| RNF-06 | **Recuperação.** Backups agendados (ou PITR) do Firestore ativados antes do cutover, porque um membro ainda consegue sobrescrever `fluxo/tasks` inteiro nesta fase. |
| RNF-07 | **Desempenho.** Do clique em "Entrar" até o dashboard renderizado: < 3 s numa conexão comum. |
| RNF-08 | **Compatibilidade.** Dados atuais continuam válidos sem migração; o formato `{ data: "<JSON>" }` dos documentos é mantido, só ganha os campos de auditoria. |

## 3. Design técnico

### 3.1 Componentes

- **Firebase Authentication (e-mail/senha)** — identidade. Ver ADR-0001.
- **`fluxo_users/{uid}`** — perfil e papel, escrito só pelo console.
- **Firestore Security Rules** — versionadas em `firestore.rules` (IaC), com
  testes no emulador. Fonte de verdade da autorização.
- **`index.html`** — tela de login, gate de sessão, helper de escrita, `PEOPLE`
  dinâmico.

### 3.2 Fluxo de sessão

```
carrega index.html
  └─ módulo Firebase: initializeApp → getAuth + getFirestore
       └─ (localhost && ?emulator=1) → connectAuthEmulator / connectFirestoreEmulator
  └─ onAuthStateChanged(user)
       ├─ user == null → mostra login; encerra listeners; limpa estado em memória
       └─ user != null → getDoc(fluxo_users/{uid})
            ├─ não existe / active != true → signOut + mensagem (RF-04)
            └─ ok → window._session = { uid, profile }
                    carrega PEOPLE (fluxo_users)
                    dispara 'fluxo-session-start'
                         └─ applyIdentity() → syncFromFirebase() (guarda os unsubscribes)
```

- O evento `firebase-ready` deixa de iniciar a sincronização; quem inicia é
  `fluxo-session-start`.
- `syncFromFirebase()` guarda o retorno de cada `onSnapshot` para que "Sair"
  (ou perda de acesso) cancele todos.
- Um `permission-denied` num listener com sessão aberta é tratado como acesso
  revogado: `signOut` + mensagem "Seu acesso foi encerrado."
- O boot que hoje lê `localStorage` (`loadState`, `meetings`, `clients`, rotina)
  só roda depois de `fluxo-session-start`.

### 3.3 Helper de escrita

As quatro gravações atuais (`saveState`, `saveMeetings`, `saveRoutine`,
`saveClient`) passam a usar um único helper:

```js
// Grava { data, updatedBy, updatedAt } — formato exigido pelas regras (§5.2)
function fbWrite(path, value) {
  const { db, doc, setDoc, serverTimestamp } = window._fb;
  return syncTrack(setDoc(doc(db, ...path), {
    data: JSON.stringify(value),
    updatedBy: window._session.uid,
    updatedAt: serverTimestamp(),
  }));
}
```

Sempre o documento inteiro (`setDoc` com os três campos, com ou sem
`{merge: true}`): um `updateDoc` só de `data` herda o `updatedBy`/`updatedAt`
antigos e as regras negam (teste X15).

### 3.4 Threat model rápido (STRIDE)

| Ameaça | Hoje | Mitigação nesta fase |
|---|---|---|
| **S**poofing — agir como outra pessoa | Qualquer um escolhe a identidade | Firebase Auth; identidade e papel vêm de `fluxo_users/{request.auth.uid}` |
| **T**ampering — alterar dados sem acesso | Regras abertas | Regras exigem membro ativo; payload validado (chaves, tipo, tamanho); `fluxo_users` sem escrita pelo cliente |
| **R**epudiation — negar uma alteração | Sem registro | `updatedBy`/`updatedAt` exigidos pelas regras (registra o último autor; histórico completo fica para a Fase 2) |
| **I**nformation disclosure — ler dados da empresa | Qualquer um lê tudo | Leitura só para membros ativos; rotina só a do próprio perfil; "Sair" limpa o cache local; proteção contra enumeração de e-mail |
| **D**enial of service — apagar ou inflar dados | Qualquer um apaga | `delete` negado em `fluxo/*`; limite de tamanho do payload; backups agendados (RNF-06) |
| **E**levation of privilege — equipe virar CEO | `fluxo_me` editável no navegador | Papel só no perfil, que o cliente não consegue gravar |

**Risco residual aceito nesta fase:** um membro ativo ainda consegue sobrescrever
`fluxo/tasks` ou `fluxo/meetings` inteiros (o documento é único). Mitigado por
backups e `updatedBy`; resolvido na Fase 2 (um documento por item).

**Risco residual aceito nesta fase:** a CEO View é só de interface. As regras
não usam `role`: todo membro ativo lê os mesmos documentos que a CEO View
agrega (hoje tarefas, reuniões e clientes já são compartilhados por todos).
Um dado exclusivo de CEO, se surgir, precisa de documento próprio com regra
`get(profilePath()).data.role == 'ceo'`.

**Limite de tamanho:** `data.size() <= 900000` conta caracteres, não bytes. Com
acentos, o documento pode passar de 1 MiB antes desse limite; aí o Firestore
recusa com um erro que não é `permission-denied` (tratado pelo `syncTrack`).

## 4. Modelo de dados

Detalhe completo dos campos em [`contracts/openapi.v1.yaml`](../../contracts/openapi.v1.yaml).

| Caminho | Conteúdo | Quem lê | Quem grava |
|---|---|---|---|
| `fluxo_users/{uid}` (**novo**) | `UserProfile` | membros ativos (todos os perfis); qualquer usuário logado lê **só o próprio** (para o RF-04) | só o console (cliente: nunca) |
| `fluxo/tasks` | `StoredDocument` com `Task[]` em `data` | membros ativos | membros ativos (sem `delete`) |
| `fluxo/meetings` | `StoredDocument` com `Meeting[]` | membros ativos | membros ativos (sem `delete`) |
| `fluxo/{routineId}` | `StoredDocument` com `Routine` | dono do `routineId` | dono do `routineId` (sem `delete`) |
| `fluxo_clients/{clientId}` | `StoredDocument` com `Client` | membros ativos | membros ativos (inclui `delete`, ver Q3) |

`UserProfile`:

```json
{
  "personId": "Vinicius",
  "name": "Vinicius",
  "initial": "V",
  "role": "staff",
  "title": "Equipe",
  "routineId": "routine_Vinicius",
  "color": "#2F6FED",
  "active": true
}
```

## 5. Contratos

### 5.1 API HTTP

O app não tem API HTTP própria: o navegador fala direto com o Firestore e o
Firebase Auth pelos SDKs do Google. O contrato versionado é o **formato dos
documentos** (`contracts/openapi.v1.yaml`, OpenAPI 3.1 só com `components`).
Mudança de formato = nova versão do contrato + nota de compatibilidade.

### 5.2 Regras do Firestore (rascunho para a Onda 2)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function profilePath() {
      return /databases/$(database)/documents/fluxo_users/$(request.auth.uid);
    }
    function isMember() {
      return signedIn() && exists(profilePath()) && get(profilePath()).data.active == true;
    }
    function validPayload() {
      let d = request.resource.data;
      return d.keys().hasOnly(['data', 'updatedBy', 'updatedAt'])
        && d.data is string
        && d.data.size() <= 900000
        && d.updatedBy == request.auth.uid
        && d.updatedAt == request.time;
    }

    match /fluxo_users/{uid} {
      // O próprio usuário lê o próprio perfil (o app decide o RF-04 por
      // "não existe / active != true"); membros ativos leem e listam todos (RF-06).
      allow get: if signedIn() && (request.auth.uid == uid || isMember());
      allow list: if isMember();
      allow write: if false;            // só pelo console
    }

    match /fluxo/{docId} {
      function allowedDoc() {
        return docId in ['tasks', 'meetings'] || docId == get(profilePath()).data.routineId;
      }
      allow read: if isMember() && allowedDoc();
      allow create, update: if isMember() && allowedDoc() && validPayload();
      allow delete: if false;
    }

    match /fluxo_clients/{clientId} {
      allow read: if isMember();
      allow create, update: if isMember() && validPayload();
      allow delete: if isMember();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### 5.3 Regras de contenção (provisórias, antes do login)

Em 2026-11-16 as regras de produção eram `allow read, write: if true` para
todo o banco. Até o cutover, valem regras de contenção que **o app atual
continua respeitando** e que reduzem o estrago possível:

- só existem `fluxo/{tasks|meetings|routine|routine_<id>}` e `fluxo_clients/{id}`;
  qualquer outro caminho é negado;
- gravação só no formato `{ data: string }` (até 900 000 caracteres), aceitando
  também `updatedBy` (string) e `updatedAt` (timestamp) para a transição — a
  **autoria** desses campos só passa a ser garantida pelas regras completas
  (§5.2), porque antes do login qualquer um pode preenchê-los;
- `delete` proibido em `fluxo/*` (o app só apaga clientes);
- `fluxo_users/*` legível só por quem está logado, nunca gravável pelo cliente
  (o `index.html` novo lê o perfil durante o passo 5 do cutover, com estas
  regras ainda no ar).

**Limite:** a leitura continua pública. Só o login (§5.2) resolve isso.

Testes no emulador (`tests/rules/containment.test.ts`), removidos na Onda 2
junto com as regras de contenção:

| ID | Caso | Esperado |
|---|---|---|
| C01 | Anônimo lê `fluxo/tasks` e lista `fluxo_clients` | permite (comportamento atual) |
| C02 | Anônimo grava `fluxo/tasks` com `{ data: "<json>" }` | permite |
| C03 | Gravação com chave extra além de `data`/`updatedBy`/`updatedAt` | nega |
| C04 | Gravação com `data` que não é string ou acima de 900 000 caracteres | nega |
| C05 | Apagar `fluxo/tasks` ou `fluxo/meetings` | nega |
| C06 | Ler ou gravar coleção fora da lista (ex.: `hack/x`) | nega |
| C07 | Gravar `fluxo/<id fora da lista>` | nega |
| C08 | Apagar `fluxo_clients/{id}` | permite |
| C09 | Ler e gravar `fluxo/routine` e `fluxo/routine_Vinicius` | permite |
| C10 | Gravar `{ data, updatedBy, updatedAt }` (formato da Fase 1) | permite |
| C11 | `fluxo_users/*`: logado lê; anônimo não lê; ninguém grava | conforme descrito |

## 6. Edge cases e tratamento de erros

| Situação | Comportamento esperado |
|---|---|
| Sem internet no login (`auth/network-request-failed`) | "Sem conexão com a internet. Tente de novo." |
| SDK do Firebase bloqueado (rede, antivírus, extensão) | A tela de login mostra "Não foi possível carregar o Firebase." e o formulário fica desabilitado; nada de dados locais. |
| Muitas tentativas (`auth/too-many-requests`) | "Muitas tentativas. Aguarde alguns minutos ou redefina a senha." |
| Conta desativada no Auth (`auth/user-disabled`) | Mesma mensagem genérica do RF-02. |
| Login ok, perfil ausente ou inativo | RF-04. |
| Login ok, mas a leitura do próprio perfil falha (`permission-denied`, rede) | `signOut` + "Não foi possível verificar seu acesso. Tente de novo." Nunca a mensagem do RF-04: `permission-denied` aqui indica regra errada ou publicada fora de ordem, não falta de acesso. |
| Perfil desativado com a sessão aberta | O próximo snapshot ou gravação recebe `permission-denied` → `signOut` + "Seu acesso foi encerrado." |
| Redefinição para e-mail inexistente | Mesma mensagem neutra do RF-03. |
| "Sair" com gravações pendentes | Confirmação: "Há alterações ainda não sincronizadas. Sair mesmo assim?" |
| Duas abas abertas, "Sair" numa | `onAuthStateChanged` dispara na outra, que também volta ao login. |
| Tarefa com `owner` que não está em `fluxo_users` | Mostra o próprio `owner` como nome e avatar "?" (comportamento atual de `ownerName`). |
| Duas pessoas salvam `fluxo/tasks` quase ao mesmo tempo | A última gravação vence (limitação conhecida, Fase 2). |
| Payload acima do limite das regras | A gravação falha e o indicador de sincronização mostra o erro (fluxo atual do `syncTrack`). |
| Migração legada (`hsMigrateLegacyTasks`) | Só roda depois de `fluxo-session-start`, com o helper de escrita. |

## 7. Plano de testes

### 7.1 Regras (unitário, Firestore Emulator)

Ferramentas: `@firebase/rules-unit-testing` + `vitest`, rodando via
`firebase emulators:exec`. Comando: `npm run test:rules`.

| ID | Caso | Esperado |
|---|---|---|
| R01 | Anônimo lê `fluxo/tasks` | nega |
| R02 | Logado sem perfil lê `fluxo/tasks` | nega |
| R03 | Logado com `active: false` lê `fluxo/tasks` | nega |
| R04 | Membro ativo lê `fluxo/tasks`, `fluxo/meetings`, `fluxo_clients/*` | permite |
| R05 | Membro grava `fluxo/tasks` com payload válido | permite |
| R06 | Membro grava sem `updatedBy`, com `updatedBy` de outro uid ou com `updatedAt` diferente de `request.time` | nega |
| R07 | Membro grava com chave extra ou `data` acima de 900 000 caracteres | nega |
| R08 | Membro apaga `fluxo/tasks` | nega |
| R09 | Membro lê/grava a rotina do próprio `routineId` | permite |
| R10 | Membro lê/grava a rotina de outro `routineId` | nega |
| R11 | Qualquer cliente grava em `fluxo_users/*` (inclusive o próprio) | nega |
| R12 | Membro lê/grava coleção não listada | nega |
| R13 | Membro apaga `fluxo_clients/{id}` | permite (até decidir Q3) |

### 7.2 Ponta a ponta (Playwright contra os emuladores)

`index.html` servido em `http://localhost:<porta>/?emulator=1`, com usuários de
teste semeados no Auth/Firestore Emulator. Comando: `npm run test:e2e`.

| ID | Caso | Esperado |
|---|---|---|
| E01 | Abrir o app sem sessão | Só a tela de login; nenhum elemento de dados visível; nenhuma leitura no Firestore |
| E02 | Senha errada | Mensagem genérica do RF-02 |
| E03 | Login de CEO | Dashboard com "…, Bruno."; item "CEO View" visível |
| E04 | Login de `staff` | Dashboard; "CEO View" ausente na sidebar e no menu mobile |
| E05 | Login de usuário sem perfil | Volta ao login com a mensagem do RF-04 |
| E06 | "Sair" | Volta ao login; `localStorage` sem chaves `fluxo_*` exceto tema |
| E07 | "Esqueci minha senha" | Mensagem neutra do RF-03 (e-mail aparece no emulador) |
| E08 | Criar tarefa logado | Documento `fluxo/tasks` no emulador com `updatedBy` = uid do usuário |

### 7.3 Manual (cutover em produção)

Checklist da Onda 4 em `docs/plan/implementation-waves.md`.

## 8. Questões em aberto

| ID | Pergunta | Proposta enquanto não houver resposta |
|---|---|---|
| Q1 | ~~Nome e `personId` da 4ª pessoa (equipe)?~~ | **Resolvida (2026-11-16):** Luiza (`personId: Luiza`, `routine_Luiza`) |
| Q2 | ~~Onde o `index.html` está hospedado hoje?~~ | **Resolvida (2026-11-16):** hoje Hostinger em `crm.somosvra.com.br`; vai para o Firebase Hosting ([spec](hospedagem.md), ADR-0002). Adicionar `crm.somosvra.com.br` aos domínios autorizados do Auth no cutover |
| Q3 | A equipe pode excluir clientes? Hoje pode. | Manter como está nesta fase |
| Q4 | As contas usam e-mail corporativo ou pessoal? | Qualquer e-mail; o acesso é controlado por `fluxo_users` |
| Q5 | Precisa de "Manter conectado" (sessão só da aba) para computador compartilhado? | Fora do MVP |
| Q6 | A rotina de Bruno e Júlia continua compartilhada? | Sim (`routineId: routine` para os dois) |

## 9. Interfaces congeladas

Combinados que as frentes paralelas (A: `index.html`, B: regras, C: testes E2E)
usam sem conversar entre si. Mudar qualquer item exige atualizar esta seção
**antes**, na sessão principal, e avisar as frentes.

### 9.1 Seletores da interface (`data-testid`)

Os testes E2E usam só estes seletores. A frente A garante que existam com
este significado; pode haver mais de um elemento com `logout` (menu do usuário
e mobile), e o teste clica no visível.

| `data-testid` | Elemento | Observação |
|---|---|---|
| `login-screen` | Contêiner da tela de login | Visível sem sessão; oculto com sessão |
| `login-form` | `<form>` de login | |
| `login-email` | `<input type="email">` | |
| `login-password` | `<input type="password">` | |
| `login-submit` | Botão "Entrar" | |
| `login-error` | Mensagem de erro do login | Textos do RF-02, RF-04 e da §6 |
| `login-forgot` | Botão/link "Esqueci minha senha" | Usa o e-mail digitado em `login-email` |
| `login-info` | Mensagem neutra da redefinição | Texto do RF-03 |
| `app-shell` | Contêiner do app (sidebar + páginas) | Oculto sem sessão |
| `logout` | Botão "Sair" | Menu do usuário e mobile |
| `nav-ceo` | Item de navegação da CEO View | Sidebar e barra mobile; ausente ou oculto para `staff` |
| `greeting` | Saudação do dashboard (hoje `#dashGreeting`) | Contém o `name` do perfil |

### 9.2 Modo emulador

- Ativado só quando `location.hostname === 'localhost'` **e** a URL tem
  `?emulator=1`.
- O app troca o `projectId` para `demo-fluxo` (prefixo `demo-`: o Firebase
  garante que nada chega à produção) e conecta:
  `connectAuthEmulator(auth, 'http://127.0.0.1:9099')` e
  `connectFirestoreEmulator(db, '127.0.0.1', 8080)`.
- Os scripts de teste sobem os emuladores com `--project demo-fluxo`.
- Porta do servidor local do app: `5500` (`http://localhost:5500`).

### 9.3 Fixture de usuários de teste

Arquivo `tests/fixtures/users.json`, usado pelas regras (perfis) e pelos E2E
(contas + perfis). Senhas e e-mails existem só nos emuladores. O gitleaks
ignora este arquivo **só** para a regra `generic-api-key` (`.gitleaks.toml`,
issue #2); nunca coloque ali uma credencial real.

```json
[
  {
    "key": "ceo",
    "uid": "uid-ceo-bruno",
    "email": "bruno@fluxo.test",
    "password": "<senha-só-do-emulador>",
    "profile": { "personId": "Bruno", "name": "Bruno", "initial": "B", "role": "ceo",
                 "title": "Operacional", "routineId": "routine", "active": true }
  }
]
```

| `key` | Situação | Usado em |
|---|---|---|
| `ceo` | Bruno, `ceo`, ativo | R04–R11, E03, E06–E08 |
| `ceo2` | Júlia, `ceo`, ativa, mesma rotina (`routine`) | R09 (rotina compartilhada) |
| `staff` | Vinicius, `staff`, ativo, `routine_Vinicius` | R10, E04 |
| `inactive` | Pessoa da equipe com `active: false` | R03 |
| `noprofile` | Conta no Auth **sem** documento em `fluxo_users` | R02, E05 |
