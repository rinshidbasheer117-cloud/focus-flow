/**
 * Cloud sync engine. Local stores are the working copy (instant UI, offline);
 * this pushes dirty keys to Lovable Cloud and pulls remote changes.
 * Security lives in the database (row-level policies); nothing here is trusted.
 */
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
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
let generation = 0;
class AccountChanged extends Error {}
type SyncRun = { uid: string; generation: number; cloud: SupabaseClient<Database> };
function assertCurrent(run: SyncRun) {
  if (run.uid !== userId || run.generation !== generation) throw new AccountChanged();
}

class OfflineError extends Error {}
function check<T>(res: { data: T; error: { message: string; code?: string | undefined } | null }): NonNullable<T> | (T extends null ? never : T) {
  if (res.error) {
    const m = res.error.message || "";
    if (/fetch|network|Failed to fetch|Load failed/i.test(m)) throw new OfflineError(m);
    const e = new Error(m) as Error & { code?: string | undefined };
    e.code = res.error.code;
    throw e;
  }
  return res.data as never;
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

async function pushKey(key: string, run: SyncRun): Promise<void> {
  assertCurrent(run);
  const { uid, cloud } = run;
  if (key.startsWith("task:")) {
    const id = key.slice(5);
    const tasks = tasksStore.get().tasks;
    const idx = tasks.findIndex((t) => t.id === id);
    let payload: Record<string, unknown>;
    const task = tasks[idx];
    if (task) payload = taskPayload(task, idx);
    else {
      const del = tombstoneStore.get().ids[id];
      if (!del) return;
      payload = { id, title: "deleted", updated_at: iso(del), deleted_at: iso(del), steps: [] };
    }
    const r = check(await cloud.rpc("sync_task", { p: payload as never }));
    assertCurrent(run);
    if (r === "stale" && task) {
      toast("Kept a newer version from another device", { description: `“${task.title}” was changed elsewhere more recently.` });
    }
    if (idx < 0) tombstoneStore.set((s) => { const ids = { ...s.ids }; delete ids[id]; return { ids }; });
    return;
  }
  if (key === "prefs") {
    const p = prefsStore.get();
    check(await cloud.from("profiles").upsert({
      user_id: uid, onboarded: p.onboarded, genres: p.genres, energy: p.energy, vocals: p.vocals,
      session_minutes: p.sessionMinutes, break_minutes: p.breakMinutes, animations: p.animations,
      reduced_motion: p.reducedMotion, reminders: p.reminders, updated_at: new Date(p.updatedAt || Date.now()).toISOString(),
    }));
    return;
  }
  if (key === "feedback") {
    const f = feedbackStore.get();
    check(await cloud.rpc("sync_feedback" as never, { p: { likes: f.likes, dislikes: f.dislikes, updated_at: new Date(f.updatedAt || Date.now()).toISOString() } } as never));
    return;
  }
  if (key === "active") {
    const s = sessionStore.get();
    check(await cloud.from("active_sessions").upsert({ user_id: uid, state: s as never, updated_at: new Date(s.updatedAt || Date.now()).toISOString() }));
    return;
  }
  if (key.startsWith("session:")) {
    const s = progressStore.get().sessions.find((x) => x.id === key.slice(8));
    if (!s) return;
    const knownTask = s.taskId && tasksStore.get().tasks.some((t) => t.id === s.taskId);
    check(await cloud.from("focus_sessions").upsert({
      id: s.id, user_id: uid, task_id: knownTask && s.taskId ? s.taskId : null, started_at: new Date(s.startedAt).toISOString(), ended_at: new Date(Math.max(s.endedAt, s.startedAt)).toISOString(),
      focused_sec: Math.max(0, Math.min(86400, Math.round(s.focusedSec))), interruptions: s.interruptions,
      completed_timer: s.completedTimer, helpful: s.helpful ?? null, updated_at: new Date(s.updatedAt ?? s.endedAt).toISOString(),
    }));
    return;
  }
  if (key.startsWith("event:")) {
    const e = progressStore.get().steps.find((x) => x.id === key.slice(6));
    if (!e) return;
    check(await cloud.from("step_events").upsert({ id: e.id, user_id: uid, task_id: e.taskId, at: new Date(e.at).toISOString() }, { onConflict: "id", ignoreDuplicates: true }));
  }
}

const order = (k: string) => (k.startsWith("task:") ? 0 : k === "prefs" ? 1 : k.startsWith("session:") ? 2 : 3);

async function pushAll(run: SyncRun) {
  const keys = Object.entries(dirtyStore.get().keys).sort((a, b) => order(a[0]) - order(b[0]));
  for (const [key, version] of keys) {
    try {
      await pushKey(key, run);
      assertCurrent(run);
      clearDirty(key, version);
    } catch (e) {
      assertCurrent(run);
      if (e instanceof OfflineError) throw e;
      const code = (e as { code?: string }).code;
      if (code === "PGRST301" || /JWT|not authenticated/i.test((e as Error).message)) {
        const { data } = await supabase.auth.getUser();
        if (!data.user) { await supabase.auth.signOut(); throw e; }
        throw new OfflineError("auth refresh");
      }
      toast.error("A change couldn't be saved to your account", { description: (e as Error).message });
      throw e; // Retain the local version and retry; never pull over a rejected change.
    }
  }
}

/* ---------------- pull ---------------- */

async function pullAll(run: SyncRun) {
  assertCurrent(run);
  const { uid, cloud } = run;
  const [profile, tasksR, stepsR, sessionsR, eventsR, fbR, active] = await Promise.all([
    cloud.from("profiles").select("*").eq("user_id", uid).maybeSingle().then(check),
    cloud.from("tasks").select("*").order("position").then(check),
    cloud.from("task_steps").select("*").order("position").then(check),
    cloud.from("focus_sessions").select("*").order("ended_at").then(check),
    cloud.from("step_events").select("*").order("at").then(check),
    cloud.from("music_feedback").select("*").then(check),
    cloud.from("active_sessions").select("*").eq("user_id", uid).maybeSingle().then(check),
  ]);
  assertCurrent(run);
  const tasks = tasksR ?? [], steps = stepsR ?? [], sessions = sessionsR ?? [], events = eventsR ?? [], fb = fbR ?? [];

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
      createdAt: ms(r.created_at) ?? 0, completedAt: ms(r.completed_at), updatedAt: ms(r.updated_at),
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
        .filter((t) => isDirty(`task:${t.id}`) || (remoteById.has(t.id) && !remoteById.get(t.id)?.deleted_at))
        .map((t) => { const remote = remoteById.get(t.id); return isDirty(`task:${t.id}`) || !remote ? t : toTask(remote); });
      for (const r of tasks) if (!r.deleted_at && !localById.has(r.id) && !tombstoneStore.get().ids[r.id]) merged.push(toTask(r));
    }
    tasksStore.set({ tasks: merged });

    // History: union by id (records are append-only apart from the helpful rating).
    const p = progressStore.get();
    const sess = new Map<string, SessionLog>(p.sessions.map((s) => [s.id, s]));
    for (const r of sessions) if (!isDirty(`session:${r.id}`)) sess.set(r.id, {
      id: r.id, taskId: r.task_id ?? undefined, startedAt: ms(r.started_at) ?? 0, endedAt: ms(r.ended_at) ?? 0, focusedSec: r.focused_sec,
      interruptions: r.interruptions, completedTimer: r.completed_timer, helpful: r.helpful, updatedAt: ms(r.updated_at),
    });
    const evs = new Map<string, StepEvent>(p.steps.map((e) => [e.id, e]));
    for (const r of events) evs.set(r.id, { id: r.id, taskId: r.task_id, at: ms(r.at) ?? 0 });
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
  const uid = userId, currentGeneration = generation;
  running = (async () => {
    syncStore.set((s) => ({ ...s, status: "syncing" }));
    try {
      const { data, error } = await supabase.auth.getSession();
      if (currentGeneration !== generation || uid !== userId) throw new AccountChanged();
      if (error || !data.session || data.session.user.id !== uid) throw new OfflineError("Sign in again to sync your saved changes.");
      // Pin this run to its original identity, even if another account signs in mid-request.
      const token = data.session.access_token;
      const cloud = createClient<Database>(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
        accessToken: async () => token,
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const run = { uid, generation: currentGeneration, cloud };
      await pushAll(run);
      await pullAll(run);
      assertCurrent(run);
      retryDelay = 2000;
      syncStore.set((s) => ({ ...s, status: "idle", ready: true, lastSyncedAt: Date.now(), error: undefined }));
    } catch (e) {
      if (e instanceof AccountChanged || currentGeneration !== generation) return;
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
  generation++;
  if (flushTimer) clearTimeout(flushTimer);
  running = null;
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
  generation++;
  userId = null;
  running = null;
  rerun = false;
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
