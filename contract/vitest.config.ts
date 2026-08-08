import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

const network = process.env['MIDNIGHT_NETWORK'] ?? 'local';
const isRemote = network !== 'local';

// For remote networks, source secrets (e.g. MIDNIGHT_PREVIEW_SEED) from
// .env.<network> so they don't need to be passed on the command line.
// Shell env still wins over file values.
const envFromFile = isRemote ? loadEnv(network, process.cwd(), '') : {};

export default defineConfig({
  resolve: {
    alias: {
      // The integration test reuses the off-chain signing layer from ../app, whose
      // imports would otherwise resolve against app/node_modules and load a second copy
      // of the runtime. Two instances produce "expected instance of StateValue" at the
      // first circuit call, so both sides are pinned to this package's copy.
      '@midnight-ntwrk/compact-runtime': fileURLToPath(
        new URL('./node_modules/@midnight-ntwrk/compact-runtime/dist/index.js', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 10 * 60_000,
    hookTimeout: isRemote ? 90 * 60_000 : 15 * 60_000,
    env: envFromFile,
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
    sequence: { concurrent: false },
  },
});
