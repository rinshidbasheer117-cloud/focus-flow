/**
 * Auth & persistence interface (Phase 1: anonymous local device user).
 * Phase 2: implement with Lovable Cloud auth + per-user row-level policies.
 * No secrets or service keys are ever shipped to the browser.
 */
export interface AuthUser { id: string; email?: string; anonymous: boolean; }
export interface AuthAdapter {
  getUser(): Promise<AuthUser>;
  exportData(): Promise<Record<string, unknown>>;
  deleteAllData(): Promise<void>;
}
const KEYS = ["fb.prefs", "fb.tasks", "fb.progress", "fb.session", "fb.musicFeedback"];

export const localAuth: AuthAdapter = {
  getUser: async () => ({ id: "local-device", anonymous: true }),
  exportData: async () =>
    Object.fromEntries(KEYS.map((k) => [k, JSON.parse(localStorage.getItem(k) ?? "null")])),
  deleteAllData: async () => KEYS.forEach((k) => localStorage.removeItem(k)),
};
