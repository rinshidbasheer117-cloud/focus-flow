import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PrefsForm } from "@/components/PrefsForm";
import { defaultPrefs, prefsStore, updatePrefs, type Preferences } from "@/lib/prefs";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Get started · FocusBeat" },
      { name: "description", content: "Pick your EDM genres, energy and session length. No diagnosis needed." },
      { property: "og:title", content: "Get started with FocusBeat" },
      { property: "og:description", content: "Set your music and focus preferences in under a minute." },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const [p, setP] = useState<Preferences>(defaultPrefs);
  const [step, setStep] = useState(0);
  useEffect(() => setP(prefsStore.get()), []);
  const sections = [["music"], ["session", "comfort"]] as const;
  const finish = () => { updatePrefs({ ...p, onboarded: true }); navigate({ to: "/" }); };
  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <p className="font-display text-lg font-bold"><span className="text-gradient">Focus</span>Beat</p>
      <h1 className="mt-6 text-3xl font-bold">{step === 0 ? "What gets you moving?" : "How do you like to work?"}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Step {step + 1} of 2 · Only what's needed to tune the app. You can change this anytime. No diagnosis or health details required.</p>
      <div className="surface mt-6 p-5">
        <PrefsForm value={p} onChange={(x) => setP((s) => ({ ...s, ...x }))} sections={[...(sections[step] ?? sections[0])]} />
      </div>
      <div className="mt-6 flex justify-between gap-3">
        {step === 0 ? <button className="btn btn-ghost" onClick={finish}>Skip, use defaults</button> : <button className="btn btn-ghost" onClick={() => setStep(0)}>Back</button>}
        {step === 0 ? <button className="btn btn-primary" onClick={() => setStep(1)}>Continue</button> : <button className="btn btn-primary" onClick={finish}>Start using FocusBeat</button>}
      </div>
      <p className="mt-8 text-xs text-muted-foreground">FocusBeat is a productivity aid, not a medical treatment or a replacement for professional ADHD care.</p>
    </div>
  );
}
