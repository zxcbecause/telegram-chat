/**
 * localStorage wrapper that never throws (private mode, quota, disabled storage).
 * Everything is namespaced and scoped per instance so two GREEN-API instances
 * used in the same browser don't mix chats.
 */
const PREFIX = 'max-chat:';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — the app keeps working in memory */
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export const keys = {
  session: 'session',
  theme: 'theme',
  chats: (idInstance: string) => `chats:${idInstance}`,
};
