import { createStore } from "../store";

/**
 * Change tracking for cloud sync. Domain modules mark keys dirty; the sync
 * engine pushes them. Keys: "task:<id>", "prefs", "feedback", "active",
 * "session:<id>", "event:<id>". Each key carries a version so a change made
 * while a push is in flight is never cleared by that push.
 */
export const dirtyStore = createStore<{ keys: Record<string, number> }>("fb.dirty", { keys: {} });
export const tombstoneStore = createStore<{ ids: Record<string, number> }>("fb.tombstones", { ids: {} });

let listener: (() => void) | null = null;
let suspended = false;
export const onDirty = (fn: (() => void) | null) => void (listener = fn);
/** Suspend tracking while applying data that came from the cloud. */
export function withoutTracking(fn: () => void) {
  suspended = true;
  try { fn(); } finally { suspended = false; }
}
export function markDirty(key: string) {
  if (suspended) return;
  dirtyStore.set((s) => ({ keys: { ...s.keys, [key]: (s.keys[key] ?? 0) + 1 } }));
  listener?.();
}
export const isDirty = (key: string) => key in dirtyStore.get().keys;
export function clearDirty(key: string, version: number) {
  dirtyStore.set((s) => {
    if (s.keys[key] !== version) return s;
    const keys = { ...s.keys };
    delete keys[key];
    return { keys };
  });
}
