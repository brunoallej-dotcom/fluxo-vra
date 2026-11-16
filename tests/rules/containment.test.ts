// Testes das regras de CONTENÇÃO — docs/specs/autenticacao-multiusuario.md §5.3 (C01–C11).
// Removidos na Onda 2, junto com as regras de contenção.
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, setLogLevel } from 'firebase/firestore';
import { userByKey } from '../fixtures/users.ts';

// As recusas esperadas (assertFails) geram logs de PERMISSION_DENIED no SDK; silencia para a saída listar só os casos.
setLogLevel('silent');

const ceo = userByKey('ceo');
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

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'fluxo/tasks'), { data: '[]' });
    await setDoc(doc(db, 'fluxo/meetings'), { data: '[]' });
    await setDoc(doc(db, 'fluxo/routine'), { data: '[]' });
    await setDoc(doc(db, 'fluxo_clients/1'), { data: '{}' });
    await setDoc(doc(db, `fluxo_users/${ceo.uid}`), ceo.profile!);
    await setDoc(doc(db, 'hack/x'), { a: 1 });
  });
});

const anon = () => env.unauthenticatedContext().firestore();
const signedIn = () => env.authenticatedContext(ceo.uid).firestore();

describe('regras de contenção', () => {
  it('C01 anônimo lê fluxo/tasks e lista fluxo_clients', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'fluxo/tasks')));
    await assertSucceeds(getDocs(collection(anon(), 'fluxo_clients')));
  });

  it('C02 anônimo grava fluxo/tasks no formato { data }', async () => {
    await assertSucceeds(setDoc(doc(anon(), 'fluxo/tasks'), { data: '[{"id":1}]' }));
  });

  it('C03 nega chave extra além de data/updatedBy/updatedAt', async () => {
    await assertFails(setDoc(doc(anon(), 'fluxo/tasks'), { data: '[]', extra: true }));
    await assertFails(setDoc(doc(anon(), 'fluxo_clients/2'), { data: '{}', owner: 'x' }));
  });

  it('C04 nega data que não é string ou acima de 900 000 caracteres', async () => {
    await assertFails(setDoc(doc(anon(), 'fluxo/tasks'), { data: 123 }));
    await assertFails(setDoc(doc(anon(), 'fluxo/tasks'), { data: 'x'.repeat(900_001) }));
    await assertSucceeds(setDoc(doc(anon(), 'fluxo/tasks'), { data: 'x'.repeat(900_000) }));
  });

  it('C05 nega apagar fluxo/tasks e fluxo/meetings', async () => {
    await assertFails(deleteDoc(doc(anon(), 'fluxo/tasks')));
    await assertFails(deleteDoc(doc(anon(), 'fluxo/meetings')));
  });

  it('C06 nega ler ou gravar coleção fora da lista', async () => {
    await assertFails(getDoc(doc(anon(), 'hack/x')));
    await assertFails(setDoc(doc(anon(), 'hack/y'), { data: '[]' }));
    await assertFails(getDoc(doc(signedIn(), 'hack/x')));
  });

  it('C07 nega gravar fluxo/<id fora da lista>', async () => {
    await assertFails(setDoc(doc(anon(), 'fluxo/settings'), { data: '{}' }));
    await assertFails(setDoc(doc(anon(), 'fluxo/routine-x'), { data: '[]' }));
  });

  it('C08 permite apagar fluxo_clients/{id}', async () => {
    await assertSucceeds(deleteDoc(doc(anon(), 'fluxo_clients/1')));
  });

  it('C09 permite ler e gravar fluxo/routine e fluxo/routine_Vinicius', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'fluxo/routine')));
    await assertSucceeds(setDoc(doc(anon(), 'fluxo/routine'), { data: '[[],[],[],[],[],[],[]]' }));
    await assertSucceeds(setDoc(doc(anon(), 'fluxo/routine_Vinicius'), { data: '[[],[],[],[],[],[],[]]' }));
    await assertSucceeds(getDoc(doc(anon(), 'fluxo/routine_Vinicius')));
  });

  it('C10 aceita o formato da Fase 1 { data, updatedBy, updatedAt }', async () => {
    await assertSucceeds(
      setDoc(doc(signedIn(), 'fluxo/tasks'), { data: '[]', updatedBy: ceo.uid, updatedAt: serverTimestamp() }),
    );
    // tipos errados nos campos de auditoria
    await assertFails(setDoc(doc(signedIn(), 'fluxo/tasks'), { data: '[]', updatedBy: 123, updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(signedIn(), 'fluxo/tasks'), { data: '[]', updatedBy: ceo.uid, updatedAt: '2026-11-16' }));
  });

  it('C11 fluxo_users: logado lê, anônimo não lê, ninguém grava', async () => {
    await assertSucceeds(getDoc(doc(signedIn(), `fluxo_users/${ceo.uid}`)));
    await assertSucceeds(getDocs(collection(signedIn(), 'fluxo_users'))); // lista de pessoas (RF-06)
    await assertFails(getDoc(doc(anon(), `fluxo_users/${ceo.uid}`)));
    await assertFails(getDocs(collection(anon(), 'fluxo_users')));
    await assertFails(setDoc(doc(signedIn(), `fluxo_users/${ceo.uid}`), { ...ceo.profile!, role: 'ceo' }));
    await assertFails(setDoc(doc(anon(), 'fluxo_users/novo'), { role: 'ceo' }));
    await assertFails(deleteDoc(doc(signedIn(), `fluxo_users/${ceo.uid}`)));
  });
});
