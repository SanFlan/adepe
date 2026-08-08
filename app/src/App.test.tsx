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
  // The open tab now lives in the hash, which jsdom keeps between tests.
  window.history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('App', () => {
  it('opens on the overview', async () => {
    await render();
    expect(container.textContent).toContain('ADEPE');
    expect(container.textContent).toContain('What the world can see');
    expect(container.textContent).toContain('HORIZON-1');
    expect(container.textContent).toContain('VANGUARD-5');
  });

  it('seeds two patient profiles', async () => {
    await render();
    const options = [...container.querySelectorAll('option')].map((o) => o.textContent);
    expect(options.some((text) => text?.includes('Marta Ilves'))).toBe(true);
  });

  describe('patients', () => {
    const rows = () => [...container.querySelectorAll('.roster tbody tr')];

    it('lists the roster and marks who you are acting as', async () => {
      await render();
      await clickText('Patients');

      expect(rows()).toHaveLength(2);
      expect(container.textContent).toContain('acting as');
      expect(rows().filter((row) => row.className.includes('is-selected'))).toHaveLength(1);
      expect(rows()[0]!.textContent).toContain('Acting as');
    });

    it('switches who you are acting as, and the phone follows', async () => {
      await render();
      await clickText('Patients');

      const second = rows()[1]!;
      const name = second.querySelector('td')!.textContent!;
      await act(async () => {
        (second.querySelector('button') as HTMLButtonElement).click();
      });

      await clickText('Patient App');
      expect(container.querySelector('.passport')?.textContent).toContain(
        name.split('PT-')[0]!.trim(),
      );
    });

    it('adds a random patient', async () => {
      await render();
      await clickText('Patients');
      await clickText('+ Random patient');
      expect(rows()).toHaveLength(3);
    });

    it('removes a patient, and never the last one', async () => {
      await render();
      await clickText('Patients');

      const removeButtons = () =>
        rows().map((row) => row.querySelectorAll('button')[1] as HTMLButtonElement);
      await act(async () => removeButtons()[1]!.click());
      expect(rows()).toHaveLength(1);
      expect(removeButtons()[0]!.disabled).toBe(true);
    });

    it('keeps acting as somebody after removing the active patient', async () => {
      await render();
      await clickText('Patients');

      await act(async () => {
        (rows()[0]!.querySelectorAll('button')[1] as HTMLButtonElement).click();
      });
      expect(rows()).toHaveLength(1);
      expect(rows()[0]!.className).toContain('is-selected');
      expect(rows()[0]!.textContent).toContain('Acting as');
    });
  });

  it('warns that a fresh profile holds no credential', async () => {
    await render();
    await clickText('Trials');
    expect(container.textContent).toContain('This record is not signed yet');
  });

  it('renders every tab without throwing', async () => {
    await render();
    for (const tab of [
      'Credential',
      'Clinic',
      'Record Editor',
      'Overview',
      'Patient App',
      'Patients',
      'Config',
      'Trials',
    ]) {
      await clickText(tab);
      expect(container.textContent).toBeTruthy();
    }
  });

  it('shows the issuer key and the six signed fields', async () => {
    await render();
    await clickText('Record Editor');
    expect(container.textContent).toContain('Northgate Oncology');
    expect(container.textContent).toContain('The six signed fields');
  });

  /** The path the demo video follows, end to end. */
  it('signs a record and enrolls the patient in a trial she qualifies for', async () => {
    await render();

    await clickText('Record Editor');
    await clickText('Save & sign as Northgate Oncology');

    await clickText('Trials');
    expect(container.textContent).not.toContain('This record is not signed yet');

    const cardFor = (code: string) =>
      [...container.querySelectorAll('article.trial')].find((article) =>
        article.textContent?.includes(code),
      );

    // Marta is treatment-naive at 54: inside HORIZON-1, outside VANGUARD-5's 65+ floor.
    // Assert on the pill tone, since "eligible" is a substring of "not eligible".
    expect(cardFor('HORIZON-1')?.querySelector('.pill.good')?.textContent).toBe('eligible');
    expect(cardFor('VANGUARD-5')?.querySelector('.pill.bad')?.textContent).toBe(
      'not eligible',
    );

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
    expect(container.textContent).not.toContain('This record is not signed yet');
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

  /** The patient's phone: the same provider, seen from the other side. */
  describe('patient app', () => {
    const phoneTab = (label: string) =>
      [...container.querySelectorAll('.phone-tabs button')].find((button) =>
        button.textContent?.includes(label),
      );

    it('tells an unsigned patient to see their clinic', async () => {
      await render();
      await clickText('Patient App');

      expect(container.querySelector('.phone')).not.toBeNull();
      expect(container.textContent).toContain('Not yet signed by your clinic');
      expect(container.querySelector('.passport.is-invalid')).not.toBeNull();
    });

    it('walks from passport to enrolment', async () => {
      await render();

      // The clinic attests first; nothing is applyable before that.
      await clickText('Clinic');
      await clickText('Sign all (2)');

      await clickText('Patient App');
      expect(container.querySelector('.passport.is-valid')).not.toBeNull();

      await act(async () => phoneTab('Trials')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      ));
      expect(container.textContent).toContain('you may qualify');

      // Open HORIZON-1, which Marta clears.
      const card = [...container.querySelectorAll('.phone-card')].find((element) =>
        element.textContent?.includes('HORIZON-1'),
      )!;
      await act(async () => card.dispatchEvent(new MouseEvent('click', { bubbles: true })));
      expect(container.textContent).toContain('Eligibility');

      const cta = container.querySelector('.phone-cta') as HTMLButtonElement;
      expect(cta.textContent).toContain('Apply privately');
      await act(async () => cta.click());
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      });

      // A confirmation a patient can read, with no proof timings in it.
      const sheet = container.querySelector('.phone-sheet')!;
      expect(sheet).not.toBeNull();
      expect(sheet.textContent).toContain('You’re all set');
      expect(sheet.textContent).toContain('We’ll contact you shortly');
      expect(sheet.textContent).not.toMatch(/\d+ms/);
      expect(sheet.querySelector('.tick-mark')).not.toBeNull();

      // Done dismisses it and lands on the applications tab.
      await act(async () => (sheet.querySelector('.phone-cta') as HTMLButtonElement).click());
      expect(container.querySelector('.phone-sheet')).toBeNull();
      expect(container.textContent).toContain('You hold a place in 1 trial');
      expect(container.textContent).toContain('HORIZON-1');
    });

    it('will not let an ineligible patient apply', async () => {
      await render();
      await clickText('Clinic');
      await clickText('Sign all (2)');
      await clickText('Patient App');

      await act(async () => phoneTab('Trials')!.dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      ));
      // Marta is 54; VANGUARD-5 starts at 65.
      const card = [...container.querySelectorAll('.phone-card')].find((element) =>
        element.textContent?.includes('VANGUARD-5'),
      )!;
      await act(async () => card.dispatchEvent(new MouseEvent('click', { bubbles: true })));

      const cta = container.querySelector('.phone-cta') as HTMLButtonElement;
      expect(cta.disabled).toBe(true);
      expect(cta.textContent).toContain('do not match');
    });
  });

  describe('record editor', () => {
    const editor = () => container.querySelector('textarea') as HTMLTextAreaElement;

    // Both the editor and the Clinic view explain what a stale attestation is, so the
    // phrase is always present as prose. Only the roster's status pills are evidence.
    const rosterStatuses = () =>
      [...container.querySelectorAll('.roster .pill')].map((pill) => pill.textContent);

    const type = async (text: string) => {
      const area = editor();
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      )!.set!;
      setter.call(area, text);
      await act(async () => {
        area.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };

    it('saves an edit without signing it, leaving the attestation stale', async () => {
      await render();
      await clickText('Clinic');
      await clickText('Sign all (2)');

      await clickText('Record Editor');
      const edited = editor().value.replace('"chemotherapy": false', '"chemotherapy": true');
      expect(edited).not.toBe(editor().value);
      await type(edited);
      expect(container.textContent).toContain('unsaved changes');

      await clickText('Save record');
      expect(container.textContent).not.toContain('unsaved changes');

      // Saving must not re-sign: the attestation now covers a record that changed.
      await clickText('Clinic');
      expect(rosterStatuses()).toContain('record changed since signing');
    });

    it('propagates a renamed patient to the switcher and the phone', async () => {
      await render();
      await clickText('Record Editor');
      await type(editor().value.replace('"displayName": "Marta Ilves"', '"displayName": "Marta Ilves-Rand"'));
      await clickText('Save record');

      // Header switcher.
      const options = [...container.querySelectorAll('option')].map((o) => o.textContent);
      expect(options.some((text) => text?.includes('Marta Ilves-Rand'))).toBe(true);

      // The phone greets by first name and the passport shows the full one.
      await clickText('Patient App');
      expect(container.textContent).toContain('Hello, Marta');
      expect(container.querySelector('.passport')?.textContent).toContain('Marta Ilves-Rand');

      // Clinic roster too.
      await clickText('Clinic');
      expect(container.querySelector('.roster')?.textContent).toContain('Marta Ilves-Rand');
    });

    it('keeps the existing name when the record blanks it', async () => {
      await render();
      await clickText('Record Editor');
      await type(editor().value.replace('"displayName": "Marta Ilves"', '"displayName": ""'));
      await clickText('Save record');

      const options = [...container.querySelectorAll('option')].map((o) => o.textContent);
      expect(options.some((text) => text?.includes('Marta Ilves'))).toBe(true);
    });

    it('reverts an edit', async () => {
      await render();
      await clickText('Record Editor');
      const original = editor().value;
      await type(original.replace('"age": 54', '"age": 61'));
      expect(container.textContent).toContain('unsaved changes');

      await clickText('Revert');
      expect(editor().value).toBe(original);
      expect(container.textContent).not.toContain('unsaved changes');
    });

    it('signing saves and attests in one step', async () => {
      await render();
      await clickText('Record Editor');
      await type(editor().value.replace('"age": 54', '"age": 61'));

      await clickText('Save & sign as Northgate Oncology');
      expect(container.textContent).not.toContain('unsaved changes');
      expect(editor().value).toContain('"age": 61');

      await clickText('Clinic');
      expect(rosterStatuses()).not.toContain('record changed since signing');
      expect(rosterStatuses()).toContain('signed');
    });
  });

  it('offers a standalone popup for the patient app', async () => {
    await render();
    await clickText('Patient App');

    const opened: Array<[string, string, string]> = [];
    const original = window.open;
    // jsdom does not implement window.open, so record the call instead.
    (window as unknown as { open: unknown }).open = (...args: [string, string, string]) => {
      opened.push(args);
      return null;
    };
    try {
      await clickText('Open as a standalone app ↗');
    } finally {
      window.open = original;
    }

    expect(opened).toHaveLength(1);
    const [url, name, features] = opened[0]!;
    expect(url).toContain('kiosk=1');
    expect(url).toContain('mode=mocked');
    expect(name).toBe('adepe-phone');
    expect(features).toContain('popup=yes');
  });

  it('reports preview as unavailable rather than crashing', async () => {
    await render();
    await clickText('Config');

    const preview = [...container.querySelectorAll('.modes .mode')].find((button) =>
      button.textContent?.includes('Preview testnet'),
    ) as HTMLButtonElement;
    expect(preview).toBeDefined();
    await act(async () => preview.click());
    await act(async () => {
      await Promise.resolve();
    });

    expect(container.textContent).toContain('is not available');
    expect(container.textContent).toContain('needs a connected Lace wallet');
  });
});
