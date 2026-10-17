import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password · FocusBeat" },
      { name: "description", content: "Choose a new password for your FocusBeat account." },
      { property: "og:title", content: "Reset password · FocusBeat" },
      { property: "og:description", content: "Choose a new password for your FocusBeat account." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") setReady(true); });
    supabase.auth.getSession().then(({ data: s }) => { if (s.session && isRecovery) setReady(true); else if (!isRecovery) setError("This reset link is invalid or has expired. Request a new one."); });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
    setTimeout(() => navigate({ to: "/", replace: true }), 1200);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5">
      <h1 className="text-2xl font-bold">Set a new password</h1>
      <form onSubmit={submit} className="surface mt-6 space-y-3 p-5">
        <label className="block text-sm font-semibold">New password
          <input className="field mt-1" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={!ready || done} />
        </label>
        {error && <p role="alert" className="text-sm text-destructive">{error} <a href="/auth" className="text-primary">Back to sign in</a></p>}
        {done && <p role="status" className="text-sm text-lime">Password updated. Taking you in…</p>}
        <button className="btn btn-primary w-full" disabled={!ready || busy || done}>{busy && <Loader2 className="size-4 animate-spin" />} Update password</button>
      </form>
    </div>
  );
}
