/**
 * Publish the contract's proving keys and zkIR so the browser can fetch them.
 *
 * Proving in the browser needs the same artifacts the Node tests read off disk, but a
 * page can only fetch them over HTTP. Vite serves `public/` at the site root, so they are
 * copied to `public/zk/{keys,zkir}` and read back by `BrowserZkConfigProvider`.
 *
 * The copy is generated output: it is gitignored, and refreshed on every dev/build so it
 * cannot go stale against a recompiled contract.
 */

import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const managed = fileURLToPath(
  new URL('../../contract/contracts/managed/hello-world/', import.meta.url),
);
const target = fileURLToPath(new URL('../public/zk/', import.meta.url));

for (const dir of ['keys', 'zkir']) {
  try {
    await stat(new URL(dir, `file://${managed}`));
  } catch {
    console.error(`Missing ${managed}${dir}. Run: cd ../contract && yarn compile`);
    process.exit(1);
  }
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(`${managed}keys`, `${target}keys`, { recursive: true });
await cp(`${managed}zkir`, `${target}zkir`, { recursive: true });

console.log(`zk assets → ${target}`);
