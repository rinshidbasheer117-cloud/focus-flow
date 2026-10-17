import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { PrefsForm } from "@/components/PrefsForm";
import { updatePrefs, usePrefs } from "@/lib/prefs";
import { localAuth } from "@/lib/auth";
import { configure, useSession } from "@/lib/session";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings · FocusBeat" },
      { name: "description", content: "Music preferences, session defaults, reduced motion, reminders and your data." },
      { property: "og:title", content: "Settings · FocusBeat" },
      { property: "og:description", content: "Tune FocusBeat to how you work." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const prefs = usePrefs();
  const session = useSession();
  const exportData = async () => {
    const blob = new Blob([JSON.stringify(await localAuth.exportData(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "focusbeat-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const wipe = async () => {
    if (!confirm("Delete all FocusBeat data on this device? This can't be undone.")) return;
    await localAuth.deleteAllData();
    window.location.href = "/onboarding";
  };
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Changes save instantly." />
      <div className="surface p-5">
        <PrefsForm value={prefs} onChange={(p) => {
          updatePrefs(p);
          if (p.sessionMinutes && session.status === "idle" && session.mode === "focus") configure(p.sessionMinutes);
        }} />
      </div>
      <section className="surface space-y-3 p-5">
        <h2 className="font-display font-semibold">Your data</h2>
        <p className="text-sm text-muted-foreground">Everything is stored only in this browser. No account, no diagnosis, nothing sent to AI services.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-ghost" onClick={() => { exportData(); toast.success("Export downloaded"); }}>Export data (JSON)</button>
          <button className="btn btn-ghost text-destructive" onClick={wipe}>Delete all data</button>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">FocusBeat is a productivity aid, not a medical treatment or a replacement for professional ADHD care.</p>
    </div>
  );
}
