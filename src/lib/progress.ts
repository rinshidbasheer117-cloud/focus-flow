import { createStore, uid } from "./store";

export interface SessionLog {
  id: string;
  taskId?: string;
  startedAt: number;
  endedAt: number;
  focusedSec: number;
  interruptions: number;
  completedTimer: boolean;
  helpful?: boolean | null;
}
interface Progress { sessions: SessionLog[]; steps: { at: number; taskId: string }[]; }

export const progressStore = createStore<Progress>("fb.progress", { sessions: [], steps: [] });
export const useProgress = progressStore.use;

export function logSession(s: Omit<SessionLog, "id">) {
  if (s.focusedSec < 5) return null; // ignore accidental starts
  const entry = { ...s, id: uid() };
  progressStore.set((p) => ({ ...p, sessions: [...p.sessions, entry] }));
  return entry;
}
export const rateSession = (id: string, helpful: boolean) =>
  progressStore.set((p) => ({ ...p, sessions: p.sessions.map((s) => (s.id === id ? { ...s, helpful } : s)) }));
export const logStep = (taskId: string) =>
  progressStore.set((p) => ({ ...p, steps: [...p.steps, { at: Date.now(), taskId }] }));
