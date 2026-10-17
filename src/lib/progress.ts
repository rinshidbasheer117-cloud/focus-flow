import { createStore, uid } from "./store";
import { markDirty } from "./sync/dirty";

export interface SessionLog {
  id: string;
  taskId?: string | undefined;
  startedAt: number;
  endedAt: number;
  focusedSec: number;
  interruptions: number;
  completedTimer: boolean;
  helpful?: boolean | null | undefined;
}
export interface StepEvent { id: string; at: number; taskId: string; }
interface Progress { sessions: SessionLog[]; steps: StepEvent[]; }

export const progressStore = createStore<Progress>("fb.progress", { sessions: [], steps: [] });
export const useProgress = progressStore.use;

/**
 * Session id is derived from its start time so two devices recording the same
 * focus block produce the same record (no duplicates after sync).
 */
export const sessionIdFor = (startedAt: number) =>
  `00000000-0000-4000-8000-${Math.floor(startedAt).toString(16).padStart(12, "0").slice(-12)}`;

export function logSession(s: Omit<SessionLog, "id">) {
  if (s.focusedSec < 5) return null; // ignore accidental starts
  const entry = { ...s, id: sessionIdFor(s.startedAt) };
  progressStore.set((p) => ({ ...p, sessions: [...p.sessions.filter((x) => x.id !== entry.id), entry] }));
  markDirty(`session:${entry.id}`);
  return entry;
}
export function rateSession(id: string, helpful: boolean) {
  progressStore.set((p) => ({ ...p, sessions: p.sessions.map((s) => (s.id === id ? { ...s, helpful } : s)) }));
  markDirty(`session:${id}`);
}
export function logStep(taskId: string) {
  const ev = { id: uid(), at: Date.now(), taskId };
  progressStore.set((p) => ({ ...p, steps: [...p.steps, ev] }));
  markDirty(`event:${ev.id}`);
}
