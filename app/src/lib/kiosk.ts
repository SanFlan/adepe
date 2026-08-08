/**
 * Kiosk mode: the patient app alone, in a chromeless popup window.
 *
 * Lives in its own module rather than in `App` because `MobileView` needs the opener and
 * `App` renders `MobileView` — importing it from `App` would make the two circular.
 *
 * Profiles live in localStorage, which the popup shares with the window that opened it, so
 * a `storage` listener keeps them in step and the popup follows the patient switcher.
 * Ledger state is another matter: `mocked` is also localStorage-backed and therefore
 * shared, while `simulated` and `proofs` hold their ledger in memory, so the popup runs
 * its own.
 */

import { MODES, type Mode } from '../providers/types.js';

const params = () => new URLSearchParams(window.location.search);

export const isKiosk = (): boolean => params().has('kiosk');

/** The mode a kiosk window was opened with, defaulting to mocked. */
export const initialMode = (): Mode => {
  const requested = params().get('mode');
  return MODES.some((entry) => entry.id === requested) ? (requested as Mode) : 'mocked';
};

export const openPhoneWindow = (mode: Mode): void => {
  const url = new URL(window.location.href);
  url.searchParams.set('kiosk', '1');
  url.searchParams.set('mode', mode);
  // Height tracks the screen so the phone gets the laptop's full vertical space.
  const height = Math.min(window.screen.availHeight - 40, 1100);
  const width = 430;
  window.open(
    url.toString(),
    'adepe-phone',
    `popup=yes,width=${width},height=${height},` +
      `left=${Math.max(0, window.screen.availWidth - width - 60)},top=20`,
  );
};
