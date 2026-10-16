import { createStore } from "./store";
import { logSession } from "./progress";

export type SessionStatus = "idle" | "running" | "paused" | "finished";
export interface FocusSession {
  mode: "focus" | "break";
  status: SessionStatus;
  taskId?: string | undefined;
  durationSec: number;
  remainingSec: number;
  endsAt?: number | undefined;
  startedAt?: number | undefined;
  interruptions: number;
  lastLogId?: string | undefined;
}

const initial: FocusSession = { mode: "focus", status: "idle", durationSec: 25 * 60, remainingSec: 25 * 60, interruptions: 0 };
export const sessionStore = createStore<FocusSession>("fb.session", initial);
export const useSession = sessionStore.use;
const set = (p: Partial<FocusSession>) => sessionStore.set((s) => ({ ...s, ...p }));

export const selectTask = (taskId?: string) => set({ taskId });

export function configure(minutes: number, mode: FocusSession["mode"] = "focus") {
  const d = Math.max(1, Math.round(minutes)) * 60;
  set({ mode, status: "idle", durationSec: d, remainingSec: d, endsAt: undefined, startedAt: undefined, interruptions: 0, lastLogId: undefined });
}
export function start(now = Date.now()) {
  const s = sessionStore.get();
  if (s.status === "running") return;
  set({ status: "running", endsAt: now + s.remainingSec * 1000, startedAt: s.startedAt ?? now });
}
export function pause(now = Date.now()) {
  const s = sessionStore.get();
  if (s.status !== "running" || !s.endsAt) return;
  set({ status: "paused", remainingSec: Math.max(0, Math.ceil((s.endsAt - now) / 1000)), endsAt: undefined, interruptions: s.interruptions + 1 });
}
export const resume = start;

function record(completedTimer: boolean, now: number) {
  const s = sessionStore.get();
  if (s.mode !== "focus" || !s.startedAt) return undefined;
  const remaining = s.status === "running" && s.endsAt ? Math.max(0, (s.endsAt - now) / 1000) : s.remainingSec;
  return logSession({
    taskId: s.taskId, startedAt: s.startedAt, endedAt: now,
    focusedSec: Math.round(s.durationSec - remaining), interruptions: s.interruptions, completedTimer,
  })?.id;
}
/** Reset: logs the partial session (if any) and restores full duration. Never touches tasks. */
export function reset(now = Date.now()) {
  record(false, now);
  const s = sessionStore.get();
  set({ status: "idle", remainingSec: s.durationSec, endsAt: undefined, startedAt: undefined, interruptions: 0 });
}
/** Called by the ticker. Returns true when the timer just finished. Timer end NEVER completes tasks. */
export function tick(now = Date.now()): boolean {
  const s = sessionStore.get();
  if (s.status !== "running" || !s.endsAt) return false;
  const remaining = Math.max(0, Math.ceil((s.endsAt - now) / 1000));
  if (remaining > 0) {
    if (remaining !== s.remainingSec) set({ remainingSec: remaining });
    return false;
  }
  const lastLogId = record(true, now);
  set({ status: "finished", remainingSec: 0, endsAt: undefined, lastLogId });
  return true;
}

export const fmt = (sec: number) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
