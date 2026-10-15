import { Link, useLocation } from "@tanstack/react-router";
import { Home, ListChecks, Music2, Timer, BarChart3, Settings, Sparkles } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";
import { usePrefs, prefsStore } from "@/lib/prefs";
import { tick, useSession, fmt } from "@/lib/session";
import { chime } from "@/lib/music/synth";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/tasks", label: "Tasks", icon: ListChecks },
  { to: "/focus", label: "Focus", icon: Timer },
  { to: "/music", label: "Music", icon: Music2 },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

/** Global ticker so the timer keeps running across pages. */
function SessionTicker() {
  const s = useSession();
  useEffect(() => {
    if (s.status !== "running") return;
    const id = setInterval(() => {
      if (tick()) {
        const p = prefsStore.get();
        if (p.reminders) {
          chime();
          toast(s.mode === "focus" ? "Focus block finished" : "Break's over", {
            description: s.mode === "focus" ? "Mark your step done if you finished it — or keep going." : "Ready for the next step when you are.",
          });
        }
      }
    }, 250);
    return () => clearInterval(id);
  }, [s.status, s.mode]);
  useEffect(() => {
    document.title = s.status === "running" ? `${fmt(s.remainingSec)} · FocusBeat` : document.title.replace(/^\d\d:\d\d · /, "");
  }, [s.status, s.remainingSec]);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const prefs = usePrefs();
  const loc = useLocation();
  const session = useSession();
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", prefs.reducedMotion);
  }, [prefs.reducedMotion]);

  if (loc.pathname === "/onboarding") return <><SessionTicker />{children}</>;

  return (
    <div className="min-h-screen md:flex">
      <SessionTicker />
      <aside className="hidden md:flex md:w-60 md:flex-col md:gap-1 md:border-r md:p-5 sticky top-0 h-screen">
        <Link to="/" className="mb-6 font-display text-lg font-bold"><span className="text-gradient">Focus</span>Beat</Link>
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-secondary data-[status=active]:bg-secondary data-[status=active]:text-foreground">
            <n.icon className="size-4" aria-hidden /> {n.label}
            {n.to === "/focus" && session.status === "running" && <span className="ml-auto text-xs text-primary tabular-nums">{fmt(session.remainingSec)}</span>}
          </Link>
        ))}
        <Link to="/plus" className="mt-auto flex items-center gap-2 rounded-lg border border-violet/40 px-3 py-2 text-sm font-semibold data-[status=active]:bg-accent">
          <Sparkles className="size-4 text-violet" aria-hidden /> Plan & subscription
        </Link>
      </aside>
      <main className="flex-1 px-4 pb-28 pt-5 md:px-10 md:pb-10 md:pt-8 max-w-5xl">
        <div className="mb-4 flex items-center justify-between md:hidden">
          <Link to="/" className="font-display text-lg font-bold"><span className="text-gradient">Focus</span>Beat</Link>
          <Link to="/plus" className="chip" aria-label="Plan and subscription"><Sparkles className="size-3.5 text-violet" aria-hidden /> Plan</Link>
        </div>
        {children}
      </main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-background/95 backdrop-blur md:hidden">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} activeOptions={{ exact: n.to === "/" }}
            className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-muted-foreground data-[status=active]:text-primary">
            <n.icon className="size-5" aria-hidden />{n.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="surface flex flex-col items-center gap-3 p-8 text-center">
      <p className="font-display font-semibold">{title}</p>
      <p className="max-w-sm text-sm text-muted-foreground">{body}</p>
      {action}
    </div>
  );
}
