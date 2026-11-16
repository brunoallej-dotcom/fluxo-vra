import { defineConfig, devices } from '@playwright/test';

// Testes E2E (Onda 4a) contra os emuladores: o app abre em
// http://localhost:5500/?emulator=1 (spec §9.2) e usa o projeto demo-fluxo.
// Rodar com `npm run test:e2e`, que sobe Auth + Firestore Emulator.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5500',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 5500 --bind 127.0.0.1 --directory public',
    url: 'http://127.0.0.1:5500/index.html',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
