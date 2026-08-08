/**
 * A smoke test for the React layer.
 *
 * It does not assert on layout -- it catches the class of failure that only shows up once
 * the components actually run: a bad import, a hook order problem, a crash on first
 * paint, or a view that throws when a profile has no credential yet.
 *
 * @vitest-environment jsdom
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { App } from './App.js';

setNetworkId('undeployed');

let container: HTMLDivElement;
let root: Root;

const render = async () => {
  await act(async () => {
    root.render(<App />);
  });
  // Let the provider's async init settle and re-render.
  await act(async () => {
    await Promise.resolve();
  });
};

const clickText = async (text: string) => {
  const target = [...container.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === text,
  );
  expect(target, `no button labelled "${text}"`).toBeDefined();
  await act(async () => {
    target!.click();
  });
};

beforeEach(() => {
  localStorage.clear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('App', () => {
  it('renders the trial catalogue on first load', async () => {
    await render();
    expect(container.textContent).toContain('ADEPE');
    expect(container.textContent).toContain('HORIZON-1');
    expect(container.textContent).toContain('VANGUARD-5');
  });

  it('seeds two patient profiles', async () => {
    await render();
    const options = [...container.querySelectorAll('option')].map((o) => o.textContent);
    expect(options.some((text) => text?.includes('Marta Ilves'))).toBe(true);
  });

  it('warns that a fresh profile holds no credential', async () => {
    await render();
    expect(container.textContent).toContain('has not been signed yet');
  });

  it('renders every tab without throwing', async () => {
    await render();
    for (const tab of ['My record', 'Clinic', 'Record editor', 'Overview', 'Trials']) {
      await clickText(tab);
      expect(container.textContent).toBeTruthy();
    }
  });

  it('shows the issuer key and the six signed fields', async () => {
    await render();
    await clickText('Record editor');
    expect(container.textContent).toContain('Northgate Oncology');
    expect(container.textContent).toContain('The six signed fields');
  });

  /** The path the demo video follows, end to end. */
  it('signs a record and enrolls the patient in a trial she qualifies for', async () => {
    await render();

    await clickText('Record editor');
    await clickText('Sign as Northgate Oncology');

    await clickText('Trials');
    expect(container.textContent).not.toContain('has not been signed yet');

    const cardFor = (code: string) =>
      [...container.querySelectorAll('article.trial')].find((article) =>
        article.textContent?.includes(code),
      );

    // Marta is treatment-naive at 54: inside HORIZON-1, outside VANGUARD-5's 65+ floor.
    expect(cardFor('HORIZON-1')?.textContent).toContain('appears eligible');
    expect(cardFor('VANGUARD-5')?.textContent).toContain('not eligible');

    const apply = cardFor('HORIZON-1')!.querySelector('button')!;
    await act(async () => {
      apply.click();
    });
    // The mocked provider deliberately pauses to represent proving time.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    });

    expect(cardFor('HORIZON-1')?.textContent).toContain('Accepted');
    expect(cardFor('HORIZON-1')?.textContent).toContain('enrolled');

    await clickText('Overview');
    expect(container.textContent).toContain('1 enrollments');
  });

  /** The clinic roster: one issuer, every patient, independent of the header switcher. */
  it('signs every patient from the clinic roster in one action', async () => {
    await render();
    await clickText('Clinic');

    const rows = () => [...container.querySelectorAll('table.roster tbody tr')];
    expect(rows()).toHaveLength(2); // the two seeded profiles
    expect(container.textContent).toContain('2 awaiting a usable attestation');
    expect(rows().every((row) => row.textContent?.includes('not signed'))).toBe(true);

    await clickText('Sign all (2)');

    expect(rows().every((row) => row.textContent?.includes('signed'))).toBe(true);
    expect(container.textContent).toContain('0 awaiting a usable attestation');

    // Both patients, not just the one the header has selected.
    await clickText('Trials');
    expect(container.textContent).not.toContain('has not been signed yet');
  });

  it('marks an attestation from the unregistered issuer as untrusted', async () => {
    await render();
    await clickText('Clinic');

    const issuerSelect = [...container.querySelectorAll('select')].find((select) =>
      select.textContent?.includes('not registered'),
    )!;
    await act(async () => {
      issuerSelect.value = 'rogue';
      issuerSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    await clickText('Sign all (2)');
    expect(container.textContent).toContain('signed by an unregistered issuer');
    expect(container.textContent).toContain('Backstreet Diagnostics');
  });

  it('reports testnet as unavailable rather than crashing', async () => {
    await render();
    const select = container.querySelector('select')!;
    await act(async () => {
      select.value = 'preview';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.textContent).toContain('is not available');
  });
});
