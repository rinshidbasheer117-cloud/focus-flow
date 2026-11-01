import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageHeader } from "@/components/AppShell";
import { PrefsForm } from "@/components/PrefsForm";
import { updatePrefs, usePrefs } from "@/lib/prefs";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";
import { clearLocalAccountData, pendingChanges, syncNow } from "@/lib/sync/engine";
import { readBackup } from "@/lib/sync/import";
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
  const navigate = useNavigate();
  const del = useServerFn(deleteMyAccount);
  const [busy, setBusy] = useState<string | null>(null);
  const hasBackup = typeof window !== "undefined" && !!readBackup();
  const exportData = async () => {
    setBusy("export");
    try {
      await syncNow();
      const tables = ["profiles", "tasks", "task_steps", "focus_sessions", "step_events", "music_feedback", "active_sessions"] as const;
      const out: Record<string, unknown> = { exportedAt: new Date().toISOString() };
      for (const t of tables) {
        const { data, error } = await supabase.from(t).select("*");
        if (error) throw error;
        out[t] = data;
      }
      const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "focusbeat-account-export.json";
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success("Export downloaded");
    } catch (e) { toast.error("Export failed", { description: (e as Error).message }); }
    finally { setBusy(null); }
  };
  const signOut = async () => {
    const n = pendingChanges();
    if (n && !confirm(`${n} change(s) haven't reached the cloud yet and will be lost if you sign out now. Sign out anyway?`)) return;
    setBusy("signout");
    await supabase.auth.signOut();
    clearLocalAccountData();
    navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
  };
  const wipe = async () => {
    if (prompt('This permanently deletes your account, tasks, steps, session history, preferences and music feedback. Type DELETE to confirm.') !== "DELETE") return;
    setBusy("delete");
    try {
      await del();
      clearLocalAccountData();
      await supabase.auth.signOut();
      navigate({ to: "/auth", search: { redirect: undefined }, replace: true });
    } catch (e) { toast.error((e as Error).message); setBusy(null); }
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
        <h2 className="font-display font-semibold">Account & data</h2>
        <p className="text-sm text-muted-foreground">Your data is stored in your account so it syncs across devices. Only you can read or change it. No diagnosis is collected and nothing is sent to AI services.</p>
        <div className="flex flex-wrap gap-2">
          {hasBackup && <button className="btn btn-lime" onClick={() => { sessionStorage.removeItem("fb.importLater"); location.reload(); }}>Import data saved on this device</button>}
          <button className="btn btn-ghost" disabled={!!busy} onClick={exportData}>{busy === "export" ? "Preparing…" : "Export my data (JSON)"}</button>
          <button className="btn btn-ghost" disabled={!!busy} onClick={signOut}>Sign out</button>
          <button className="btn btn-ghost text-destructive" disabled={!!busy} onClick={wipe}>{busy === "delete" ? "Deleting…" : "Delete account"}</button>
        </div>
        <p className="text-xs text-muted-foreground">Deleting your account removes your login and every private record immediately. The app keeps no copy; our hosting provider's encrypted backups may hold it for a short period before they expire. This can't be undone, so export first if you want a copy.</p>
      </section>
      <p className="text-xs text-muted-foreground">FocusBeat is a productivity aid, not a medical treatment or a replacement for professional ADHD care.</p>
    </div>
  );
}
