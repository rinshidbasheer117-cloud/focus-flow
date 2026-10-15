/**
 * Subscription entitlements (Phase 1: read-only, always "free").
 * In Phase 2 the tier MUST come from a server-verified record written by a
 * payment-provider webhook — never from a client-side toggle.
 */
export type Tier = "free" | "plus";
export type Feature = "unlimited_tasks" | "full_catalog" | "advanced_stats" | "ai_breakdown" | "cloud_sync";

export const PLANS = {
  free: { name: "Free", priceLabel: "AED 0", features: ["Tasks & steps", "Focus timer", "Generated demo loops", "Progress on this device"] },
  plus: { name: "FocusBeat Plus", priceLabel: "AED 3 / month", features: ["Licensed music catalog (planned)", "Sync across devices", "Optional AI task breakdown", "Extended progress history"] },
} as const;

const PLUS_ONLY: Feature[] = ["full_catalog", "advanced_stats", "ai_breakdown", "cloud_sync"];

export interface EntitlementSource { getTier(): Promise<Tier>; }
/** Phase 1 source: no billing exists, so everyone is on Free. */
export const localEntitlements: EntitlementSource = { getTier: async () => "free" };
export const currentTier: Tier = "free";
export const hasFeature = (tier: Tier, f: Feature) => tier === "plus" || !PLUS_ONLY.includes(f);
