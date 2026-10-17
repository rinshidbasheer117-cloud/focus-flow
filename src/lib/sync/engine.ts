/**
 * Cloud sync engine. Local stores are the working copy (instant UI, offline);
 * this pushes dirty keys to Lovable Cloud and pulls remote changes.
 * Security lives in the database (row-level policies); nothing here is trusted.
 */
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createStore } from "../store";
import { tasksStore, type Task, type Priority } from "../tasks";
import { prefsStore, defaultPrefs, type Preferences, type Genre } from "../prefs";
import { progressStore, type SessionLog, type StepEvent } from "../progress";
import { sessionStore, type FocusSession } from "../session";
import { feedbackStore } from "../music/recommend";
import { dirtyStore, tombstoneStore, clearDirty, isDirty, onDirty, withoutTracking } from "./dirty";

export type SyncStatus = "idle" | "syncing" | "offline" | "error";
export const syncStore = createStore<{ status: SyncStatus; ready: boolean; lastSyncedAt?: number | undefined; error?: string | undefined; userId?: string | undefined }>(
  "fb.syncState", { status: "idle", ready: false }, false,
);
export const useSync = syncStore.use;

const BOUND_KEY = "fb.boundUser";
export const GUEST_BACKUP_KEY = "fb.guestBackup";
const iso = (ms?: number | null) => (ms ? new Date(ms).toISOString() : null);
const ms = (s?: string | null) => (s ? new Date(s).getTime() : undefined);

let userId: string | null = null;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelay = 2000;
let running: Promise<void> | null = null;
let rerun = false;

class OfflineError extends Error {}
function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    const m = res.error.message || "";
    if (/fetch|network|Failed to fetch|Load failed/i.test(m)) throw new OfflineError(m);
    const e = new Error(m) as Error & { code?: string };
    e.code = res.error.code;
    throw e;
  }
  return res.data;
}

/* ---------------- push ---------------- */

function taskPayload(t: Task, position: number) {
  return {
    id: t.id, title: t.title, priority: t.priority, deadline: t.deadline ?? null, done: t.done,
    completed_at: iso(t.completedAt), position, deleted_at: null,
    created_at: iso(t.createdAt), updated_at: iso(t.updatedAt ?? t.createdAt),
    steps: t.steps.map((s) => ({ id: s.id, title: s.title, done: s.done })),
  };
}

async function pushKey(key: string): Promise<void> {
  const uid = userId!;
  if (key.startsWith("task:")) {
    const id = key.slice(5);
    const tasks = tasksStore.get().tasks;
    const idx = tasks.findIndex((t) => t.id === id);
    let payload: Record<string, unknown>;
    if (idx >= 0) payload = taskPayload(tasks[idx]!, idx);
    else {
      const del = tombstoneStore.get().ids[id];
      if (!del) return;
      payload = { id, title: "deleted", updated_at: iso(del), deleted_at: iso(del), steps: [] };
    }
    const r = check(await supabase.rpc("sync_task", { p: payload as never }));
    if (r === "stale" && idx >= 0) {
      toast("Kept a newer version from another device", { description: `“${tasks[idx]!.title}” was changed elsewhere more recently.` });
    }
    if (idx < 0) tombstoneStore.set((s) => { const ids = { ...s.ids }; delete ids[id]; return { ids }; });
    return;
  }
  if (key === "prefs") {
    const p = prefsStore.get();
    check(await supabase.from("profiles").upsert({
      user_id: uid, onboarded: p.onboarded, genres: p.genres, energy: p.energy, vocals: p.vocals,
      session_minutes: p.sessionMinutes, break_minutes: p.breakMinutes, animations: p.animations,
      reduced_motion: p.reducedMotion, reminders: p.reminders, updated_at: iso(p.updatedAt || Date.now())!,
    }));
    return;
  }
  if (key === "feedback") {
    const f = feedbackStore.get();
    check(await supabase.from("music_feedback").delete().eq("user_id", uid));
    const rows = [...f.likes.map((t) => ({ user_id: uid, track_id: t, kind: "like" })), ...f.dislikes.map((t) => ({ user_id: uid, track_id: t, kind: "dislike" }))];
    if (rows.length) check(await supabase.from("music_feedback").insert(rows));
    return;
  }
  if (key === "active") {
    const s = sessionStore.get();
    check(await supabase.from("active_sessions").upsert({ user_id: uid, state: s as never, updated_at: iso(s.updatedAt || Date.now())! }));
    return;
  }
  if (key.startsWith("session:")) {
    const s = progressStore.get().sessions.find((x) => x.id === key.slice(8));
    if (!s) return;
    const knownTask = s.taskId && tasksStore.get().tasks.some((t) => t.id === s.taskId);
    check(await supabase.from("focus_sessions").upsert({
      id: s.id, user_id: uid, task_id: knownTask ? s.taskId! : null, started_at: iso(s.startedAt)!, ended_at: iso(Math.max(s.endedAt, s.startedAt))!,
      focused_sec: Math.max(0, Math.min(86400, Math.round(s.focusedSec))), interruptions: s.interruptions,
      completed_timer: s.completedTimer, helpful: s.helpful ?? null, updated_at: new Date().toISOString(),
    }));
    return;
  }
  if (key.startsWith("event:")) {
    const e = progressStore.get().steps.find((x) => x.id === key.slice(6));
    if (!e) return;
    check(await supabase.from("step_events").upsert({ id: e.id, user_id: uid, task_id: e.taskId, at: iso(e.at)! }, { onConflict: "id", ignoreDuplicates: true }));
  }
}

const order = (k: string) => (k.startsWith("task:") ? 0 : k === "prefs" ? 1 : k.startsWith("session:") ? 2 : 3);

async function pushAll() {
  const keys = Object.entries(dirtyStore.get().keys).sort((a, b) => order(a[0]) - order(b[0]));
  for (const [key, version] of keys) {
    try {
      await pushKey(key);
      clearDirty(key, version);
    } catch (e) {
      if (e instanceof OfflineError) throw e;
      const code = (e as { code?: string }).code;
      if (code === "PGRST301" || /JWT|not authenticated/i.test((e as Error).message)) {
        const { data } = await supabase.auth.getUser();
        if (!data.user) { await supabase.auth.signOut(); throw e; }
        throw new OfflineError("auth refresh");
      }
      // Rejected by validation/authorization: drop it so the queue can't jam, and tell the user.
      clearDirty(key, version);
      toast.error("A change couldn't be saved to your account", { description: (e as Error).message });
    }
  }
}

/* ---------------- pull ---------------- */

async function pullAll() {
  const uid = userId!;
  const [profile, tasks, steps, sessions, events, fb, active] = await Promise.all([
    supabase.from("profiles").select("*").eq("user_id", uid).maybeSingle().then(check),
    supabase.from("tasks").select("*").order("position").then(check),
    supabase.from("task_steps").select("*").order("position").then(check),
    supabase.from("focus_sessions").select("*").order("ended_at").then(check),
    supabase.from("step_events").select("*").order("at").then(check),
    supabase.from("music_feedback").select("*").then(check),
    supabase.from("active_sessions").select("*").eq("user_id", uid).maybeSingle().then(check),
  ]);

  withoutTracking(() => {
    // Preferences: newest wins, unless a local change is still pending.
    if (profile && !isDirty("prefs")) {
      const remote = ms(profile.updated_at) ?? 0;
      if (remote > prefsStore.get().updatedAt) {
        const next: Preferences = {
          ...defaultPrefs, onboarded: profile.onboarded, genres: profile.genres as Genre[], energy: profile.energy as Preferences["energy"],
          vocals: profile.vocals as Preferences["vocals"], sessionMinutes: profile.session_minutes, breakMinutes: profile.break_minutes,
          animations: profile.animations, reducedMotion: profile.reduced_motion, reminders: profile.reminders, updatedAt: remote,
        };
        prefsStore.set(next);
      }
    }

    // Tasks
    const stepsBy = new Map<string, typeof steps>();
    for (const s of steps) stepsBy.set(s.task_id, [...(stepsBy.get(s.task_id) ?? []), s]);
    const toTask = (r: (typeof tasks)[number]): Task => ({
      id: r.id, title: r.title, priority: r.priority as Priority, deadline: r.deadline ?? undefined, done: r.done,
      createdAt: ms(r.created_at)!, completedAt: ms(r.completed_at), updatedAt: ms(r.updated_at),
      steps: (stepsBy.get(r.id) ?? []).map((s) => ({ id: s.id, title: s.title, done: s.done })),
    });
    const local = tasksStore.get().tasks;
    const localById = new Map(local.map((t) => [t.id, t]));
    const remoteById = new Map(tasks.map((r) => [r.id, r]));
    const anyTaskDirty = Object.keys(dirtyStore.get().keys).some((k) => k.startsWith("task:"));
    let merged: Task[];
    if (!anyTaskDirty) {
      merged = tasks.filter((r) => !r.deleted_at).map(toTask);
    } else {
      // Keep local order while local edits are pending; refresh untouched tasks.
      merged = local
        .filter((t) => isDirty(`task:${t.id}`) || (remoteById.has(t.id) && !remoteById.get(t.id)!.deleted_at))
        .map((t) => (isDirty(`task:${t.id}`) ? t : toTask(remoteById.get(t.id)!)));
      for (const r of tasks) if (!r.deleted_at && !localById.has(r.id) && !tombstoneStore.get().ids[r.id]) merged.push(toTask(r));
    }
    tasksStore.set({ tasks: merged });

    // History: union by id (records are append-only apart from the helpful rating).
    const p = progressStore.get();
    const sess = new Map<string, SessionLog>(p.sessions.map((s) => [s.id, s]));
    for (const r of sessions) if (!isDirty(`session:${r.id}`)) sess.set(r.id, {
      id: r.id, taskId: r.task_id ?? undefined, startedAt: ms(r.started_at)!, endedAt: ms(r.ended_at)!, focusedSec: r.focused_sec,
      interruptions: r.interruptions, completedTimer: r.completed_timer, helpful: r.helpful,
    });
    const evs = new Map<string, StepEvent>(p.steps.map((e) => [e.id, e]));
    for (const r of events) evs.set(r.id, { id: r.id, taskId: r.task_id, at: ms(r.at)! });
    progressStore.set({ sessions: [...sess.values()].sort((a, b) => a.endedAt - b.endedAt), steps: [...evs.values()].sort((a, b) => a.at - b.at) });

    if (!isDirty("feedback")) feedbackStore.set({ likes: fb.filter((f) => f.kind === "like").map((f) => f.track_id), dislikes: fb.filter((f) => f.kind === "dislike").map((f) => f.track_id) });

    // Unfinished timer from another device: restore if newer. endsAt is absolute, so remaining time is exact.
    if (active && !isDirty("active")) {
      const remote = ms(active.updated_at) ?? 0;
      if (remote > (sessionStore.get().updatedAt ?? 0)) {
        const st = active.state as unknown as FocusSession;
        const remaining = st.status === "running" && st.endsAt ? Math.max(0, Math.ceil((st.endsAt - Date.now()) / 1000)) : st.remainingSec;
        sessionStore.set({ ...st, remainingSec: remaining, updatedAt: remote });
      }
    }
  });
}

/* ---------------- orchestration ---------------- */

export function syncNow(): Promise<void> {
  if (!userId) return Promise.resolve();
  if (running) { rerun = true; return running; }
  running = (async () => {
    syncStore.set((s) => ({ ...s, status: "syncing" }));
    try {
      await pushAll();
      await pullAll();
      retryDelay = 2000;
      syncStore.set((s) => ({ ...s, status: "idle", ready: true, lastSyncedAt: Date.now(), error: undefined }));
    } catch (e) {
      const offline = e instanceof OfflineError || (typeof navigator !== "undefined" && !navigator.onLine);
      syncStore.set((s) => ({ ...s, status: offline ? "offline" : "error", error: (e as Error).message }));
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => void syncNow(), retryDelay);
      retryDelay = Math.min(retryDelay * 2, 60000);
    } finally {
      running = null;
      if (rerun) { rerun = false; void syncNow(); }
    }
  })();
  return running;
}

function schedule() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => void syncNow(), 600);
}

const STORES = [tasksStore, prefsStore, progressStore, sessionStore, feedbackStore, dirtyStore, tombstoneStore];
export const hasLocalData = () => tasksStore.get().tasks.length > 0 || progressStore.get().sessions.length > 0 || progressStore.get().steps.length > 0;
export const pendingChanges = () => Object.keys(dirtyStore.get().keys).length;

/** Bind the local cache to a signed-in user. Guest (pre-account) data is set aside for an explicit import. */
export async function startSync(uid: string) {
  if (userId === uid) return;
  userId = uid;
  const bound = localStorage.getItem(BOUND_KEY);
  if (bound !== uid) {
    if (!bound && hasLocalData() && !localStorage.getItem(GUEST_BACKUP_KEY)) {
      localStorage.setItem(GUEST_BACKUP_KEY, JSON.stringify({
        savedAt: Date.now(), prefs: prefsStore.get(), tasks: tasksStore.get().tasks, progress: progressStore.get(), feedback: feedbackStore.get(),
      }));
    }
    STORES.forEach((s) => s.reset());
    localStorage.setItem(BOUND_KEY, uid);
  }
  syncStore.set({ status: "idle", ready: false, userId: uid });
  onDirty(schedule);
  await syncNow();
}

export function stopSync() {
  userId = null;
  onDirty(null);
  if (flushTimer) clearTimeout(flushTimer);
  syncStore.set({ status: "idle", ready: false });
}

/** Sign-out: clear this device's copy so the next person can't see it. */
export function clearLocalAccountData() {
  stopSync();
  STORES.forEach((s) => s.reset());
  localStorage.removeItem(BOUND_KEY);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void syncNow());
  window.addEventListener("focus", () => void syncNow());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void syncNow(); });
  setInterval(() => { if (userId && document.visibilityState === "visible") void syncNow(); }, 30000);
}
