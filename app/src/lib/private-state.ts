/**
 * Private state, held in memory only.
 *
 * The Node providers persist this to LevelDB. In a browser that would mean writing a
 * patient's medical history and enrollment secret to disk, which is exactly what this
 * design exists to avoid — so it lives for the lifetime of the tab and no longer.
 *
 * Signing keys are contract-maintenance keys (replacing a verifier key, changing the
 * maintenance authority). This app never performs maintenance, so those methods are
 * present to satisfy the interface and do nothing useful.
 */

import type { PrivateStateProvider } from '@midnight-ntwrk/midnight-js-types';

export const inMemoryPrivateStateProvider = <PS>(): PrivateStateProvider<string, PS> => {
  const states = new Map<string, PS>();
  const signingKeys = new Map<string, string>();

  return {
    setContractAddress: () => {},

    set: async (id, state) => {
      states.set(id, state);
    },
    get: async (id) => states.get(id) ?? null,
    remove: async (id) => {
      states.delete(id);
    },
    clear: async () => {
      states.clear();
    },

    setSigningKey: async (address, key) => {
      signingKeys.set(address, key as unknown as string);
    },
    getSigningKey: async (address) => (signingKeys.get(address) ?? null) as never,
    removeSigningKey: async (address) => {
      signingKeys.delete(address);
    },
    clearSigningKeys: async () => {
      signingKeys.clear();
    },

    exportPrivateStates: async () => {
      throw new Error('Private state is never exported from the browser.');
    },
    importPrivateStates: async () => {
      throw new Error('Private state is never imported into the browser.');
    },
    exportSigningKeys: async () => {
      throw new Error('Signing keys are never exported from the browser.');
    },
    importSigningKeys: async () => {
      throw new Error('Signing keys are never imported into the browser.');
    },
  } as PrivateStateProvider<string, PS>;
};
