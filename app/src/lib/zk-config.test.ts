/**
 * The browser ZK config provider. Fetch is stubbed: what is under test is the URL layout
 * (which must match what `sync-zk-assets.mjs` writes), the caching, and the error message
 * someone sees when the assets are missing.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrowserZkConfigProvider } from './zk-config.js';

const bytes = new Uint8Array([1, 2, 3]);

const stubFetch = (ok = true) =>
  vi.fn(async (url: string): Promise<Response> =>
    ok
      ? ({ ok: true, arrayBuffer: async () => bytes.buffer } as unknown as Response)
      : ({ ok: false, status: 404, url } as unknown as Response),
  );

afterEach(() => vi.unstubAllGlobals());

describe('BrowserZkConfigProvider', () => {
  it('reads the layout NodeZkConfigProvider also expects', async () => {
    const fetchStub = stubFetch();
    vi.stubGlobal('fetch', fetchStub);
    const provider = new BrowserZkConfigProvider<'Verify'>('http://host/zk');

    await provider.getProverKey('Verify');
    await provider.getVerifierKey('Verify');
    await provider.getZKIR('Verify');

    expect(fetchStub.mock.calls.map((call) => call[0])).toEqual([
      'http://host/zk/keys/Verify.prover',
      'http://host/zk/keys/Verify.verifier',
      'http://host/zk/zkir/Verify.bzkir',
    ]);
  });

  it('tolerates a trailing slash on the base URL', async () => {
    const fetchStub = stubFetch();
    vi.stubGlobal('fetch', fetchStub);
    await new BrowserZkConfigProvider<'Verify'>('http://host/zk/').getProverKey('Verify');
    expect(fetchStub.mock.calls[0]![0]).toBe('http://host/zk/keys/Verify.prover');
  });

  it('fetches each artifact once', async () => {
    const fetchStub = stubFetch();
    vi.stubGlobal('fetch', fetchStub);
    const provider = new BrowserZkConfigProvider<'Verify'>('http://host/zk');

    // Prover keys are multiple MB; re-downloading per call would be very visible.
    await Promise.all([provider.getProverKey('Verify'), provider.getProverKey('Verify')]);
    await provider.getProverKey('Verify');

    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('says what to run when the assets are missing', async () => {
    vi.stubGlobal('fetch', stubFetch(false));
    await expect(
      new BrowserZkConfigProvider<'Verify'>('http://host/zk').getProverKey('Verify'),
    ).rejects.toThrow(/sync:zk/);
  });
});
