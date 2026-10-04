// Small helpers for the things the UI remembers between visits. Every read and write is inside try/catch: the game
// works with no storage at all (private windows, blocked cookies), it just forgets.

/** Read a JSON value from localStorage, or the fallback when it is missing, unreadable or storage is unavailable. */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write a JSON value to localStorage. Returns false when it could not be saved. */
export function writeJson(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** True once a one-time flag has been set; setting it is remembered. */
export function readFlag(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(key: string): void {
  try {
    window.localStorage.setItem(key, '1');
  } catch {
    /* the flag just does not outlast this page */
  }
}
