// Helpers de interface para os testes E2E de login (Onda 4a).
// Seletores de login/sessão: SÓ os testids da spec §9.1 (o tipo `TestId` impede outros).
import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import type { FixtureUser } from '../../fixtures/users.ts';
import { FIRESTORE_PORT } from './emulator.ts';

/** Os 12 testids congelados na spec autenticacao-multiusuario.md §9.1. */
export const TEST_IDS = [
  'login-screen',
  'login-form',
  'login-email',
  'login-password',
  'login-submit',
  'login-error',
  'login-forgot',
  'login-info',
  'app-shell',
  'logout',
  'nav-ceo',
  'greeting',
] as const;
export type TestId = (typeof TEST_IDS)[number];

/** Mensagens exatas da spec (RF-02, RF-03, RF-04). */
export const MSG = {
  invalidCredentials: 'E-mail ou senha inválidos.',
  resetNeutral: 'Se o e-mail estiver cadastrado, você vai receber um link para criar uma nova senha.',
  notReleased: 'Seu acesso ainda não foi liberado. Fale com um CEO.',
  logoutConfirm: 'Sair da sua conta?',
} as const;

/** App em modo emulador (spec §9.2); `baseURL` vem do playwright.config.ts. */
export const APP_PATH = '/?emulator=1';

/** Tempo máximo para login/saída aparecerem (RNF-07 pede < 3 s; folga para o emulador). */
export const AUTH_TIMEOUT = 10_000;

/** Todos os elementos com o testid (pode haver mais de um: desktop e mobile). */
export function byId(page: Page, id: TestId): Locator {
  return page.getByTestId(id);
}

/** Só os elementos com o testid que estão visíveis agora (ex.: `logout`, `nav-ceo`). */
export function visibleById(page: Page, id: TestId): Locator {
  return page.getByTestId(id).filter({ visible: true });
}

/** Abre o app em modo emulador, sem logar. */
export async function openApp(page: Page): Promise<void> {
  await page.goto(APP_PATH);
}

/** Abre o app e espera a tela de login (falha clara se o login ainda não existe). */
export async function openLogin(page: Page): Promise<void> {
  await openApp(page);
  await expect(byId(page, 'login-screen')).toBeVisible({ timeout: AUTH_TIMEOUT });
}

/** Preenche o formulário de login e envia. */
export async function submitLogin(page: Page, email: string, password: string): Promise<void> {
  await byId(page, 'login-email').fill(email);
  await byId(page, 'login-password').fill(password);
  await byId(page, 'login-submit').click();
}

/** Abre o app, entra com a conta da fixture e espera o app aparecer (login bem-sucedido). */
export async function loginAs(page: Page, user: FixtureUser): Promise<void> {
  await openLogin(page);
  await submitLogin(page, user.email, user.password);
  await expect(byId(page, 'app-shell')).toBeVisible({ timeout: AUTH_TIMEOUT });
  await expect(byId(page, 'login-screen')).toBeHidden({ timeout: AUTH_TIMEOUT });
}

/** Faz o login de `user` numa janela isolada (contexto novo: sem localStorage nem sessão de outros testes). */
export async function loginInFreshContext(
  browser: Browser,
  baseURL: string | undefined,
  user: FixtureUser,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await loginAs(page, user);
  return { page, close: () => context.close() };
}

/**
 * Registra toda requisição/WebSocket da página para o Firestore (emulador na porta 8080 por padrão
 * ou `firestore.googleapis.com`). Serve para afirmar "nenhuma leitura antes do login" (E01).
 */
export function trackFirestoreTraffic(page: Page): string[] {
  const hits: string[] = [];
  const isFirestore = (raw: string): boolean => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return false;
    }
    return (
      url.port === FIRESTORE_PORT ||
      url.hostname === 'firestore.googleapis.com' ||
      url.pathname.includes('google.firestore.v1.Firestore')
    );
  };
  page.on('request', (request) => {
    if (isFirestore(request.url())) hits.push(`${request.method()} ${request.url()}`);
  });
  page.on('websocket', (socket) => {
    if (isFirestore(socket.url())) hits.push(`WS ${socket.url()}`);
  });
  return hits;
}

/**
 * Cria uma tarefa pela interface atual de tarefas, que NÃO muda com o login (exceção da
 * spec §9.1 só para o E08). Ids já existentes no public/index.html:
 *   #topAction      botão "＋ Nova tarefa" da barra superior (some em tela ≤ 768 px)
 *   #taskTitleInput campo "Título" do #taskModal
 *   #saveTaskBtn    botão "Criar tarefa" do #taskModal
 */
export async function createTaskViaUi(page: Page, title: string): Promise<void> {
  await page.locator('#topAction').click();
  await page.locator('#taskTitleInput').fill(title);
  await page.locator('#saveTaskBtn').click();
}
