import { createFileRoute } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { PLANS, currentTier } from "@/lib/entitlements";

export const Route = createFileRoute("/_authenticated/plus")({
  head: () => ({
    meta: [
      { title: "Plans · FocusBeat" },
      { name: "description", content: "FocusBeat Free and the planned FocusBeat Plus subscription at AED 3/month." },
      { property: "og:title", content: "FocusBeat Plans" },
      { property: "og:description", content: "Free forever, with FocusBeat Plus planned at AED 3/month." },
    ],
  }),
  component: PlusPage,
});

function PlusPage() {
  return (
    <div>
      <PageHeader title="Plan & subscription" subtitle={`Current plan: ${PLANS[currentTier].name}`} />
      <div className="surface mb-6 border-violet/40 p-4 text-sm">
        <strong>Planned subscription.</strong> <span className="text-muted-foreground">Billing isn't connected yet, so FocusBeat Plus can't be purchased or activated. When it launches, access will be verified on our servers through a payment provider, and you'll be able to cancel anytime from here.</span>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {(["free", "plus"] as const).map((k) => {
          const plan = PLANS[k];
          const active = currentTier === k;
          return (
            <section key={k} className={`surface p-6 ${k === "plus" ? "border-primary/50" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold">{plan.name}</h2>
                {active ? <span className="rounded-full bg-lime/15 px-2 py-0.5 text-xs font-bold text-lime">Your plan</span>
                  : <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-muted-foreground">Coming soon</span>}
              </div>
              <p className="mt-3 font-display text-3xl font-bold">{plan.priceLabel}</p>
              <ul className="mt-4 space-y-2 text-sm">
                {plan.features.map((f) => <li key={f} className="flex gap-2"><Check className="size-4 shrink-0 text-lime" aria-hidden />{f}</li>)}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
