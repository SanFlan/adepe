/**
 * Proving keys and zkIR, fetched over HTTP.
 *
 * `NodeZkConfigProvider` reads these off disk, which a browser cannot do. The layout is
 * the same one it expects -- `keys/<circuit>.prover`, `keys/<circuit>.verifier`,
 * `zkir/<circuit>.bzkir` -- so `scripts/sync-zk-assets.mjs` can copy the compiler's output
 * into `public/zk` unchanged.
 *
 * The prover keys are several MB each, so responses are cached: proving three circuits in
 * a demo should not re-download them three times.
 */

import {
  ZKConfigProvider,
  createProverKey,
  createVerifierKey,
  createZKIR,
  type ProverKey,
  type VerifierKey,
  type ZKIR,
} from '@midnight-ntwrk/midnight-js-types';

export class BrowserZkConfigProvider<K extends string> extends ZKConfigProvider<K> {
  private readonly cache = new Map<string, Promise<Uint8Array>>();

  /** @param baseUrl Directory holding `keys/` and `zkir/`. */
  constructor(private readonly baseUrl: string) {
    super();
  }

  private fetchBytes(path: string): Promise<Uint8Array> {
    const cached = this.cache.get(path);
    if (cached !== undefined) return cached;

    const pending = (async () => {
      const url = `${this.baseUrl.replace(/\/$/, '')}/${path}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Could not fetch ${url} (${response.status}). ` +
            'Run `npm run sync:zk` after compiling the contract.',
        );
      }
      return new Uint8Array(await response.arrayBuffer());
    })();

    this.cache.set(path, pending);
    return pending;
  }

  async getProverKey(circuitId: K): Promise<ProverKey> {
    return createProverKey(await this.fetchBytes(`keys/${circuitId}.prover`));
  }

  async getVerifierKey(circuitId: K): Promise<VerifierKey> {
    return createVerifierKey(await this.fetchBytes(`keys/${circuitId}.verifier`));
  }

  async getZKIR(circuitId: K): Promise<ZKIR> {
    return createZKIR(await this.fetchBytes(`zkir/${circuitId}.bzkir`));
  }
}
