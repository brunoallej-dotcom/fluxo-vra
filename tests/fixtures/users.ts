// Leitura tipada da fixture de usuários de teste (spec §9.3).
// Contas e senhas existem só nos emuladores.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type Role = 'ceo' | 'staff';
export type FixtureKey = 'ceo' | 'ceo2' | 'staff' | 'inactive' | 'noprofile';

export interface UserProfile {
  personId: string;
  name: string;
  initial: string;
  role: Role;
  title: string;
  routineId: string;
  color?: string;
  active: boolean;
}

export interface FixtureUser {
  key: FixtureKey;
  uid: string;
  email: string;
  password: string;
  profile: UserProfile | null;
}

export function loadUsers(): FixtureUser[] {
  const path = fileURLToPath(new URL('./users.json', import.meta.url));
  return JSON.parse(readFileSync(path, 'utf8')) as FixtureUser[];
}

export function userByKey(key: FixtureKey): FixtureUser {
  const user = loadUsers().find((u) => u.key === key);
  if (!user) throw new Error(`fixture sem usuário "${key}"`);
  return user;
}
