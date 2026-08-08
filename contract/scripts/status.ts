/**
 * Read a deployment's public state straight from the indexer.
 *
 *   make status-preview          (or: MIDNIGHT_NETWORK=preview yarn status)
 *
 * No wallet, no proof server, no private state: this is exactly what any observer of the
 * chain can see, which makes it both a health check and a fair demonstration of how little
 * the ledger actually discloses.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';

import { getConfig } from '../src/config.js';
import { ledger } from '../contracts/index.js';
import { TRIALS } from '../../app/src/lib/trials.js';

// @ts-expect-error apollo needs a global WebSocket
globalThis.WebSocket = WebSocket;

const network = process.env['MIDNIGHT_NETWORK'] ?? 'preview';

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

async function main(): Promise<void> {
  const config = getConfig();
  setNetworkId(config.networkId);

  const address =
    process.env['ADEPE_CONTRACT_ADDRESS'] ??
    (
      JSON.parse(
        readFileSync(
          fileURLToPath(new URL(`../../deployment.${network}.json`, import.meta.url)),
          'utf8',
        ),
      ) as { contractAddress: string }
    ).contractAddress;

  const provider = indexerPublicDataProvider(config.indexer, config.indexerWS);
  const state = await provider.queryContractState(address);
  if (state === null) {
    throw new Error(`No contract at ${address} on '${network}'`);
  }

  const view = ledger(state.data);

  console.log(`\n  ${network}  ${address}\n`);
  console.log(`  contractAdmin   ${toHex(view.contractAdmin).slice(0, 24)}…`);
  console.log(`  providers       ${view.providers.size()} registered\n`);

  let total = 0n;
  for (const trial of TRIALS) {
    if (!view.ElegiblePeople.member(trial.id)) {
      console.log(`  ${trial.code.padEnd(12)} not open`);
      continue;
    }
    const size = view.ElegiblePeople.lookup(trial.id).size();
    total += size;
    const criteria = view.TrialRestrictions.lookup(trial.id);
    console.log(
      `  ${trial.code.padEnd(12)} ${String(size).padStart(3)} enrolled` +
        `   ages ${criteria.ageMin}-${criteria.ageMax}`,
    );
  }
  console.log(`\n  ${total} enrollments in total.`);
  console.log('  Pseudonyms only. Nothing here says who, or why anyone was turned away.\n');

  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
