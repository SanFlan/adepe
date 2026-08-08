/**
 * Where the wallet's key material comes from, per network.
 *
 * Local runs use a well-known pre-funded seed. Every other network needs one supplied,
 * because there is nothing safe to default to: a hardcoded seed on a public network is
 * either empty or someone else's.
 */

import type { WalletSecret } from './wallet.js';

/** The dev-chain account. Pre-funded by the local node's genesis, worthless anywhere else. */
export const ALICE_LOCAL_SEED =
  '0000000000000000000000000000000000000000000000000000000000000001';

export function resolveWalletSecret(network: string): WalletSecret {
  if (network === 'local') return { kind: 'seed', value: ALICE_LOCAL_SEED };

  const upper = network.toUpperCase();
  const mnemonicEnv = `MIDNIGHT_${upper}_MNEMONIC`;
  const seedEnv = `MIDNIGHT_${upper}_SEED`;
  const mnemonic = process.env[mnemonicEnv]?.trim().replace(/\s+/g, ' ');
  const seedHex = process.env[seedEnv]?.trim();

  if (mnemonic && seedHex) {
    throw new Error(`Set only one of ${mnemonicEnv} or ${seedEnv} (both are defined).`);
  }
  if (mnemonic) return { kind: 'mnemonic', value: mnemonic };
  if (seedHex) {
    if (!/^[0-9a-fA-F]+$/.test(seedHex) || seedHex.length % 2 !== 0) {
      throw new Error(`${seedEnv} must be a hex string of even length (no 0x prefix).`);
    }
    return { kind: 'seed', value: seedHex };
  }

  throw new Error(
    `Either ${mnemonicEnv} or ${seedEnv} is required for network '${network}'.\n` +
      `Put one in contract/.env.${network}, and fund it from the faucet first.`,
  );
}
