// Testes das regras COMPLETAS do Firestore — docs/specs/autenticacao-multiusuario.md §5.2 e §7.1 (R01–R13).
// Substituem os testes de contenção (C01–C11), que saíram junto com as regras de contenção (Onda 2).
// Os casos X01… são bordas extras além da tabela da spec; R01–R13 seguem exatamente a tabela.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  setLogLevel,
  updateDoc,
} from 'firebase/firestore';
import { loadUsers, userByKey, type FixtureKey } from '../fixtures/users.ts';

// As recusas esperadas (assertFails) geram logs de PERMISSION_DENIED no SDK; silencia para a saída listar só os casos.
setLogLevel('silent');

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-fluxo',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

// Perfis "quebrados" (só para as bordas): o app nunca os cria, mas a regra precisa falhar fechada.
const BROKEN_NO_ACTIVE = 'uid-perfil-sem-active';
const BROKEN_ACTIVE_STRING = 'uid-perfil-active-texto';

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    // Perfis a partir da fixture (a conta `noprofile` fica sem documento de propósito).
    for (const user of loadUsers()) {
      if (user.profile) await setDoc(doc(db, `fluxo_users/${user.uid}`), user.profile);
    }
    const { active: _active, ...withoutActive } = userByKey('staff').profile!;
    await setDoc(doc(db, `fluxo_users/${BROKEN_NO_ACTIVE}`), withoutActive);
    await setDoc(doc(db, `fluxo_users/${BROKEN_ACTIVE_STRING}`), { ...userByKey('staff').profile!, active: 'true' });
    // Dados.
    await setDoc(doc(db, 'fluxo/tasks'), { data: '[]' });
    await setDoc(doc(db, 'fluxo/meetings'), { data: '[]' });
    await setDoc(doc(db, 'fluxo/routine'), { data: '[[],[],[],[],[],[],[]]' });
    await setDoc(doc(db, 'fluxo/routine_Vinicius'), { data: '[[],[],[],[],[],[],[]]' });
    await setDoc(doc(db, 'fluxo/routine_Luiza'), { data: '[[],[],[],[],[],[],[]]' }); // pessoa sem conta de teste
    await setDoc(doc(db, 'fluxo/routine_Inativo'), { data: '[[],[],[],[],[],[],[]]' });
    await setDoc(doc(db, 'fluxo/settings'), { data: '{}' });
    await setDoc(doc(db, 'fluxo_clients/1'), { data: '{}' });
    await setDoc(doc(db, 'fluxo_clients/2'), { data: '{}' });
    await setDoc(doc(db, 'hack/x'), { a: 1 });
  });
});

const anonDb = () => env.unauthenticatedContext().firestore();
const dbOf = (key: FixtureKey) => env.authenticatedContext(userByKey(key).uid).firestore();
const dbOfUid = (uid: string) => env.authenticatedContext(uid).firestore();

// Payload válido (§5.2): { data, updatedBy: uid de quem grava, updatedAt: serverTimestamp() }.
const validFor = (uid: string, data = '[]') => ({ data, updatedBy: uid, updatedAt: serverTimestamp() });
const valid = (key: FixtureKey, data = '[]') => validFor(userByKey(key).uid, data);

const EMPTY_ROUTINE = '[[],[],[],[],[],[],[]]';

describe('regras completas — tabela R01–R13 (spec §7.1)', () => {
  it('R01 anônimo lê fluxo/tasks → nega', async () => {
    await assertFails(getDoc(doc(anonDb(), 'fluxo/tasks')));
  });

  it('R02 logado sem perfil lê fluxo/tasks → nega', async () => {
    await assertFails(getDoc(doc(dbOf('noprofile'), 'fluxo/tasks')));
  });

  it('R03 logado com active:false lê fluxo/tasks → nega', async () => {
    await assertFails(getDoc(doc(dbOf('inactive'), 'fluxo/tasks')));
  });

  it('R04 membro ativo lê fluxo/tasks, fluxo/meetings e fluxo_clients/* → permite', async () => {
    for (const key of ['ceo', 'ceo2', 'staff'] as const) {
      const db = dbOf(key);
      await assertSucceeds(getDoc(doc(db, 'fluxo/tasks')));
      await assertSucceeds(getDoc(doc(db, 'fluxo/meetings')));
      await assertSucceeds(getDoc(doc(db, 'fluxo_clients/1')));
      await assertSucceeds(getDocs(collection(db, 'fluxo_clients'))); // o app assina a coleção inteira
    }
  });

  it('R05 membro grava fluxo/tasks com payload válido → permite', async () => {
    await assertSucceeds(setDoc(doc(dbOf('ceo'), 'fluxo/tasks'), valid('ceo', '[{"id":1}]')));
    await assertSucceeds(setDoc(doc(dbOf('staff'), 'fluxo/tasks'), valid('staff', '[{"id":2}]')));
  });

  it('R06 grava sem updatedBy, com updatedBy de outro uid ou com updatedAt ≠ request.time → nega', async () => {
    const ceo = userByKey('ceo');
    const other = userByKey('ceo2');
    const db = dbOf('ceo');
    const tasks = doc(db, 'fluxo/tasks');
    // sem updatedBy
    await assertFails(setDoc(tasks, { data: '[]', updatedAt: serverTimestamp() }));
    // updatedBy de outro uid (inclusive outro membro ativo)
    await assertFails(setDoc(tasks, { data: '[]', updatedBy: other.uid, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(dbOf('staff'), 'fluxo/tasks'), { data: '[]', updatedBy: ceo.uid, updatedAt: serverTimestamp() }));
    // updatedAt diferente de request.time (relógio do cliente no passado e no futuro)
    await assertFails(setDoc(tasks, { data: '[]', updatedBy: ceo.uid, updatedAt: Timestamp.fromDate(new Date('2020-01-01T00:00:00Z')) }));
    await assertFails(setDoc(tasks, { data: '[]', updatedBy: ceo.uid, updatedAt: Timestamp.fromDate(new Date('2099-01-01T00:00:00Z')) }));
    // controle: com serverTimestamp() e o próprio uid, a mesma gravação passa
    await assertSucceeds(setDoc(tasks, validFor(ceo.uid)));
  });

  it('R07 grava com chave extra ou data acima de 900 000 caracteres → nega', async () => {
    const tasks = doc(dbOf('ceo'), 'fluxo/tasks');
    await assertFails(setDoc(tasks, { ...valid('ceo'), extra: true }));
    await assertFails(setDoc(tasks, valid('ceo', 'x'.repeat(900_001))));
  });

  it('R08 membro apaga fluxo/tasks → nega', async () => {
    await assertFails(deleteDoc(doc(dbOf('ceo'), 'fluxo/tasks')));
    await assertFails(deleteDoc(doc(dbOf('staff'), 'fluxo/tasks')));
  });

  it('R09 membro lê e grava a rotina do próprio routineId → permite', async () => {
    // Bruno e Júlia compartilham `routine` (Q6); Vinicius tem a dele.
    for (const key of ['ceo', 'ceo2'] as const) {
      await assertSucceeds(getDoc(doc(dbOf(key), 'fluxo/routine')));
      await assertSucceeds(setDoc(doc(dbOf(key), 'fluxo/routine'), valid(key, EMPTY_ROUTINE)));
    }
    await assertSucceeds(getDoc(doc(dbOf('staff'), 'fluxo/routine_Vinicius')));
    await assertSucceeds(setDoc(doc(dbOf('staff'), 'fluxo/routine_Vinicius'), valid('staff', EMPTY_ROUTINE)));
  });

  it('R10 membro lê e grava a rotina de outro routineId → nega', async () => {
    // CEO na rotina da equipe e equipe na rotina dos CEOs, sempre com payload válido
    // (a recusa vem da posse da rotina, não do formato).
    await assertFails(getDoc(doc(dbOf('ceo'), 'fluxo/routine_Vinicius')));
    await assertFails(setDoc(doc(dbOf('ceo'), 'fluxo/routine_Vinicius'), valid('ceo', EMPTY_ROUTINE)));
    await assertFails(getDoc(doc(dbOf('staff'), 'fluxo/routine')));
    await assertFails(setDoc(doc(dbOf('staff'), 'fluxo/routine'), valid('staff', EMPTY_ROUTINE)));
    await assertFails(getDoc(doc(dbOf('staff'), 'fluxo/routine_Luiza')));
    await assertFails(setDoc(doc(dbOf('staff'), 'fluxo/routine_Luiza'), valid('staff', EMPTY_ROUTINE)));
  });

  it('R11 qualquer cliente grava em fluxo_users/* (inclusive o próprio) → nega', async () => {
    const ceo = userByKey('ceo');
    const staff = userByKey('staff');
    // o próprio perfil: alterar papel (escalada de privilégio), apagar
    await assertFails(setDoc(doc(dbOf('staff'), `fluxo_users/${staff.uid}`), { ...staff.profile!, role: 'ceo' }));
    await assertFails(updateDoc(doc(dbOf('staff'), `fluxo_users/${staff.uid}`), { role: 'ceo' }));
    await assertFails(setDoc(doc(dbOf('ceo'), `fluxo_users/${ceo.uid}`), { ...ceo.profile!, title: 'Outro' }));
    await assertFails(deleteDoc(doc(dbOf('ceo'), `fluxo_users/${ceo.uid}`)));
    // perfil de outra pessoa e criação de perfil novo
    await assertFails(setDoc(doc(dbOf('ceo'), `fluxo_users/${staff.uid}`), { ...staff.profile!, active: false }));
    await assertFails(setDoc(doc(dbOf('ceo'), 'fluxo_users/novo'), ceo.profile!));
    // sem perfil e anônimo não se auto-provisionam
    const noprofile = userByKey('noprofile');
    await assertFails(setDoc(doc(dbOf('noprofile'), `fluxo_users/${noprofile.uid}`), ceo.profile!));
    await assertFails(setDoc(doc(anonDb(), 'fluxo_users/novo'), ceo.profile!));
    // inativo não se reativa
    const inactive = userByKey('inactive');
    await assertFails(updateDoc(doc(dbOf('inactive'), `fluxo_users/${inactive.uid}`), { active: true }));
  });

  it('R12 membro lê e grava coleção não listada → nega', async () => {
    const db = dbOf('ceo');
    await assertFails(getDoc(doc(db, 'hack/x')));
    await assertFails(getDocs(collection(db, 'hack')));
    await assertFails(setDoc(doc(db, 'hack/y'), valid('ceo')));
    await assertFails(setDoc(doc(db, 'hack/x'), { a: 2 }));
    await assertFails(deleteDoc(doc(db, 'hack/x')));
    await assertFails(setDoc(doc(db, 'fluxo_config/geral'), valid('ceo')));
  });

  it('R13 membro apaga fluxo_clients/{id} → permite (Q3: a equipe pode excluir clientes)', async () => {
    await assertSucceeds(deleteDoc(doc(dbOf('ceo'), 'fluxo_clients/1')));
    await assertSucceeds(deleteDoc(doc(dbOf('staff'), 'fluxo_clients/2')));
  });
});

describe('regras completas — casos extras de borda', () => {
  it('X01 inativo não lê nem grava nada, nem a própria rotina (acesso cortado na hora)', async () => {
    const db = dbOf('inactive');
    await assertFails(getDoc(doc(db, 'fluxo/meetings')));
    await assertFails(getDoc(doc(db, 'fluxo_clients/1')));
    await assertFails(getDocs(collection(db, 'fluxo_clients')));
    await assertFails(getDoc(doc(db, 'fluxo/routine_Inativo')));
    await assertFails(setDoc(doc(db, 'fluxo/tasks'), valid('inactive')));
    await assertFails(setDoc(doc(db, 'fluxo/routine_Inativo'), valid('inactive', EMPTY_ROUTINE)));
    await assertFails(setDoc(doc(db, 'fluxo_clients/9'), valid('inactive')));
    await assertFails(deleteDoc(doc(db, 'fluxo_clients/1')));
  });

  it('X02 logado sem perfil não grava (payload válido), não apaga e não lista fluxo_users', async () => {
    const db = dbOf('noprofile');
    await assertFails(setDoc(doc(db, 'fluxo/tasks'), valid('noprofile')));
    await assertFails(setDoc(doc(db, 'fluxo/routine'), valid('noprofile', EMPTY_ROUTINE)));
    await assertFails(setDoc(doc(db, 'fluxo_clients/9'), valid('noprofile')));
    await assertFails(deleteDoc(doc(db, 'fluxo_clients/1')));
    await assertFails(getDocs(collection(db, 'fluxo_users')));
  });

  it('X03 fluxo_users: membro ativo lê e lista (RF-06); inativo e sem perfil não leem nem o próprio perfil', async () => {
    const ceo = userByKey('ceo');
    await assertSucceeds(getDoc(doc(dbOf('staff'), `fluxo_users/${ceo.uid}`)));
    await assertSucceeds(getDoc(doc(dbOf('ceo'), `fluxo_users/${ceo.uid}`)));
    await assertSucceeds(getDocs(collection(dbOf('staff'), 'fluxo_users')));
    // Spec §5.2 ao pé da letra: só membro ativo lê perfis. Quem não é membro recebe permission-denied
    // (e não um documento "inexistente"/"inativo"), então o front precisa tratar esse erro como RF-04.
    const inactive = userByKey('inactive');
    const noprofile = userByKey('noprofile');
    await assertFails(getDoc(doc(dbOf('inactive'), `fluxo_users/${inactive.uid}`)));
    await assertFails(getDoc(doc(dbOf('noprofile'), `fluxo_users/${noprofile.uid}`)));
    await assertFails(getDocs(collection(dbOf('inactive'), 'fluxo_users')));
    await assertFails(getDoc(doc(anonDb(), `fluxo_users/${ceo.uid}`)));
    await assertFails(getDocs(collection(anonDb(), 'fluxo_users')));
  });

  it('X04 anônimo não lista, não grava (nem com payload bem formado) e não apaga', async () => {
    const db = anonDb();
    await assertFails(getDocs(collection(db, 'fluxo_clients')));
    await assertFails(getDoc(doc(db, 'fluxo/meetings')));
    await assertFails(getDoc(doc(db, 'fluxo/routine')));
    await assertFails(setDoc(doc(db, 'fluxo/tasks'), { data: '[]' }));
    await assertFails(setDoc(doc(db, 'fluxo/tasks'), { data: '[]', updatedBy: userByKey('ceo').uid, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(db, 'fluxo_clients/9'), { data: '{}' }));
    await assertFails(deleteDoc(doc(db, 'fluxo_clients/1')));
    await assertFails(deleteDoc(doc(db, 'fluxo/tasks')));
  });

  it('X05 membro não apaga fluxo/meetings nem nenhuma rotina', async () => {
    await assertFails(deleteDoc(doc(dbOf('ceo'), 'fluxo/meetings')));
    await assertFails(deleteDoc(doc(dbOf('ceo'), 'fluxo/routine')));
    await assertFails(deleteDoc(doc(dbOf('staff'), 'fluxo/routine_Vinicius')));
  });

  it('X06 payload: faltando campo, tipo errado e limite exato de 900 000 caracteres', async () => {
    const ceo = userByKey('ceo');
    const tasks = doc(dbOf('ceo'), 'fluxo/tasks');
    // faltando data ou updatedAt
    await assertFails(setDoc(tasks, { updatedBy: ceo.uid, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(tasks, { data: '[]', updatedBy: ceo.uid }));
    await assertFails(setDoc(tasks, { data: '[]' }));
    // tipos errados
    await assertFails(setDoc(tasks, { data: 123, updatedBy: ceo.uid, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(tasks, { data: [], updatedBy: ceo.uid, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(tasks, { data: '[]', updatedBy: 123, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(tasks, { data: '[]', updatedBy: ceo.uid, updatedAt: '2026-11-16' }));
    // outras chaves extras além da primeira
    await assertFails(setDoc(tasks, { ...valid('ceo'), updatedByName: 'Bruno' }));
    // limite: 900 000 caracteres passa, 900 001 não (R07)
    await assertSucceeds(setDoc(tasks, valid('ceo', 'x'.repeat(900_000))));
    await assertFails(setDoc(tasks, valid('ceo', 'x'.repeat(900_001))));
  });

  it('X07 payload inválido também é negado em meetings, rotina e fluxo_clients', async () => {
    const ceo = userByKey('ceo');
    const staff = userByKey('staff');
    await assertSucceeds(setDoc(doc(dbOf('ceo'), 'fluxo/meetings'), valid('ceo', '[]')));
    await assertFails(setDoc(doc(dbOf('ceo'), 'fluxo/meetings'), { data: '[]' }));
    await assertFails(setDoc(doc(dbOf('ceo'), 'fluxo/routine'), { data: EMPTY_ROUTINE, updatedBy: staff.uid, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(dbOf('staff'), 'fluxo/routine_Vinicius'), { ...valid('staff', EMPTY_ROUTINE), extra: 1 }));
    await assertFails(setDoc(doc(dbOf('staff'), 'fluxo_clients/1'), { data: '{}', updatedBy: ceo.uid, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(dbOf('staff'), 'fluxo_clients/1'), { data: '{}' }));
    await assertFails(setDoc(doc(dbOf('staff'), 'fluxo_clients/1'), valid('staff', 'x'.repeat(900_001))));
  });

  it('X08 membro cria e atualiza fluxo_clients/{id} com payload válido', async () => {
    await assertSucceeds(setDoc(doc(dbOf('staff'), 'fluxo_clients/3'), valid('staff', '{"id":3,"name":"Novo"}'))); // create
    await assertSucceeds(setDoc(doc(dbOf('ceo'), 'fluxo_clients/3'), valid('ceo', '{"id":3,"name":"Editado"}'))); // update
    await assertSucceeds(setDoc(doc(dbOf('ceo'), 'fluxo/meetings'), valid('ceo', '[{"id":1}]')));
  });

  it('X09 membro não lê nem grava fluxo/<id fora da lista>, subcoleção nem o routineId de quem não tem conta', async () => {
    const db = dbOf('ceo');
    await assertFails(getDoc(doc(db, 'fluxo/settings')));
    await assertFails(setDoc(doc(db, 'fluxo/settings'), valid('ceo', '{}')));
    await assertFails(setDoc(doc(db, 'fluxo/routine-x'), valid('ceo', EMPTY_ROUTINE)));
    await assertFails(getDoc(doc(db, 'fluxo/tasks/historico/1')));
    await assertFails(setDoc(doc(db, 'fluxo/tasks/historico/1'), valid('ceo')));
    await assertFails(setDoc(doc(db, 'fluxo_clients/1/notas/1'), valid('ceo')));
    await assertFails(getDoc(doc(db, 'fluxo/routine_Luiza')));
  });

  it('X10 perfil desativado com a sessão aberta: o mesmo contexto passa a ser negado', async () => {
    const staff = userByKey('staff');
    const db = dbOf('staff');
    await assertSucceeds(getDoc(doc(db, 'fluxo/tasks')));
    await assertSucceeds(setDoc(doc(db, 'fluxo/tasks'), valid('staff')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `fluxo_users/${staff.uid}`), { active: false });
    });
    await assertFails(getDoc(doc(db, 'fluxo/tasks')));
    await assertFails(setDoc(doc(db, 'fluxo/tasks'), valid('staff')));
    await assertFails(getDoc(doc(db, 'fluxo/routine_Vinicius')));
  });

  it('X11 troca de routineId no perfil muda a rotina acessível na hora', async () => {
    const staff = userByKey('staff');
    const db = dbOf('staff');
    await assertSucceeds(getDoc(doc(db, 'fluxo/routine_Vinicius')));
    await assertFails(getDoc(doc(db, 'fluxo/routine_Luiza')));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), `fluxo_users/${staff.uid}`), { routineId: 'routine_Luiza' });
    });
    await assertFails(getDoc(doc(db, 'fluxo/routine_Vinicius')));
    await assertSucceeds(getDoc(doc(db, 'fluxo/routine_Luiza')));
    await assertSucceeds(setDoc(doc(db, 'fluxo/routine_Luiza'), valid('staff', EMPTY_ROUTINE)));
  });

  it('X12 perfil sem active ou com active em texto não é membro (falha fechada)', async () => {
    for (const uid of [BROKEN_NO_ACTIVE, BROKEN_ACTIVE_STRING]) {
      const db = dbOfUid(uid);
      await assertFails(getDoc(doc(db, 'fluxo/tasks')));
      await assertFails(getDoc(doc(db, 'fluxo/routine_Vinicius')));
      await assertFails(setDoc(doc(db, 'fluxo/tasks'), validFor(uid)));
      await assertFails(getDocs(collection(db, 'fluxo_users')));
    }
  });
});
