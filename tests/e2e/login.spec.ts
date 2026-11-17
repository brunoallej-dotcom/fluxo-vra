// E01–E08 — login, sessão e auditoria de gravação (spec autenticacao-multiusuario.md §7.2).
//
// Escritos ANTES da implementação (Onda 4a, test-first): enquanto a frente A não entrega o
// login, falham por "login-screen não encontrado" — é o esperado. Rodam contra os emuladores
// (Auth 9099 + Firestore 8080, projeto demo-fluxo) com `npm run test:e2e`; o app abre em
// http://localhost:5500/?emulator=1 (spec §9.2) e as contas/perfis vêm da fixture (§9.3).
//
// Seletores de login/sessão: SÓ os testids da spec §9.1 (ver `TestId` em support/app.ts).
// Exceção documentada (E08, interface de tarefas que não muda com o login), ids que já
// existem no public/index.html: #topAction, #taskTitleInput, #saveTaskBtn.
import { expect, test } from '@playwright/test';
import { userByKey } from '../fixtures/users.ts';
import {
  AUTH_TIMEOUT,
  MSG,
  byId,
  createTaskViaUi,
  loginAs,
  loginInFreshContext,
  openApp,
  openLogin,
  submitLogin,
  trackFirestoreTraffic,
  visibleById,
} from './support/app.ts';
import { SEEDED_TASK_TITLE, SEED_UPDATED_AT, listOobCodes, readStoredDoc, resetEmulators, seedAll } from './support/emulator.ts';

// Sem isto, um elemento que ainda não existe (login não implementado) seguraria cada
// ação até o timeout do teste (30 s); assim o teste falha rápido e com mensagem clara.
test.use({ actionTimeout: AUTH_TIMEOUT, navigationTimeout: 15_000 });

test.beforeEach(async () => {
  await resetEmulators();
  await seedAll();
});

/** Senha certa + sufixo: sempre errada, sem literal de senha no código (gitleaks). */
const wrongPassword = (password: string): string => `${password}-errada`;
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test('E01 abrir o app sem sessão mostra só o login, sem dados e sem ler o Firestore', async ({ page }) => {
  // Estado "antigo" deixado no navegador: identidade escolhida e cache local de tarefas.
  // Sem sessão, nada disso pode ser usado nem renderizado (RF-01, RF-05).
  const cachedTitle = 'Tarefa em cache local do E01';
  await page.addInitScript((title) => {
    localStorage.setItem('fluxo_me', 'Bruno');
    localStorage.setItem('fluxo_tasks', JSON.stringify([{ id: 1, title, date: '2026-01-01', priority: 'medium', owner: 'Bruno', done: false }]));
  }, cachedTitle);
  const firestoreHits = trackFirestoreTraffic(page);

  await openApp(page);

  await expect(byId(page, 'login-screen')).toBeVisible({ timeout: AUTH_TIMEOUT });
  await expect(byId(page, 'login-form')).toBeVisible();
  await expect(byId(page, 'login-email')).toBeVisible();
  await expect(byId(page, 'login-password')).toBeVisible();
  await expect(byId(page, 'login-submit')).toBeVisible();
  await expect(byId(page, 'login-forgot')).toBeVisible();

  // Nenhum elemento de dados/sessão visível.
  await expect(byId(page, 'app-shell')).toBeHidden();
  await expect(visibleById(page, 'logout')).toHaveCount(0);
  await expect(visibleById(page, 'nav-ceo')).toHaveCount(0);
  const body = page.locator('body');
  await expect(body).not.toContainText(SEEDED_TASK_TITLE, { useInnerText: true });
  await expect(body).not.toContainText(cachedTitle, { useInnerText: true });

  // Nenhuma leitura no Firestore: espera a rede assentar e mais um tempo, porque a
  // ausência de tráfego não tem um evento para esperar.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  expect(firestoreHits, 'requisições ao Firestore antes do login').toEqual([]);
});

test('E02 senha errada mostra só a mensagem genérica', async ({ page }) => {
  const ceo = userByKey('ceo');

  await openLogin(page);
  await submitLogin(page, ceo.email, wrongPassword(ceo.password));
  await expect(byId(page, 'login-error')).toHaveText(MSG.invalidCredentials, { timeout: AUTH_TIMEOUT });
  await expect(byId(page, 'login-screen')).toBeVisible();
  await expect(byId(page, 'app-shell')).toBeHidden();

  // RF-02: e-mail que não existe recebe exatamente a mesma mensagem (não revela quem tem conta).
  // Página recarregada para a mensagem anterior não mascarar uma resposta que nunca vem.
  await openLogin(page);
  await submitLogin(page, 'ninguem@fluxo.test', wrongPassword(ceo.password));
  await expect(byId(page, 'login-error')).toHaveText(MSG.invalidCredentials, { timeout: AUTH_TIMEOUT });
  await expect(byId(page, 'app-shell')).toBeHidden();
});

test('E03 login de CEO mostra o dashboard com a saudação e a CEO View', async ({ page, browser, baseURL }) => {
  const ceo = userByKey('ceo');
  const ceo2 = userByKey('ceo2');
  const firestoreHits = trackFirestoreTraffic(page);

  await loginAs(page, ceo);

  // `greeting` fica num elemento só de celular (.h1-mob) no desktop: afirmo o texto, não a visibilidade.
  await expect(byId(page, 'greeting')).toContainText(/, Bruno\./);
  await expect(visibleById(page, 'nav-ceo').first()).toBeVisible();

  // Prova de que o rastreador do E01 enxerga o Firestore: depois do login há tráfego.
  expect(firestoreHits.length, 'o rastreador deveria ver o Firestore depois do login').toBeGreaterThan(0);

  // A saudação do HTML estático já diz "Bruno": a segunda CEO, em janela isolada, garante que
  // o nome vem do perfil e não de um texto fixo.
  const second = await loginInFreshContext(browser, baseURL, ceo2);
  try {
    await expect(byId(second.page, 'greeting')).toContainText(/, Júlia\./);
    await expect(visibleById(second.page, 'nav-ceo').first()).toBeVisible();
  } finally {
    await second.close();
  }
});

test('E04 login de staff mostra o dashboard sem a CEO View (sidebar e menu mobile)', async ({ page }) => {
  const staff = userByKey('staff');

  await loginAs(page, staff);

  // Identidade vem do perfil: saudação com o nome da própria pessoa, não o padrão "Bruno".
  await expect(byId(page, 'greeting')).toContainText(/, Vinicius\./);

  // Desktop (sidebar): nenhum item da CEO View visível.
  await expect(visibleById(page, 'nav-ceo')).toHaveCount(0);

  // Celular (barra inferior): hoje o item de CEO vira "Kanban" para staff; o testid da
  // CEO View não pode ficar nele.
  await page.setViewportSize(MOBILE_VIEWPORT);
  await expect(visibleById(page, 'nav-ceo')).toHaveCount(0);
});

test('E05 login de usuário sem perfil volta ao login com a mensagem de acesso não liberado', async ({ page }) => {
  const noProfile = userByKey('noprofile');

  await openLogin(page);
  await submitLogin(page, noProfile.email, noProfile.password);

  await expect(byId(page, 'login-error')).toHaveText(MSG.notReleased, { timeout: AUTH_TIMEOUT });
  await expect(byId(page, 'login-screen')).toBeVisible();
  await expect(byId(page, 'app-shell')).toBeHidden();
  await expect(page.locator('body')).not.toContainText(SEEDED_TASK_TITLE, { useInnerText: true });

  // O app fez signOut (RF-04): recarregar não restaura sessão.
  await openApp(page);
  await expect(byId(page, 'login-screen')).toBeVisible({ timeout: AUTH_TIMEOUT });
  await expect(byId(page, 'app-shell')).toBeHidden();
});

test('E06 "Sair" volta ao login e limpa o localStorage, exceto o tema', async ({ page }) => {
  const ceo = userByKey('ceo');
  // Se houver gravação pendente, o app pede confirmação (RF-08): aceita para seguir.
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });

  await loginAs(page, ceo);

  // Chaves de prova: a "fluxo_canary" tem de sumir; o tema tem de ficar (RF-08).
  await page.evaluate(() => {
    localStorage.setItem('fluxo_canary', 'x');
    localStorage.setItem('fluxo_theme', 'dark');
  });

  await visibleById(page, 'logout').first().click();

  await expect(byId(page, 'login-screen')).toBeVisible({ timeout: AUTH_TIMEOUT });
  await expect(byId(page, 'app-shell')).toBeHidden();
  await expect
    .poll(
      () =>
        page.evaluate(() =>
          Object.keys(localStorage).filter((key) => key.startsWith('fluxo_') && key !== 'fluxo_theme' && key !== 'fluxo_theme_v2'),
        ),
      { message: 'chaves fluxo_* (fora o tema) que sobraram no localStorage', timeout: AUTH_TIMEOUT },
    )
    .toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('fluxo_theme'))).toBe('dark');

  // A sessão acabou: recarregar continua no login.
  await openApp(page);
  await expect(byId(page, 'login-screen')).toBeVisible({ timeout: AUTH_TIMEOUT });
  await expect(byId(page, 'app-shell')).toBeHidden();
});

test('E07 "Esqueci minha senha" mostra a mensagem neutra e gera o e-mail no emulador', async ({ page }) => {
  const ceo = userByKey('ceo');

  await openLogin(page);
  await byId(page, 'login-email').fill(ceo.email);
  await byId(page, 'login-forgot').click();
  await expect(byId(page, 'login-info')).toHaveText(MSG.resetNeutral, { timeout: AUTH_TIMEOUT });

  // O Auth Emulator "envia" o e-mail guardando o código de redefinição.
  await expect
    .poll(
      async () => {
        const codes = await listOobCodes();
        return codes.filter((c) => c.requestType === 'PASSWORD_RESET' && c.email.toLowerCase() === ceo.email.toLowerCase()).length;
      },
      { message: 'códigos de redefinição para o e-mail digitado', timeout: AUTH_TIMEOUT },
    )
    .toBeGreaterThan(0);

  // RF-03: e-mail inexistente recebe a mesma mensagem neutra (página recarregada para a
  // mensagem anterior não mascarar uma resposta que nunca vem).
  await openLogin(page);
  await byId(page, 'login-email').fill('ninguem@fluxo.test');
  await byId(page, 'login-forgot').click();
  await expect(byId(page, 'login-info')).toHaveText(MSG.resetNeutral, { timeout: AUTH_TIMEOUT });
});

test('E08 criar tarefa logado grava fluxo/tasks com updatedBy igual ao uid', async ({ page }) => {
  const ceo = userByKey('ceo');
  const title = 'Tarefa criada pelo teste E08';

  await loginAs(page, ceo);
  await createTaskViaUi(page, title);

  // Lê direto do emulador (Bearer owner, sem regras). O documento semeado tinha outro
  // updatedBy/updatedAt: se mudaram, foi o app que gravou.
  await expect
    .poll(async () => (await readStoredDoc('fluxo/tasks'))?.data.includes(title) ?? false, {
      message: 'fluxo/tasks com a tarefa nova',
      timeout: AUTH_TIMEOUT,
    })
    .toBe(true);

  const stored = await readStoredDoc('fluxo/tasks');
  expect(stored, 'documento fluxo/tasks').not.toBeNull();
  const tasks = JSON.parse(stored?.data ?? '[]') as Array<{ title: string }>;
  expect(tasks.some((task) => task.title === title)).toBe(true);
  expect(stored?.updatedBy).toBe(ceo.uid);
  expect(stored?.updatedAt, 'updatedAt gravado pelo app').toBeTruthy();
  expect(stored?.updatedAt).not.toBe(SEED_UPDATED_AT);
});
