import { useSyncExternalStore } from "react";

/**
 * Tiny persisted store (localStorage). Phase 1 persistence layer.
 * Swap `storage` for a remote adapter (e.g. Lovable Cloud) in Phase 2.
 */
export function createStore<T extends object>(key: string, initial: T, persist = true) {
  let state = initial;
  let loaded = false;
  const subs = new Set<() => void>();
  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    if (!persist) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) state = { ...initial, ...JSON.parse(raw) };
    } catch {
      /* corrupted storage: fall back to defaults */
    }
  };
  const get = () => {
    load();
    return state;
  };
  const set = (next: T | ((s: T) => T)) => {
    load();
    state = typeof next === "function" ? (next as (s: T) => T)(state) : next;
    if (persist && typeof window !== "undefined") localStorage.setItem(key, JSON.stringify(state));
    subs.forEach((s) => s());
  };
  const subscribe = (cb: () => void) => {
    subs.add(cb);
    return () => void subs.delete(cb);
  };
  const use = () => useSyncExternalStore(subscribe, get, () => initial);
  const reset = () => set(initial);
  return { get, set, subscribe, use, key, reset, initial };
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
