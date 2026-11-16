# PHASE 16.4.6.2A.4 — Safety Hardening Report

**Phase:** 16.4.6.2A.4 — LIVE/DEMO boundary hardening (post 16.4.6.2A.3)  
**Application:** OPEX Vehicle Booking Management (web)  
**Target database:** `opex_trial` (PRODUCTION context; **no production writes performed**)  
**Date:** 2026-11-16 (UTC)  
**Final status:** **PASS** (requested hardening, boundary enforcement, and regression coverage implemented/validated locally; no authenticated MyGeotab runtime/tenant execution performed)

## 1. Objective and safety

Hardened LIVE/DEMO boundaries to eliminate the identified residual risk: `onResetDemoData` was previously not guarded by LIVE identity/mode checks.

Safety rules enforced:
- `opex_trial` treated as PRODUCTION; no demo reset/seed/clear executed against LIVE.
- Demo-only operations require explicit `DEMO` mode (fail closed for ambiguous modes).
- Demo-only operations cannot execute against a live/AddInData provider (`provider.isLive()` guard).
- LIVE operations continue to require verified authenticated principal (`canPerformLiveWrite` / `getActorIdForMode` from 16.4.6.2A.3; not weakened).
- Mode switching clears stale actor, notifications, pending callbacks/selections, and transient UI state.
- Existing uncommitted baseline preserved. **No commits/pushes/PRs/deploys. No AddInData Add/Set/Remove. No booking creation. No production tenant writes.**

## 2. Source changes (exact files)

| File | Change |
|---|---|
| `apps/web/src/ui/App.tsx` | Hardened `onResetDemoData` to require explicit DEMO mode (`assertDemoOnlyOperation`) and non-live provider (`assertProviderNotLiveForDemoOperation`); clears bookings/notification/pending state after reset. Added fail-closed mode handling (`isKnownMode`) in mode setter and data-loading `effectiveMode`. Wrapped `setMode` to reject unknown modes and clear stale `demoActor`, notifications, unread count, dropdown, selected booking, reject state, and message on mode switch. Added defense-in-depth effect to clear stale notification/pending/selection state on mode changes and enforce demo-actor separation in LIVE. Provider selection remains explicit (`ADDIN_DATA` => AddInData provider; `DEMO` => local provider; ambiguous => local provider with guarded operations). DEMO fallback in load path restricted to explicit DEMO and non-live local provider. |
| `apps/web/src/safety/modeGuards.ts` | **New.** Boundary helpers: `canRunDemoOnlyOperation`, `assertDemoOnlyOperation`, `assertProviderNotLiveForDemoOperation`, `getStateResetOnModeSwitch`, `isKnownMode`, `normalizeModeStrict`, `canPerformLiveWriteStrict` (fail-closed semantics). |
| `apps/web/test/safetyGuards.test.mjs` | **New.** Regression tests for demo-only allowance, LIVE/ambiguous blocking, live-provider leakage prevention, mode-switch state reset shape, no stale actor/notification actor across modes, unresolved LIVE write blocking, and fail-closed mode normalization. |
| `docs/PHASE_16.4.6.2A.4_SAFETY_HARDENING_REPORT.md` | This report. |

## 3. Inspection findings (destructive/state-changing & demo operations)

- **`onResetDemoData` (`apps/web/src/ui/App.tsx`):** previously callable without mode/provider boundary checks (residual risk). Now guarded (DEMO-only + non-live provider) and clears stale state. No UI button currently invokes it in the inspected render tree; handler remains hardened to fail closed if invoked.
- **Demo reset implementation:** `apps/web/src/data/dataProvider.ts` (`LocalBookingDataProvider.resetDemoData`) resets local demo bookings/notifications/audit/storage; `isLive() === false`. `apps/web/src/data/addinDataProvider.ts` `resetDemoData` is a no-op with DEMO-only intent comment; `isLive() === true` — guarded from demo-only path by `assertProviderNotLiveForDemoOperation`.
- **Seed/clear/initialize:** no separate demo seed/clear/tenant initialization actions found beyond local demo provider initialization/reset behavior; provider selection and mode guards prevent demo operations from targeting live/AddInData providers.
- **Provider selection:** explicit and mode-aware in `provider` memo; no DEMO fallback to AddInData in LIVE; DEMO load fallback only to non-live local provider.
- **Mode switching:** clears `demoActor` and stale notifications/unread/dropdown/selection/reject/pending message state; notification refresh effects depend on resolved `actorId` (null for unverified LIVE), preventing stale demo identity reuse.

## 4. Tests added/updated

Added `apps/web/test/safetyGuards.test.mjs` covering:
- Demo reset/seed allowed only in DEMO; blocked in LIVE and ambiguous modes (fail closed).
- Provider leakage: demo-only operations cannot use live provider; null provider rejected.
- Mode-switch stale-state reset contract (`getStateResetOnModeSwitch`).
- No stale actor after mode switching (`getActorIdForMode` DEMO vs LIVE/authenticated/unverified).
- No stale notification actor after switching to LIVE with unresolved identity (`actorId` null).
- LIVE writes blocked with unresolved/loading/error/null identity; DEMO path remains functional per resolver contract.
- Mode normalization fail-closed for ambiguous values.

Existing identity resolver and web regression suites re-run (all passing).

## 5. Test commands and results

| Command | Result |
|---|---|
| `npx tsc -p apps/web/tsconfig.json --noEmit` | PASS |
| `npm --workspace apps/web run build` (tsc -b + vite + service build) | PASS |
| `node --experimental-strip-types --test apps\web\test\safetyGuards.test.mjs` | PASS (8/8) |
| `node --experimental-strip-types --test apps\web\test\identityResolver.test.mjs` | PASS (12/12) |
| `node --experimental-strip-types --test apps\web\test\addinData.serialization.test.mjs` | PASS (10/10) |
| `node --experimental-strip-types --test apps\web\test\service-addin.test.mjs` | PASS (28/28) |
| `node --test apps\web\src\config\lifecycleDiagnostics.test.mjs` | PASS (14/14) |
| `node --experimental-strip-types --test apps\web\src\config\lifecycleBridge.test.mjs` | PASS (17/17) |

**Totals (executed):** 89/89 tests passed across all discovered/affected web suites for this phase.

## 6. Remaining risks / notes

- **No authenticated MyGeotab runtime validation:** cannot verify live mode-switch/session behavior, real AddInData isolation, or tenant-side effects in `https://my.geotab.com` (`opex_trial`). No production writes performed.
- **`onResetDemoData` exposure:** handler is hardened/fail-closed but not currently wired to a UI control; any future wiring must keep DEMO-only visibility/guards.
- **Audit persistence:** `createAuditRecord` remains not wired in UI flow (pre-existing; out of scope). End-to-end audit not claimed.
- **UI automation:** no browser/E2E executed; validation is type/build/unit + code inspection.
- Uncommitted baseline preserved; no deployment/commit/push.

## 7. Conclusion

Requested LIVE/DEMO boundary hardening implemented with fail-closed guards for demo-only operations, live-provider leakage prevention, stale actor/notification/pending-state clearing on mode transitions, and regression coverage. Existing identity/write-gating behavior not weakened.
