import { defineConfig } from 'vitest/config';

// Testes das Firestore Security Rules. Rodam dentro de
// `firebase emulators:exec` (npm run test:rules), que define
// FIRESTORE_EMULATOR_HOST; os arquivos rodam em série porque compartilham o emulador.
export default defineConfig({
  test: {
    include: ['tests/rules/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
