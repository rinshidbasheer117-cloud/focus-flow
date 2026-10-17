import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Plus, Play } from "lucide-react";
import { prefsStore, usePrefs } from "@/lib/prefs";
import { addTask, nextStep, openTasks, suggestNext, useTasks, type Priority } from "@/lib/tasks";
import { configure, selectTask, useSession, fmt } from "@/lib/session";
import { EmptyState } from "@/components/AppShell";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Home · FocusBeat" },
      { name: "description", content: "Today's priorities and your suggested next action, with EDM focus sessions." },
      { property: "og:title", content: "FocusBeat — EDM-powered focus" },
      { property: "og:description", content: "Break work into small steps and start with music that fits your energy." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const tasks = useTasks();
  const prefs = usePrefs();
  const session = useSession();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  useEffect(() => {
    if (!prefsStore.get().onboarded) navigate({ to: "/onboarding" });
  }, [navigate]);

  const suggestion = suggestNext(tasks);
  const top = openTasks(tasks).slice(0, 3);
  const begin = (taskId: string) => {
    selectTask(taskId);
    if (session.status === "idle" || session.status === "finished") configure(prefs.sessionMinutes);
    navigate({ to: "/focus" });
  };

  return (
    <div className="space-y-8">
      <section>
        <p className="text-sm font-semibold text-muted-foreground">One thing at a time.</p>
        <h1 className="mt-1 text-3xl font-bold md:text-4xl">What's <span className="text-gradient">next</span>?</h1>
      </section>

      {(session.status === "running" || session.status === "paused") && (
        <Link to="/focus" className="surface flex items-center justify-between p-4 border-primary/50">
          <span className="text-sm font-semibold">Session {session.status === "paused" ? "paused — resume when ready" : "in progress"}</span>
          <span className="font-display tabular-nums text-primary">{fmt(session.remainingSec)}</span>
        </Link>
      )}

      <section aria-labelledby="next" className="surface relative overflow-hidden p-6 md:p-8">
        <p id="next" className="text-xs font-bold uppercase tracking-widest text-lime">Suggested next action</p>
        {suggestion ? (
          <>
            <p className="mt-3 font-display text-xl font-bold md:text-2xl">{suggestion.step?.title ?? `Start: ${suggestion.task.title}`}</p>
            <p className="mt-1 text-sm text-muted-foreground">from “{suggestion.task.title}” · {suggestion.task.priority} priority</p>
            {!suggestion.step && <p className="mt-2 text-xs text-muted-foreground">Tip: add small steps on the Tasks page to make starting easier.</p>}
            <button className="btn btn-primary mt-5" onClick={() => begin(suggestion.task.id)}><Play className="size-4" /> Start focus</button>
          </>
        ) : (
          <p className="mt-3 text-muted-foreground">Nothing open. Add a task below — keep it small.</p>
        )}
      </section>

      <section aria-labelledby="quick">
        <h2 id="quick" className="mb-3 text-lg font-bold">Quick add</h2>
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (addTask({ title, priority })) setTitle(""); }}>
          <label className="sr-only" htmlFor="qa">Task title</label>
          <input id="qa" className="field flex-1" placeholder="e.g. Complete the work report" value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="sr-only" htmlFor="qp">Priority</label>
          <select id="qp" className="field sm:w-36" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
          <button className="btn btn-lime" disabled={!title.trim()}><Plus className="size-4" /> Add</button>
        </form>
      </section>

      <section aria-labelledby="today">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="today" className="text-lg font-bold">Today's priorities</h2>
          <Link to="/tasks" className="text-sm font-semibold text-primary">All tasks <ArrowRight className="inline size-3.5" /></Link>
        </div>
        {top.length === 0 ? (
          <EmptyState title="No open tasks" body="Capture one thing you want to move forward today." />
        ) : (
          <ul className="space-y-2">
            {top.map((t) => {
              const done = t.steps.filter((s) => s.done).length;
              return (
                <li key={t.id} className="surface flex items-center gap-3 p-4">
                  <span className={`size-2.5 rounded-full ${t.priority === "high" ? "bg-primary" : t.priority === "medium" ? "bg-violet" : "bg-muted-foreground"}`} aria-label={`${t.priority} priority`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{t.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.steps.length ? `${done}/${t.steps.length} steps · next: ${nextStep(t)?.title ?? "all steps done"}` : "No steps yet"}
                    </p>
                  </div>
                  <button className="btn btn-ghost" onClick={() => begin(t.id)} aria-label={`Focus on ${t.title}`}><Play className="size-4" /></button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
