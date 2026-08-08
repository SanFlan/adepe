/**
 * A deterministic `localStorage` for tests.
 *
 * Node 22+ exposes an experimental built-in `localStorage` that shadows the one jsdom
 * installs and refuses to work without `--localstorage-file`. Rather than depend on which
 * of the two wins, tests get a plain in-memory implementation that starts empty.
 */

class MemoryStorage implements Storage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

Object.defineProperty(globalThis, 'localStorage', {
  value: new MemoryStorage(),
  configurable: true,
  writable: true,
});
