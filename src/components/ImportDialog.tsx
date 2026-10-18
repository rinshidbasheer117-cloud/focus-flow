import { useState } from "react";
import { toast } from "sonner";
import { analyze, discardBackup, downloadBackup, importBackup, type GuestBackup, type DuplicateChoice, type PrefsChoice } from "@/lib/sync/import";

export function ImportDialog({ backup, onClose }: { backup: GuestBackup; onClose: () => void }) {
  const a = analyze(backup);
  const [prefs, setPrefs] = useState<PrefsChoice>("account");
  const [dups, setDups] = useState<DuplicateChoice>("keep-both");
  const [busy, setBusy] = useState(false);
  const n = backup.tasks.length, s = backup.progress.sessions.length;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="imp-title" className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur">
      <div className="surface max-h-[90vh] w-full max-w-md overflow-auto p-6">
        <h2 id="imp-title" className="text-xl font-bold">Bring your device data into your account?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This browser has {n} task{n === 1 ? "" : "s"} and {s} focus session{s === 1 ? "" : "s"} saved before you signed in.
          {a.cloudTaskCount > 0 ? ` Your account already has ${a.cloudTaskCount} task${a.cloudTaskCount === 1 ? "" : "s"}.` : ""} Nothing in your account will be overwritten.
        </p>

        {a.sameTitle.length > 0 && (
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">{a.sameTitle.length} task{a.sameTitle.length === 1 ? " has" : "s have"} the same name as one in your account</legend>
            <label className="mt-2 flex gap-2 text-sm"><input type="radio" className="accent-primary" checked={dups === "keep-both"} onChange={() => setDups("keep-both")} /> Keep both copies</label>
            <label className="mt-1 flex gap-2 text-sm"><input type="radio" className="accent-primary" checked={dups === "skip"} onChange={() => setDups("skip")} /> Skip the device copies</label>
          </fieldset>
        )}
        {a.sameId.length > 0 && <p className="mt-3 text-xs text-muted-foreground">{a.sameId.length} task(s) already exist in your account; the more recently edited version will be kept.</p>}
        {a.prefsDiffer && (
          <fieldset className="mt-4">
            <legend className="text-sm font-semibold">Your preferences differ</legend>
            <label className="mt-2 flex gap-2 text-sm"><input type="radio" className="accent-primary" checked={prefs === "account"} onChange={() => setPrefs("account")} /> Keep my account preferences</label>
            <label className="mt-1 flex gap-2 text-sm"><input type="radio" className="accent-primary" checked={prefs === "device"} onChange={() => setPrefs("device")} /> Use this device's preferences</label>
          </fieldset>
        )}

        <div className="mt-6 flex flex-col gap-2">
          <button className="btn btn-primary" disabled={busy} onClick={async () => {
            setBusy(true);
            await importBackup(backup, { prefs, duplicates: dups });
            toast.success("Device data imported into your account");
            onClose();
          }}>Import into my account</button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => {
            if (!confirm("Discard this device's pre-account data? A copy will download first.")) return;
            downloadBackup(backup); discardBackup(); onClose();
          }}>Don't import (download a copy, then discard)</button>
          <button className="btn btn-ghost" disabled={busy} onClick={onClose}>Decide later</button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">You can import later from Settings.</p>
      </div>
    </div>
  );
}
