// Tiny localStorage wrapper. Storage can be unavailable (private mode, sandboxes), so never throw.
export function load(key, fallback) {
  try {
    const v = localStorage.getItem(`safetypath:${key}`);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(`safetypath:${key}`, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10);
