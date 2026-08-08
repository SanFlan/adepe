/**
 * The app imports the compiled contract from `../contract/contracts/managed`, which is
 * generated output and is not committed. Without this check, a fresh clone fails with an
 * unresolved-import error that says nothing about what to do next.
 */

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const entry = fileURLToPath(
  new URL('../../contract/contracts/managed/hello-world/contract/index.js', import.meta.url),
);

if (!existsSync(entry)) {
  console.error(
    [
      '',
      'The contract has not been compiled.',
      '',
      '  cd ../contract && yarn compile',
      '',
      `Expected: ${entry}`,
      '',
    ].join('\n'),
  );
  process.exit(1);
}
