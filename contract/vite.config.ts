import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/**
 * For scripts run through vite-node (see `scripts/`).
 *
 * They import the trial catalogue and the signing layer from ../app so the deployed
 * contract cannot drift from what the app shows. Those files resolve
 * `@midnight-ntwrk/compact-runtime` against app/node_modules, which would load a second
 * copy of the runtime alongside this package's; two instances fail at the first circuit
 * call with "expected instance of StateValue". Pinning both sides here avoids that.
 *
 * vitest.config.ts carries the same alias for the same reason.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@midnight-ntwrk/compact-runtime': fileURLToPath(
        new URL('./node_modules/@midnight-ntwrk/compact-runtime/dist/index.js', import.meta.url),
      ),
    },
  },
});
