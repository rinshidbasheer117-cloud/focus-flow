import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowDown, ArrowUp, Check, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/AppShell";
import {
  addStep, addTask, deleteTask, moveTask, removeStep, toggleStep, toggleTask, updateTask, useTasks, type Priority, type Task,
} from "@/lib/tasks";
import { configure, selectTask, sessionStore } from "@/lib/session";
import { prefsStore } from "@/lib/prefs";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tasks · FocusBeat" },
      { name: "description", content: "Capture tasks, set priority and deadlines, and break them into small steps." },
      { property: "og:title", content: "Tasks · FocusBeat" },
      { property: "og:description", content: "Turn overwhelming work into small, startable steps." },
    ],
  }),
  component: TasksPage,
});

function NewTask() {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [deadline, setDeadline] = useState("");
  const [first, setFirst] = useState("");
  return (
    <form className="surface grid gap-3 p-4 md:grid-cols-[1fr_auto_auto]" onSubmit={(e) => {
      e.preventDefault();
      if (addTask({ title, priority, deadline, steps: [first] })) { setTitle(""); setFirst(""); setDeadline(""); }
    }}>
      <label className="md:col-span-3 text-sm font-semibold">New task
        <input className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Complete a work report" />
      </label>
      <label className="text-sm font-semibold md:col-span-1">First small step (optional)
        <input className="field mt-1" value={first} onChange={(e) => setFirst(e.target.value)} placeholder="Open the doc and write three bullet points" />
      </label>
      <label className="text-sm font-semibold">Priority
        <select className="field mt-1" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
          <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
      </label>
      <label className="text-sm font-semibold">Deadline
        <input type="date" className="field mt-1" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      </label>
      <button className="btn btn-lime md:col-span-3 md:justify-self-start" disabled={!title.trim()}><Plus className="size-4" /> Add task</button>
    </form>
  );
}

function TaskCard({ task, index, count }: { task: Task; index: number; count: number }) {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: task.title, priority: task.priority, deadline: task.deadline ?? "" });
  const [stepText, setStepText] = useState("");
  const [popped, setPopped] = useState<string | null>(null);
  const done = task.steps.filter((s) => s.done).length;

  const focus = () => {
    selectTask(task.id);
    const s = sessionStore.get();
    if (s.status === "idle" || s.status === "finished") configure(prefsStore.get().sessionMinutes);
    navigate({ to: "/focus" });
  };

  return (
    <li className={`surface p-4 ${task.done ? "opacity-60" : ""}`}>
      {editing ? (
        <form className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={(e) => {
          e.preventDefault();
          if (!draft.title.trim()) return;
          updateTask(task.id, { title: draft.title.trim(), priority: draft.priority, deadline: draft.deadline || undefined });
          setEditing(false);
        }}>
          <input aria-label="Task title" className="field" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <select aria-label="Priority" className="field" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Priority })}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
          <input aria-label="Deadline" type="date" className="field" value={draft.deadline} onChange={(e) => setDraft({ ...draft, deadline: e.target.value })} />
          <div className="flex gap-2">
            <button className="btn btn-primary">Save</button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex items-start gap-3">
          <button className={`btn mt-0.5 size-8 shrink-0 p-0 ${task.done ? "btn-lime" : "btn-ghost"}`} onClick={() => toggleTask(task.id)}
            aria-label={task.done ? `Reopen ${task.title}` : `Complete ${task.title}`}><Check className="size-4" /></button>
          <div className="min-w-0 flex-1">
            <p className={`font-semibold ${task.done ? "line-through" : ""}`}>{task.title}</p>
            <p className="text-xs text-muted-foreground">
              <span className={task.priority === "high" ? "text-primary" : task.priority === "medium" ? "text-violet" : ""}>{task.priority}</span>
              {task.deadline && ` · due ${task.deadline}`}{task.steps.length > 0 && ` · ${done}/${task.steps.length} steps`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {!task.done && <button className="btn btn-primary size-8 p-0" onClick={focus} aria-label={`Focus on ${task.title}`}><Play className="size-3.5" /></button>}
            <button className="btn btn-ghost size-8 p-0" disabled={index === 0} onClick={() => moveTask(task.id, -1)} aria-label="Move up"><ArrowUp className="size-3.5" /></button>
            <button className="btn btn-ghost size-8 p-0" disabled={index === count - 1} onClick={() => moveTask(task.id, 1)} aria-label="Move down"><ArrowDown className="size-3.5" /></button>
            <button className="btn btn-ghost size-8 p-0" onClick={() => { setDraft({ title: task.title, priority: task.priority, deadline: task.deadline ?? "" }); setEditing(true); }} aria-label="Edit task"><Pencil className="size-3.5" /></button>
            <button className="btn btn-ghost size-8 p-0" onClick={() => confirm(`Delete “${task.title}”?`) && deleteTask(task.id)} aria-label="Delete task"><Trash2 className="size-3.5" /></button>
          </div>
        </div>
      )}
      <ul className="mt-3 space-y-1 pl-11">
        {task.steps.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm">
            <button className={`grid size-5 shrink-0 place-items-center rounded-full border ${s.done ? "border-lime bg-lime text-lime-foreground" : "border-input"} ${popped === s.id ? "anim-pop" : ""}`}
              onClick={() => { if (!s.done) setPopped(s.id); toggleStep(task.id, s.id); }} aria-label={s.done ? `Mark “${s.title}” not done` : `Complete step “${s.title}”`}>
              {s.done && <Check className="size-3" />}
            </button>
            <span className={`flex-1 ${s.done ? "text-muted-foreground line-through" : ""}`}>{s.title}</span>
            <button className="text-muted-foreground hover:text-foreground" onClick={() => removeStep(task.id, s.id)} aria-label={`Remove step “${s.title}”`}><X className="size-3.5" /></button>
          </li>
        ))}
        {!task.done && (
          <li>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addStep(task.id, stepText); setStepText(""); }}>
              <input aria-label={`Add step to ${task.title}`} className="field py-1.5 text-sm" placeholder="Add a small step…" value={stepText} onChange={(e) => setStepText(e.target.value)} />
              <button className="btn btn-ghost px-3 py-1.5" disabled={!stepText.trim()} aria-label="Add step"><Plus className="size-4" /></button>
            </form>
          </li>
        )}
      </ul>
    </li>
  );
}

function TasksPage() {
  const tasks = useTasks();
  const [showDone, setShowDone] = useState(false);
  const visible = tasks.filter((t) => showDone || !t.done);
  return (
    <div>
      <PageHeader title="Tasks" subtitle="Keep steps tiny — small enough to start in two minutes."
        action={<label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-primary" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed</label>} />
      <NewTask />
      <div className="mt-6">
        {visible.length === 0 ? (
          <EmptyState title={tasks.length ? "All done here" : "No tasks yet"} body={tasks.length ? "Everything open is complete. Nice work." : "Add your first task above. One small step is enough."} />
        ) : (
          <ul className="space-y-3">
            {visible.map((t) => <TaskCard key={t.id} task={t} index={tasks.indexOf(t)} count={tasks.length} />)}
          </ul>
        )}
      </div>
    </div>
  );
}
