import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./engine", () => ({ GUEST_BACKUP_KEY: "fb.guestBackup", syncNow: vi.fn(async () => {}), pendingChanges: () => 1, syncStore: { get: () => ({ status: "offline", ready: true }) } }));
import { dirtyStore, clearDirty, markDirty } from "./dirty";
import { importBackup, type GuestBackup } from "./import";
import { tasksStore } from "../tasks";
import { sessionStore, configure, start, tick } from "../session";
import { progressStore } from "../progress";
import { prefsStore } from "../prefs";
import { feedbackStore } from "../music/recommend";
beforeEach(() => { localStorage.clear(); [tasksStore, sessionStore, progressStore, prefsStore, feedbackStore, dirtyStore].forEach(s => s.reset()); });
describe("Phase 2 persistence safeguards", () => {
  it("keeps a newer edit dirty when an earlier write finishes", () => {
    markDirty("prefs"); const version = dirtyStore.get().keys.prefs ?? 0;
    markDirty("prefs"); clearDirty("prefs", version);
    expect(dirtyStore.get().keys.prefs).toBe(version + 1);
  });
  it("timer completion never completes its task", () => {
    tasksStore.set({ tasks: [{ id: "task", title: "Open task", priority: "medium", done: false, createdAt: 1, steps: [{ id: "step", title: "First step", done: false }] }] });
    configure(1); start(1000); expect(tick(61000)).toBe(true);
    expect(tasksStore.get().tasks[0]?.done).toBe(false);
    expect(tasksStore.get().tasks[0]?.steps[0]?.done).toBe(false);
  });
  it("restores elapsed time from the end timestamp", () => {
    configure(1); start(1000); tick(31000);
    expect(sessionStore.get().remainingSec).toBe(30);
  });
  it("preserves account conflicts and the original backup after an offline import", async () => {
    const task = { id: "same", title: "Account copy", priority: "medium" as const, done: false, createdAt: 1, updatedAt: 2, steps: [] };
    tasksStore.set({ tasks: [task] });
    const b: GuestBackup = { savedAt: 1, tasks: [{ ...task, title: "Device copy", updatedAt: 3 }], prefs: prefsStore.get(), progress: { sessions: [], steps: [] }, feedback: { likes: [], dislikes: [] } };
    localStorage.setItem("fb.guestBackup", JSON.stringify(b));
    await expect(importBackup(b, { prefs: "account", duplicates: "skip" })).rejects.toThrow("original backup is safe");
    expect(tasksStore.get().tasks[0]?.title).toBe("Account copy");
    expect(localStorage.getItem("fb.guestBackup")).not.toBeNull();
  });
  it("uses a device conflict only when explicitly chosen", async () => {
    const task = { id: "same", title: "Account copy", priority: "medium" as const, done: false, createdAt: 1, updatedAt: 2, steps: [] };
    tasksStore.set({ tasks: [task] });
    const b: GuestBackup = { savedAt: 1, tasks: [{ ...task, title: "Device copy" }], prefs: prefsStore.get(), progress: { sessions: [], steps: [] }, feedback: { likes: [], dislikes: [] } };
    await expect(importBackup(b, { prefs: "account", duplicates: "skip", conflicts: "device" })).rejects.toThrow();
    expect(tasksStore.get().tasks[0]?.title).toBe("Device copy");
  });
});