import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Check, Coffee, Pause, Play, RotateCcw, Square } from "lucide-react";
import { Waveform } from "@/components/Waveform";
import { SourceBadge } from "@/components/TrackRow";
import { configure, fmt, pause, reset, resume, selectTask, start, useSession } from "@/lib/session";
import { nextStep, openTasks, toggleStep, toggleTask, useTasks } from "@/lib/tasks";
import { usePrefs } from "@/lib/prefs";
import { CATALOG } from "@/lib/music/catalog";
import { isPlayable, playTrack, stopPlayback, usePlayer } from "@/lib/music/provider";
import { recommend, useFeedback } from "@/lib/music/recommend";
import { rateSession, useProgress } from "@/lib/progress";

export const Route = createFileRoute("/_authenticated/focus")({
  head: () => ({
    meta: [
      { title: "Focus · FocusBeat" },
      { name: "description", content: "Focus timer with your current task, next step and EDM playback controls." },
      { property: "og:title", content: "Focus session · FocusBeat" },
      { property: "og:description", content: "One task, one step, one beat." },
    ],
  }),
  component: FocusPage,
});

function FocusPage() {
  const s = useSession();
  const tasks = useTasks();
  const prefs = usePrefs();
  const player = usePlayer();
  const fb = useFeedback();
  const progress = useProgress();
  const [popKey, setPopKey] = useState(0);
  const task = tasks.find((t) => t.id === s.taskId);
  const step = task ? nextStep(task) : undefined;
  const open = openTasks(tasks);
  const playable = recommend(CATALOG, prefs, fb).map((r) => r.track).filter(isPlayable);
  const suggestedTrack = playable[0] ?? CATALOG.find(isPlayable)!;
  const current = CATALOG.find((t) => t.id === player.trackId);
  const pct = s.durationSec ? 1 - s.remainingSec / s.durationSec : 0;
  const lastLog = progress.sessions.find((x) => x.id === s.lastLogId);

  if (!task || task.done) {
    return (
      <div className="mx-auto max-w-lg">
        <h1 className="mb-2 text-2xl font-bold">Pick one task</h1>
        <p className="mb-5 text-sm text-muted-foreground">{task?.done ? "That task is complete. Choose the next one." : "Choose what to focus on."}</p>
        {open.length === 0 ? (
          <div className="surface p-6 text-center">
            <p className="text-muted-foreground">No open tasks.</p>
            <Link to="/tasks" className="btn btn-primary mt-4">Add a task</Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {open.map((t) => (
              <li key={t.id}>
                <button className="surface w-full p-4 text-left hover:border-primary/60" onClick={() => { selectTask(t.id); if (s.status === "idle" || s.status === "finished") configure(prefs.sessionMinutes); }}>
                  <p className="font-semibold">{t.title}</p>
                  <p className="text-xs text-muted-foreground">Next: {nextStep(t)?.title ?? "no steps — just begin"}</p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="surface p-6 md:p-8" aria-live="polite">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{s.mode === "break" ? "Break" : "Focusing on"}</p>
          {s.status === "idle" && <button className="text-xs font-semibold text-primary" onClick={() => selectTask(undefined)}>Switch task</button>}
        </div>
        <h1 className="mt-2 text-2xl font-bold md:text-3xl">{task.title}</h1>
        <div className="mt-5 rounded-xl border border-lime/40 bg-lime/10 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-lime">Current step</p>
          <p className="mt-1 text-lg font-semibold">{step?.title ?? (task.steps.length ? "All steps done" : "Just start — any first move counts")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {step && (
              <button key={popKey} className={`btn btn-lime ${popKey ? "anim-pop" : ""}`} onClick={() => { toggleStep(task.id, step.id); setPopKey((k) => k + 1); }}>
                <Check className="size-4" /> Step done
              </button>
            )}
            {(!step) && <button className="btn btn-lime" onClick={() => toggleTask(task.id)}><Check className="size-4" /> Mark task complete</button>}
          </div>
        </div>
      </section>

      <section className="surface p-6 text-center">
        <p className="font-display text-6xl font-bold tabular-nums md:text-7xl" aria-label={`Time remaining ${fmt(s.remainingSec)}`}>{fmt(s.remainingSec)}</p>
        <div className="mx-auto mt-4 h-1.5 max-w-sm overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-primary" style={{ width: `${pct * 100}%` }} />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{s.status === "paused" ? `Paused · ${s.interruptions} pause${s.interruptions === 1 ? "" : "s"} — that's fine, pick up where you left off.` : s.status === "running" ? "In the zone" : s.status === "finished" ? "Block finished — the task stays open until you mark it." : `${Math.round(s.durationSec / 60)} min block`}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {s.status === "idle" && <button className="btn btn-primary" onClick={() => start()}><Play className="size-4" /> Start</button>}
          {s.status === "running" && <button className="btn btn-primary" onClick={() => pause()}><Pause className="size-4" /> Pause</button>}
          {s.status === "paused" && <button className="btn btn-primary" onClick={() => resume()}><Play className="size-4" /> Resume</button>}
          {(s.status === "running" || s.status === "paused") && <button className="btn btn-ghost" onClick={() => reset()}><RotateCcw className="size-4" /> Reset</button>}
          {s.status === "finished" && (
            <>
              <button className="btn btn-primary" onClick={() => { configure(prefs.sessionMinutes); start(); }}><RotateCcw className="size-4" /> Another block</button>
              <button className="btn btn-ghost" onClick={() => { configure(prefs.breakMinutes, "break"); start(); }}><Coffee className="size-4" /> {prefs.breakMinutes}-min break</button>
            </>
          )}
          {s.status === "idle" && s.mode === "break" && <button className="btn btn-ghost" onClick={() => configure(prefs.sessionMinutes)}>Back to focus</button>}
          {s.status === "idle" && s.mode === "focus" && <button className="btn btn-ghost" onClick={() => { configure(prefs.breakMinutes, "break"); }}><Coffee className="size-4" /> Take a break</button>}
        </div>
        {s.status === "finished" && lastLog && lastLog.helpful == null && (
          <div className="mt-5 text-sm">
            <p className="text-muted-foreground">Did this session help? (optional)</p>
            <div className="mt-2 flex justify-center gap-2">
              <button className="chip" onClick={() => rateSession(lastLog.id, true)}>Yes</button>
              <button className="chip" onClick={() => rateSession(lastLog.id, false)}>Not really</button>
            </div>
          </div>
        )}
      </section>

      <section className="surface p-5">
        <div className="flex items-center gap-3">
          <button className="btn btn-primary size-11 p-0" aria-label={player.status === "playing" ? "Stop music" : "Play music"}
            onClick={() => (player.status === "playing" ? stopPlayback() : playTrack(current && isPlayable(current) ? current : suggestedTrack))}>
            {player.status === "playing" ? <Square className="size-4" /> : <Play className="size-4" />}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold">{(current && isPlayable(current) ? current : suggestedTrack).title}</p>
            <SourceBadge track={current && isPlayable(current) ? current : suggestedTrack} />
          </div>
          <Link to="/music" className="text-sm font-semibold text-primary">Change</Link>
        </div>
        <Waveform active={player.status === "playing"} className="mt-4" />
        {player.status === "error" && <p role="alert" className="mt-2 text-xs text-destructive">{player.error}</p>}
      </section>
    </div>
  );
}
