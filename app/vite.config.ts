import { fileURLToPath } from 'node:url';
// `vitest/config` rather than `vite`, so the `test` block below typechecks.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';

const resolveLocal = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  cacheDir: './.vite',
  resolve: {
    alias: {
      // The compiled contract lives outside this package, in `../contract`, which has no
      // node_modules of its own. Node would resolve its `@midnight-ntwrk/compact-runtime`
      // import by walking up from *its* directory and find nothing, so it is pinned here
      // instead. This also guarantees a single runtime instance: two copies of the
      // runtime produce "expected instance of StateValue" at the first circuit call.
      '@midnight-ntwrk/compact-runtime': resolveLocal(
        './node_modules/@midnight-ntwrk/compact-runtime/dist/index.js',
      ),
    },
    extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.wasm'],
    mainFields: ['browser', 'module', 'main'],
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        // The on-chain runtime is WASM with top-level await; keeping it in its own chunk
        // avoids ordering problems in the main bundle.
        manualChunks: (id) => (id.includes('onchain-runtime-v3') ? 'wasm' : undefined),
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
      extensions: ['.js', '.cjs'],
      ignoreDynamicRequires: true,
    },
  },
  plugins: [react(), wasm()],
  optimizeDeps: {
    include: ['@midnight-ntwrk/compact-runtime'],
    exclude: [
      '@midnight-ntwrk/onchain-runtime-v3',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm_bg.wasm',
      '@midnight-ntwrk/onchain-runtime-v3/midnight_onchain_runtime_wasm.js',
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test-setup.ts'],
  },
});
