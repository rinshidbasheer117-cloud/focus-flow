import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/AppShell";
import { useProgress } from "@/lib/progress";
import { useTasks } from "@/lib/tasks";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress · FocusBeat" },
      { name: "description", content: "Your real recorded focus time, completed steps and sessions — no guilt streaks." },
      { property: "og:title", content: "Progress · FocusBeat" },
      { property: "og:description", content: "Honest progress based on what you actually did." },
    ],
  }),
  component: ProgressPage,
});

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="surface p-4">
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ProgressPage() {
  const { sessions, steps } = useProgress();
  const tasks = useTasks();
  const doneTasks = tasks.filter((t) => t.done).length;
  const focusMin = Math.round(sessions.reduce((a, s) => a + s.focusedSec, 0) / 60);
  const interruptions = sessions.reduce((a, s) => a + s.interruptions, 0);
  const rated = sessions.filter((s) => s.helpful != null);
  const helpful = rated.filter((s) => s.helpful).length;

  const days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i));
    const end = d.getTime() + 864e5;
    const min = sessions.filter((s) => s.endedAt >= d.getTime() && s.endedAt < end).reduce((a, s) => a + s.focusedSec, 0) / 60;
    return { label: d.toLocaleDateString(undefined, { weekday: "short" }), min: Math.round(min) };
  });
  const max = Math.max(1, ...days.map((d) => d.min));

  if (!sessions.length && !steps.length && !doneTasks) {
    return (
      <div>
        <PageHeader title="Progress" />
        <EmptyState title="Nothing recorded yet" body="Complete a step or run a focus block and it'll show up here. Only real activity is counted." />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PageHeader title="Progress" subtitle="Recorded on this device. Every bit counts — there are no streaks to break." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Steps completed" value={steps.length} />
        <Stat label="Tasks completed" value={doneTasks} />
        <Stat label="Focus minutes" value={focusMin} />
        <Stat label="Sessions" value={sessions.length} />
        <Stat label="Pauses / interruptions" value={interruptions} />
        <Stat label="Felt helpful" value={rated.length ? `${helpful}/${rated.length}` : "—"} />
      </div>
      <section className="surface p-5">
        <h2 className="mb-4 font-bold">Focus minutes · last 7 days</h2>
        <div className="flex h-40 items-end gap-2">
          {days.map((d) => (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-muted-foreground">{d.min || ""}</span>
              <div className="w-full rounded-t-md bg-primary" style={{ height: `${(d.min / max) * 100}%`, minHeight: d.min ? 4 : 1 }} />
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
      </section>
      {sessions.length > 0 && (
        <section>
          <h2 className="mb-3 font-bold">Recent sessions</h2>
          <ul className="space-y-2">
            {[...sessions].reverse().slice(0, 8).map((s) => (
              <li key={s.id} className="surface flex justify-between p-3 text-sm">
                <span>{tasks.find((t) => t.id === s.taskId)?.title ?? "Deleted task"}</span>
                <span className="text-muted-foreground">{Math.round(s.focusedSec / 60)} min · {s.interruptions} pauses{s.completedTimer ? "" : " · ended early"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
