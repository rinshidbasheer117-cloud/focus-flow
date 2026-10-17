import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

type Mode = "signin" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({ redirect: typeof s.redirect === "string" ? s.redirect : undefined }),
  head: () => ({
    meta: [
      { title: "Sign in · FocusBeat" },
      { name: "description", content: "Sign in to FocusBeat to sync your tasks, focus sessions and preferences across devices." },
      { property: "og:title", content: "Sign in · FocusBeat" },
      { property: "og:description", content: "Your focus space, on every device." },
    ],
  }),
  component: AuthPage,
});

const safePath = (r?: string) => {
  if (!r) return "/";
  try {
    const u = new URL(r, window.location.origin);
    return u.origin === window.location.origin && !u.pathname.startsWith("/auth") ? u.pathname + u.search : "/";
  } catch { return "/"; }
};

function AuthPage() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: safePath(redirect), replace: true }); });
  }, [navigate, redirect]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: safePath(redirect), replace: true });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (data.session) navigate({ to: "/", replace: true });
        else setNotice("Check your email to confirm your account, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setNotice("If an account exists for that email, a reset link is on its way.");
      }
    } catch (err) {
      const m = (err as Error).message;
      setError(/fetch|network/i.test(m) ? "Can't reach the server. Check your connection and try again." : m);
    } finally { setBusy(false); }
  };

  const google = async () => {
    setError(null);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) setError(r.error.message ?? "Google sign-in failed.");
    else if (!r.redirected) navigate({ to: safePath(redirect), replace: true });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-5 py-10">
      <p className="font-display text-xl font-bold"><span className="text-gradient">Focus</span>Beat</p>
      <h1 className="mt-6 text-2xl font-bold">{mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset your password"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{mode === "forgot" ? "We'll email you a secure link." : "Your tasks and sessions sync across your devices."}</p>

      <form onSubmit={submit} className="surface mt-6 space-y-3 p-5">
        <label className="block text-sm font-semibold">Email
          <input className="field mt-1" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        {mode !== "forgot" && (
          <label className="block text-sm font-semibold">Password
            <input className="field mt-1" type="password" required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        )}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {notice && <p role="status" className="text-sm text-lime">{notice}</p>}
        <button className="btn btn-primary w-full" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />}
          {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>
        {mode !== "forgot" && <button type="button" className="btn btn-ghost w-full" onClick={google}>Continue with Google</button>}
      </form>

      <div className="mt-4 flex flex-col gap-2 text-sm">
        {mode === "signin" && <>
          <button className="text-left text-primary" onClick={() => { setMode("forgot"); setError(null); setNotice(null); }}>Forgot password?</button>
          <button className="text-left text-muted-foreground" onClick={() => { setMode("signup"); setError(null); setNotice(null); }}>New here? <span className="text-primary">Create an account</span></button>
        </>}
        {mode !== "signin" && <button className="text-left text-muted-foreground" onClick={() => { setMode("signin"); setError(null); setNotice(null); }}>Have an account? <span className="text-primary">Sign in</span></button>}
      </div>
      <p className="mt-8 text-xs text-muted-foreground">FocusBeat is a productivity aid, not a medical treatment. We never ask about diagnoses.</p>
    </div>
  );
}
