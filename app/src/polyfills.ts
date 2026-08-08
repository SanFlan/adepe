/**
 * Node globals that the Midnight libraries expect and a browser does not have.
 *
 * `Buffer` is used on the transaction path — serializing a call, hashing, hex conversion —
 * so the failure only appears when you submit something, not at load. It surfaces as
 * "ReferenceError: Buffer is not defined" from inside the transaction machinery, which
 * gives no hint that a polyfill is what is missing.
 *
 * Imported first in `main.tsx`. ES modules evaluate imports in declaration order, so this
 * runs before anything that might touch these at module scope.
 */

import { Buffer } from 'buffer';

const globals = globalThis as unknown as Record<string, unknown>;

globals['Buffer'] ??= Buffer;

/**
 * `Buffer.isView` is missing from the `buffer` package.
 *
 * Node has it, the polyfill does not, and the bundle calls it — so shipping the polyfill
 * alone moves the failure rather than fixing it. It is a thin wrapper over
 * `ArrayBuffer.isView`, which is what Node's own implementation does.
 */
const installed = globals['Buffer'] as { isView?: unknown };
installed.isView ??= ArrayBuffer.isView;

// A handful of dependencies reference `global` rather than `globalThis`.
globals['global'] ??= globalThis;
