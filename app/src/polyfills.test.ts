/**
 * The Node globals the Midnight libraries expect.
 *
 * This exists because the bug it guards was invisible to every other test. jsdom runs under
 * Node, where `Buffer` is already global, so the whole suite passed while the browser threw
 * "ReferenceError: Buffer is not defined" the moment a transaction was submitted. The only
 * way to test it is to take the global away first.
 *
 * @vitest-environment jsdom
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

const globals = globalThis as unknown as Record<string, unknown>;

const withoutNodeGlobals = async <T>(run: () => Promise<T>): Promise<T> => {
  const buffer = globals['Buffer'];
  const global_ = globals['global'];
  delete globals['Buffer'];
  delete globals['global'];
  try {
    return await run();
  } finally {
    globals['Buffer'] = buffer;
    globals['global'] = global_;
  }
};

afterEach(() => vi.resetModules());

describe('polyfills', () => {
  it('defines a working Buffer where the platform has none', async () => {
    await withoutNodeGlobals(async () => {
      expect(globals['Buffer']).toBeUndefined();

      vi.resetModules();
      await import('./polyfills.js');

      expect(globals['Buffer']).toBeDefined();
      // Defined is not enough: the transaction path calls these.
      const Buf = globals['Buffer'] as typeof Buffer & {
        // Node declares isView on the global Buffer; @types/node's BufferConstructor
        // does not, and the `buffer` package omits it entirely — which is the bug.
        isView(value: unknown): boolean;
      };
      expect(Buf.from('adepe', 'utf8').toString('hex')).toBe('6164657065');
      expect(Buf.from('6164657065', 'hex').toString('utf8')).toBe('adepe');
      expect(Buf.isView(new Uint8Array(2))).toBe(true);
      expect(Buf.isView({})).toBe(false);
    });
  });

  it('defines global for dependencies that expect it', async () => {
    await withoutNodeGlobals(async () => {
      vi.resetModules();
      await import('./polyfills.js');
      expect(globals['global']).toBe(globalThis);
    });
  });

  it('leaves an existing Buffer alone', async () => {
    const sentinel = { marker: 'platform' };
    const original = globals['Buffer'];
    globals['Buffer'] = sentinel;
    try {
      vi.resetModules();
      await import('./polyfills.js');
      expect(globals['Buffer']).toBe(sentinel);
    } finally {
      globals['Buffer'] = original;
    }
  });
});
