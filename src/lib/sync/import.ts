import { uid } from "../store";
import { tasksStore, type Task } from "../tasks";
import { prefsStore, type Preferences } from "../prefs";
import { progressStore, sessionIdFor, type SessionLog, type StepEvent } from "../progress";
import { feedbackStore } from "../music/recommend";
import { markDirty } from "./dirty";
import { GUEST_BACKUP_KEY, syncNow } from "./engine";

export interface GuestBackup {
  savedAt: number;
  prefs: Preferences;
  tasks: Task[];
  progress: { sessions: SessionLog[]; steps: (Partial<StepEvent> & { at: number; taskId: string })[] };
  feedback: { likes: string[]; dislikes: string[] };
}

export function readBackup(): GuestBackup | null {
  try {
    const raw = localStorage.getItem(GUEST_BACKUP_KEY);
    return raw ? (JSON.parse(raw) as GuestBackup) : null;
  } catch { return null; }
}

/** What would collide with account data — shown to the user before importing. */
export function analyze(b: GuestBackup) {
  const cloud = tasksStore.get().tasks;
  const cloudIds = new Map(cloud.map((t) => [t.id, t]));
  const sameId = b.tasks.filter((t) => cloudIds.has(t.id));
  const cloudTitles = new Set(cloud.map((t) => t.title.trim().toLowerCase()));
  const sameTitle = b.tasks.filter((t) => !cloudIds.has(t.id) && cloudTitles.has(t.title.trim().toLowerCase()));
  const p = prefsStore.get();
  const prefsDiffer = p.onboarded && (["genres", "energy", "vocals", "sessionMinutes", "breakMinutes", "animations", "reducedMotion", "reminders"] as const)
    .some((k) => JSON.stringify(p[k]) !== JSON.stringify(b.prefs[k]));
  return { cloudTaskCount: cloud.length, sameId, sameTitle, prefsDiffer, cloudHasPrefs: p.onboarded };
}

export type PrefsChoice = "account" | "device";
export type DuplicateChoice = "keep-both" | "skip";

/** Merge — never overwrites: same-id conflicts keep whichever copy is newer; account prefs kept unless user picks device. */
export function importBackup(b: GuestBackup, opts: { prefs: PrefsChoice; duplicates: DuplicateChoice }) {
  const cloud = tasksStore.get().tasks;
  const byId = new Map(cloud.map((t) => [t.id, t]));
  const titles = new Set(cloud.map((t) => t.title.trim().toLowerCase()));
  const next = [...cloud];
  for (const t of b.tasks) {
    const updatedAt = t.updatedAt ?? t.completedAt ?? t.createdAt;
    const existing = byId.get(t.id);
    if (existing) {
      if (updatedAt > (existing.updatedAt ?? 0)) {
        next[next.indexOf(existing)] = { ...t, updatedAt };
        markDirty(`task:${t.id}`);
      }
      continue;
    }
    if (opts.duplicates === "skip" && titles.has(t.title.trim().toLowerCase())) continue;
    next.push({ ...t, updatedAt: Date.now() });
    markDirty(`task:${t.id}`);
  }
  tasksStore.set({ tasks: next });

  const p = progressStore.get();
  const sess = new Map(p.sessions.map((s) => [s.id, s]));
  for (const s of b.progress.sessions) {
    const id = sessionIdFor(s.startedAt);
    if (!sess.has(id)) { sess.set(id, { ...s, id }); markDirty(`session:${id}`); }
  }
  const evs = new Map(p.steps.map((e) => [e.id, e]));
  for (const e of b.progress.steps) {
    const id = e.id ?? uid();
    if (!evs.has(id)) { evs.set(id, { id, at: e.at, taskId: e.taskId }); markDirty(`event:${id}`); }
  }
  progressStore.set({ sessions: [...sess.values()].sort((a, c) => a.endedAt - c.endedAt), steps: [...evs.values()].sort((a, c) => a.at - c.at) });

  const f = feedbackStore.get();
  const likes = new Set(f.likes), dislikes = new Set(f.dislikes);
  for (const id of b.feedback.likes) if (!dislikes.has(id)) likes.add(id);
  for (const id of b.feedback.dislikes) if (!likes.has(id)) dislikes.add(id);
  feedbackStore.set({ likes: [...likes], dislikes: [...dislikes] });
  markDirty("feedback");

  if (opts.prefs === "device" || !prefsStore.get().onboarded) {
    prefsStore.set({ ...b.prefs, onboarded: true, updatedAt: Date.now() });
    markDirty("prefs");
  }
  localStorage.removeItem(GUEST_BACKUP_KEY);
  return syncNow();
}

export function downloadBackup(b: GuestBackup) {
  const blob = new Blob([JSON.stringify(b, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "focusbeat-device-data.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
export const discardBackup = () => localStorage.removeItem(GUEST_BACKUP_KEY);
