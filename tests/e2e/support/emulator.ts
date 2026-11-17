// Semeadura e inspeção dos emuladores (Auth + Firestore) para os testes E2E.
// Tudo por REST com `Authorization: Bearer owner`, que ignora as Security Rules
// (é o jeito oficial de preparar dados nos emuladores). Só o projeto `demo-fluxo`.
// Não importa nada do Playwright: dá para rodar sob `node` para depurar.
import { loadUsers, type FixtureUser } from '../../fixtures/users.ts';

export const PROJECT_ID = 'demo-fluxo';
// `firebase emulators:exec` exporta estas variáveis; sem elas valem as portas da spec §9.2
// (Auth 9099, Firestore 8080). O app em teste usa sempre as portas da spec.
const AUTH_ORIGIN = `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '127.0.0.1:9099'}`;
const FIRESTORE_ORIGIN = `http://${process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'}`;
/** Porta do Firestore Emulator em uso (8080 por padrão); o rastreador do E01 observa esta porta. */
export const FIRESTORE_PORT = new URL(FIRESTORE_ORIGIN).port;
const OWNER_HEADERS = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };

/** Título da tarefa semeada em `fluxo/tasks`: se aparecer na tela sem login, houve vazamento. */
export const SEEDED_TASK_TITLE = 'Tarefa privada semeada pelo teste';
/** `updatedBy` e `updatedAt` do documento semeado (o app tem de sobrescrever os dois no E08). */
export const SEED_UPDATED_BY = 'seed-e2e';
export const SEED_UPDATED_AT = '2020-01-01T00:00:00Z';

async function ensureOk(res: Response, what: string): Promise<Response> {
  if (!res.ok) {
    throw new Error(`${what}: HTTP ${res.status} ${await res.text()}`);
  }
  return res;
}

// ─── Firestore (REST) ────────────────────────────────────────────────────────

type FsValue = { stringValue: string } | { booleanValue: boolean } | { timestampValue: string };
type FsFields = Record<string, FsValue>;

function docUrl(path: string): string {
  return `${FIRESTORE_ORIGIN}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
}

async function putFsDoc(path: string, fields: FsFields): Promise<void> {
  // PATCH sem updateMask cria o documento ou o substitui por inteiro.
  await ensureOk(
    await fetch(docUrl(path), { method: 'PATCH', headers: OWNER_HEADERS, body: JSON.stringify({ fields }) }),
    `semear ${path}`,
  );
}

/** Grava um documento de dados no formato `{ data: "<JSON>", updatedBy, updatedAt }` (contrato v1). */
export async function seedStoredDoc(
  path: string,
  value: unknown,
  updatedBy: string = SEED_UPDATED_BY,
  updatedAt: string = SEED_UPDATED_AT,
): Promise<void> {
  await putFsDoc(path, {
    data: { stringValue: JSON.stringify(value) },
    updatedBy: { stringValue: updatedBy },
    updatedAt: { timestampValue: updatedAt },
  });
}

export interface StoredDocFields {
  /** Conteúdo bruto (texto JSON) do campo `data`. */
  data: string;
  updatedBy: string | null;
  updatedAt: string | null;
}

interface FsReadDoc {
  fields?: {
    data?: { stringValue?: string };
    updatedBy?: { stringValue?: string };
    updatedAt?: { timestampValue?: string };
  };
}

/** Lê um documento de dados direto do emulador; `null` se não existir. */
export async function readStoredDoc(path: string): Promise<StoredDocFields | null> {
  const res = await fetch(docUrl(path), { headers: OWNER_HEADERS });
  if (res.status === 404) return null;
  await ensureOk(res, `ler ${path}`);
  const body = (await res.json()) as FsReadDoc;
  return {
    data: body.fields?.data?.stringValue ?? '',
    updatedBy: body.fields?.updatedBy?.stringValue ?? null,
    updatedAt: body.fields?.updatedAt?.timestampValue ?? null,
  };
}

// ─── Auth Emulator (REST) ────────────────────────────────────────────────────

async function createAuthAccount(user: FixtureUser): Promise<void> {
  // `localId` fixa o uid da fixture (só o emulador aceita; a produção usaria o Admin SDK).
  await ensureOk(
    await fetch(`${AUTH_ORIGIN}/identitytoolkit.googleapis.com/v1/projects/${PROJECT_ID}/accounts`, {
      method: 'POST',
      headers: OWNER_HEADERS,
      body: JSON.stringify({ localId: user.uid, email: user.email, password: user.password, emailVerified: true }),
    }),
    `criar conta ${user.key}`,
  );
}

export interface OobCode {
  email: string;
  requestType: string;
  oobCode: string;
  oobLink: string;
}

/** Códigos/links de redefinição de senha gerados pelo Auth Emulator (o e-mail "enviado"). */
export async function listOobCodes(): Promise<OobCode[]> {
  const res = await ensureOk(
    await fetch(`${AUTH_ORIGIN}/emulator/v1/projects/${PROJECT_ID}/oobCodes`),
    'listar oobCodes',
  );
  const body = (await res.json()) as { oobCodes?: OobCode[] };
  return body.oobCodes ?? [];
}

// ─── Preparação e limpeza por teste ──────────────────────────────────────────

/** Apaga todas as contas do Auth e todos os documentos do Firestore (só do `demo-fluxo`). */
export async function resetEmulators(): Promise<void> {
  await ensureOk(
    await fetch(`${AUTH_ORIGIN}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' }),
    'limpar Auth',
  );
  await ensureOk(
    await fetch(`${FIRESTORE_ORIGIN}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, {
      method: 'DELETE',
    }),
    'limpar Firestore',
  );
}

/**
 * Semeia as contas da fixture no Auth (uid = `localId`) e os perfis `fluxo_users/{uid}`
 * (a conta `noprofile` fica sem perfil), mais os documentos iniciais de dados.
 */
export async function seedAll(users: FixtureUser[] = loadUsers()): Promise<void> {
  for (const user of users) {
    await createAuthAccount(user);
    if (user.profile) {
      const p = user.profile;
      const fields: FsFields = {
        personId: { stringValue: p.personId },
        name: { stringValue: p.name },
        initial: { stringValue: p.initial },
        role: { stringValue: p.role },
        title: { stringValue: p.title },
        routineId: { stringValue: p.routineId },
        active: { booleanValue: p.active },
      };
      if (p.color !== undefined) fields.color = { stringValue: p.color };
      await putFsDoc(`fluxo_users/${user.uid}`, fields);
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  await seedStoredDoc('fluxo/tasks', [
    { id: 1, title: SEEDED_TASK_TITLE, desc: '', date: today, time: '', duration: '', category: '', priority: 'medium', owner: 'Bruno', done: false },
  ]);
  await seedStoredDoc('fluxo/meetings', []);
}
