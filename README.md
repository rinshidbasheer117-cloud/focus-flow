# FocusBeat — Phase 1

EDM-powered focus & task app (productivity aid, not a medical treatment).

## Run
```
bun install
bun run dev   # http://localhost:8080
```
Stack: TanStack Start (React 19, TypeScript), Vite, Tailwind v4. Hosted on Lovable (not Replit).

## Structure
- `src/lib/store.ts` – tiny localStorage store (persistence layer, swap for remote later)
- `src/lib/tasks.ts` – tasks, steps, reorder, next-action suggestion
- `src/lib/session.ts` – focus timer state machine (timer end never completes tasks)
- `src/lib/progress.ts` – real activity log (sessions, steps, helpfulness)
- `src/lib/prefs.ts` – user preferences
- `src/lib/music/` – catalog, provider adapter, WebAudio demo generator, rules-based recommender
- `src/lib/entitlements.ts` – Free/Plus tiers (always Free until server-verified billing)
- `src/lib/auth.ts` – auth/data adapter interface (local device user, export/delete)
- `src/components/`, `src/routes/` – UI and screens

## Completed (verified in browser)
Onboarding, home + suggested next action, task create/edit/reorder/complete/steps, refresh persistence,
timer start/pause/resume/reset, timer end leaves task open, sample vs playable tracks with error state,
settings (session length, reminders chime, reduced motion), progress from real data, plans page, data export/delete.

## Known limitations
- Playable music = in-browser generated loops; "sample" tracks are metadata only.
- Data lives in one browser; no accounts or sync.
- No billing; Plus is labelled "planned".
- Reorder uses up/down buttons (no drag).

## Phase 2 needs
Lovable Cloud (auth, database with per-user policies), payment provider with server-side entitlement webhooks,
licensed music catalog/API after legal review, optional AI provider with consent flow, native app wrappers.
