/**
 * The preview provider's failure paths, with a fake wallet injected.
 *
 * The happy path needs Lace, a funded account and a proof server, so it cannot be tested
 * here. What can be tested is everything that happens when one of those is missing — which
 * is most of what a person actually hits — and that none of it throws. A mode that crashes
 * the page when a wallet is absent is worse than one that is simply unavailable.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PreviewProvider } from './preview.js';
import deployment from '../../../deployment.preview.json';

type FakeWallet = {
  apiVersion: string;
  connect: (networkId: string) => Promise<unknown>;
};

const install = (wallets: Record<string, Partial<FakeWallet>> | undefined) => {
  if (wallets === undefined) {
    delete (window as { midnight?: unknown }).midnight;
    return;
  }
  (window as { midnight?: unknown }).midnight = wallets;
};

/** A wallet that connects and reports whatever configuration the test asks for. */
const walletReporting = (
  config: Record<string, unknown>,
  apiVersion = '4.0.0',
  dust: { cap: bigint; balance: bigint } | null = { cap: 100n, balance: 100n },
) => ({
  lace: {
    apiVersion,
    connect: vi.fn(async () => ({
      getConfiguration: async () => config,
      getDustBalance: async () => {
        if (dust === null) throw new Error('unsupported');
        return dust;
      },
      getShieldedAddresses: async () => ({
        shieldedCoinPublicKey: 'coin',
        shieldedEncryptionPublicKey: 'enc',
      }),
    })),
  },
});

const workingConfig = {
  networkId: 'preview',
  indexerUri: 'https://indexer.example/graphql',
  indexerWsUri: 'wss://indexer.example/graphql/ws',
  proverServerUri: 'http://127.0.0.1:6300',
};

afterEach(() => install(undefined));

describe('preview provider', () => {
  it('targets the address the deploy script recorded', () => {
    expect(deployment.contractAddress).toMatch(/^[0-9a-f]{64}$/);
    expect(deployment.networkId).toBe('preview');
  });

  it('says to install a wallet when none is injected', async () => {
    install(undefined);
    const provider = new PreviewProvider();
    await provider.init();

    expect(provider.status().ready).toBe(false);
    expect(provider.status().detail).toContain('Install Lace');
  });

  it('says to update when the connector major version is not ours', async () => {
    install({ lace: { apiVersion: '3.2.1', connect: vi.fn() } });
    const provider = new PreviewProvider();
    await provider.init();

    expect(provider.status().ready).toBe(false);
    expect(provider.status().detail).toContain('Update Lace');
  });

  it('refuses to act when the wallet is on a different network', async () => {
    install(walletReporting({ networkId: 'preprod', indexerUri: 'x', indexerWsUri: 'y' }));
    const provider = new PreviewProvider();
    await provider.init();

    expect(provider.status().ready).toBe(false);
    expect(provider.status().detail).toContain("Lace is on 'preprod'");
    expect(provider.status().detail).toContain("'preview'");
  });

  it('reports a missing proof server rather than failing later', async () => {
    install(
      walletReporting({
        networkId: 'preview',
        indexerUri: 'x',
        indexerWsUri: 'y',
        proverServerUri: undefined,
      }),
    );
    const provider = new PreviewProvider();
    await provider.init();

    expect(provider.status().ready).toBe(false);
    expect(provider.status().detail).toContain('proof server');
  });

  /**
   * NIGHT is not DUST. Fees are paid in DUST, which registered NIGHT generates, so a
   * wallet can hold plenty of tNIGHT and still be unable to pay. Left unchecked this
   * surfaces at *balancing* — after the proof is built and the password is typed — as an
   * Effect FiberFailure with an empty message.
   */
  it('refuses when the wallet holds no DUST, before anything is proved', async () => {
    install(walletReporting(workingConfig, '4.0.0', { cap: 5000n, balance: 0n }));
    const provider = new PreviewProvider();
    await provider.init();

    expect(provider.status().ready).toBe(false);
    expect(provider.status().detail).toContain('no DUST');
    expect(provider.status().detail).toContain('register');
  });

  /**
   * The deployment registered exactly one issuer key, so a build signing with a different
   * one produces applications that are refused after proving and paying — and the refusal
   * looks identical to not qualifying. Changing VITE_ISSUER_SEED without deploying again
   * is the way to cause that, and this is what notices.
   */
  it('signs with the issuer the deployment registered', async () => {
    const { issuerPublicKey } = await import('../lib/issuer.js');
    expect(issuerPublicKey.x.toString()).toBe(deployment.issuerPublicKey.x);
    expect(issuerPublicKey.y.toString()).toBe(deployment.issuerPublicKey.y);
  });

  it('surfaces a rejected connection instead of throwing', async () => {
    install({
      lace: {
        apiVersion: '4.0.0',
        connect: vi.fn(async () => {
          throw new Error('User declined');
        }),
      },
    });
    const provider = new PreviewProvider();
    await expect(provider.init()).resolves.toBeUndefined();

    expect(provider.status().ready).toBe(false);
    expect(provider.status().detail).toContain('User declined');
  });

  it('stays usable as a provider while disconnected', async () => {
    install(undefined);
    const provider = new PreviewProvider();
    await provider.init();

    // The views call these on every render, connected or not.
    expect(provider.listTrials()).toHaveLength(deployment.trials.length);
    expect(provider.listTrials().every((entry) => !entry.open)).toBe(true);
    expect(provider.ledgerPanels().length).toBeGreaterThan(0);
    await expect(provider.reset()).resolves.toBeUndefined();

    const result = await provider.enroll(
      { userSecret: '00'.repeat(32), credential: null } as never,
      1n,
    );
    expect(result.outcome).toBe('error');
  });
});
