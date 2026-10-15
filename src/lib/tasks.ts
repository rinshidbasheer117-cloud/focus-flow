import { createStore, uid } from "./store";
import { logStep } from "./progress";

export type Priority = "high" | "medium" | "low";
export interface Step { id: string; title: string; done: boolean; }
export interface Task {
  id: string;
  title: string;
  priority: Priority;
  deadline?: string;
  steps: Step[];
  done: boolean;
  createdAt: number;
  completedAt?: number;
}

export const tasksStore = createStore<{ tasks: Task[] }>("fb.tasks", { tasks: [] });
export const useTasks = () => tasksStore.use().tasks;

const mut = (fn: (t: Task[]) => Task[]) => tasksStore.set((s) => ({ tasks: fn(s.tasks) }));
const patch = (id: string, fn: (t: Task) => Task) => mut((ts) => ts.map((t) => (t.id === id ? fn(t) : t)));

export function addTask(input: { title: string; priority: Priority; deadline?: string; steps?: string[] }) {
  const title = input.title.trim();
  if (!title) return null;
  const task: Task = {
    id: uid(), title, priority: input.priority, deadline: input.deadline || undefined,
    steps: (input.steps ?? []).filter((s) => s.trim()).map((s) => ({ id: uid(), title: s.trim(), done: false })),
    done: false, createdAt: Date.now(),
  };
  mut((ts) => [...ts, task]);
  return task;
}
export const updateTask = (id: string, p: Partial<Pick<Task, "title" | "priority" | "deadline">>) => patch(id, (t) => ({ ...t, ...p }));
export const deleteTask = (id: string) => mut((ts) => ts.filter((t) => t.id !== id));
export function moveTask(id: string, dir: -1 | 1) {
  mut((ts) => {
    const i = ts.findIndex((t) => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ts.length) return ts;
    const c = [...ts];
    [c[i], c[j]] = [c[j], c[i]];
    return c;
  });
}
export function toggleTask(id: string) {
  patch(id, (t) => ({ ...t, done: !t.done, completedAt: !t.done ? Date.now() : undefined }));
}
export const addStep = (id: string, title: string) =>
  title.trim() && patch(id, (t) => ({ ...t, steps: [...t.steps, { id: uid(), title: title.trim(), done: false }] }));
export const removeStep = (id: string, stepId: string) => patch(id, (t) => ({ ...t, steps: t.steps.filter((s) => s.id !== stepId) }));
export function toggleStep(id: string, stepId: string) {
  let completed = false;
  patch(id, (t) => ({
    ...t,
    steps: t.steps.map((s) => {
      if (s.id !== stepId) return s;
      completed = !s.done;
      return { ...s, done: !s.done };
    }),
  }));
  if (completed) logStep(id);
}

const prioRank: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
/** Open tasks: manual order first, priority as tie-breaker only within the user order is not used — user order wins. */
export const openTasks = (ts: Task[]) => ts.filter((t) => !t.done);
export const nextStep = (t: Task) => t.steps.find((s) => !s.done);
/** Suggest the next action: highest priority open task (user order breaks ties), its first open step. */
export function suggestNext(ts: Task[]) {
  const open = openTasks(ts)
    .map((t, i) => ({ t, i }))
    .sort((a, b) => prioRank[a.t.priority] - prioRank[b.t.priority] || a.i - b.i);
  const task = open[0]?.t;
  return task ? { task, step: nextStep(task) } : null;
}
