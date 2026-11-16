# PHASE 16.4.6.2A.3 — Identity Resolver Report

**Phase:** 16.4.6.2A.3 — Deterministic verified MyGeotab identity resolver & LIVE write gating  
**Application:** OPEX Vehicle Booking Management (web)  
**Target database:** `opex_trial` (PRODUCTION context; **no production writes performed**)  
**Date:** 2026-11-16 (UTC)  
**Status:** **PARTIAL** (local implementation, refactor, and regression validation complete; authenticated MyGeotab runtime/tenant verification blocked)

## 1. Scope and safety

- Separated **authenticated MyGeotab principal** from **DEMO actor**; LIVE (`ADDIN_DATA`) identity is resolved deterministically and never inferred from demo/local selection.
- LIVE booking/approval-affecting UI actions are gated when identity is not verified.
- **No commits/pushes/PRs/deploys.** No MyGeotab tenant writes (`Add`/`Set`/`Remove`), no live bookings/notifications, no AddInId/tenant config/permissions changes, no AddInData migration/deletion.
- Existing uncommitted baseline preserved (including prior modified/untracked files).
- Mocked/local tests are **not** live evidence.

## 2. Implementation summary

### 2.1 Resolver (`apps/web/src/auth/identityResolver.ts`)
- `resolveAuthenticatedPrincipal(api)`:
  - Requires `api.call` and a session via `api.getSession` with a trimmed `session.userName`.
  - Performs targeted lookup: `Get` `User` with `search: { name: session.userName }`, `resultsLimit: 10`.
  - **Authenticated** only when exactly one candidate is returned and canonical `id` is a non-empty string.
  - **Unresolved** for: missing API, unavailable/missing session userName, 0 matches, >1 matches (ambiguous), or missing canonical id on matched record.
  - **Error** when lookup/session resolution path throws/fails.
  - No demo/local fallback; no credential/token exposure/logging; session context retained on principal.
- Identity states: `loading | authenticated | unresolved | error` (`IdentityResolutionState`).
- Helpers:
  - `isLiveIdentityVerified(state)` — true only for `authenticated`.
  - `canPerformLiveWrite(mode, state)` — `true` outside `ADDIN_DATA`; in `ADDIN_DATA` only when verified.
  - `getLiveBlockedReason(mode, state)` — explicit user-facing reason for LIVE blocked/loading/unverified/error states.
  - `getActorIdForMode(mode, identity, demoActorId)` — `ADDIN_DATA` => verified principal id only (or `null`); `DEMO` => explicit demo actor id only. Prevents cross-mode actor leakage.

### 2.2 UI/state integration (`apps/web/src/ui/App.tsx`)
- Distinct state: `demoActor` (DEMO only, explicit selection) vs `identityState`/`verifiedPrincipal` (LIVE verified identity). Derived `actor`, `actorId`, `isLiveMode`, `liveBlockedReason`.
- Lifecycle/session-driven resolution with sequence guard; on entering/loading LIVE, state set to `loading` then resolved. `demoActor` cleared when switching to `ADDIN_DATA` to prevent leakage.
- Data loading/notifications use mode-aware actor id (`getActorIdForMode`) and do not treat unverified LIVE as actionable.
- UI labels: LIVE shows verified principal (name/id/database context) or explicit resolving/unverified reason; DEMO clearly labeled as demo identity (not authenticated MyGeotab). No demo identity presented as authenticated LIVE identity.
- Components refactored to `ActorContext`/mode-aware props: `NewBooking`, `MyBookings`, `NotificationCenter`, topbar identity/badge/selectors, notification dropdown handlers.

## 3. Actor / field mapping (current)

| Context | Field | LIVE (`ADDIN_DATA`, verified) | DEMO | Notes |
|---|---|---|---|---|
| Booking create | `requesterUserId` (`provider.createBooking`) | `getActorIdForMode` => verified principal id | explicit `demoActor.id` | Blocked in LIVE if unverified/no actor. |
| Approve | `approverId` (`provider.updateBookingStatus`) | `getActorIdForMode` => verified principal id | explicit `demoActor.id` | Blocked in LIVE if unverified. |
| Reject (confirm) | `approverId` + `approvalRemarks` (reason) | `getActorIdForMode` => verified principal id | explicit `demoActor.id` | Blocked in LIVE if unverified. |
| Assign / Complete / Cancel | status transition actor passed to provider | `updateBookingStatus(id, status[, approverId])` with mode-aware gating; assign uses verified/demo actor context for notifications | explicit demo actor context for notifications | All gated by `canPerformLiveWrite` in LIVE. |
| Notifications (engine callbacks) | actor/user context | verified principal-derived actor/id only when authenticated | demo actor/id | Notification read/mark actions require resolved `actorId`. |
| Audit persistence | `actor_user_id` (`createAuditRecord`) | **Not wired in UI flow** | **Not wired in UI flow** | Provider/type APIs exist (`addinDataProvider`, `dataProvider`, `types`) but UI does not invoke `createAuditRecord`. **End-to-end audit persistence/attribution is pending (not complete).** |

**Important:** This phase makes the correct resolved actor identity available to booking/approval operations and documents intended mapping; it does **not** claim audit records are emitted/persisted by the UI.

## 4. LIVE write gating and bypass review

`getActorIdForMode`, `canPerformLiveWrite`, `getLiveBlockedReason` are used in `App.tsx` to gate/derive actors. `isLiveIdentityVerified` is exported by the resolver (available for callers/tests) but not directly referenced in `App.tsx`; LIVE gating is enforced via `canPerformLiveWrite`/state checks.

| Action / path | LIVE gating | Actor source | Result |
|---|---|---|---|
| `onCreateBooking` | `currentActorId` required + `canPerformLiveWrite`; `NewBooking` UI `canWrite`/disabled/blocked reason | `getActorIdForMode` (verified only in LIVE) | **Blocked when unverified**; no demo fallback. |
| `onApprove` | `canPerformLiveWrite` before status update | verified principal/demo via `getActorIdForMode` | **Blocked when unverified**. |
| `onConfirmReject` | `canPerformLiveWrite` before status update | `getActorIdForMode` | **Blocked when unverified**. |
| `onAssign` | `canPerformLiveWrite` before status update | verified principal/demo context + `getActorIdForMode` for notifications | **Blocked when unverified**. |
| `onComplete` | `canPerformLiveWrite` before status update | status-only provider call (existing contract) | **Blocked in LIVE when unverified**. |
| `onCancel` | `canPerformLiveWrite` before status update | status-only provider call (existing contract) | **Blocked in LIVE when unverified**. |
| Notification dropdown/page mark read / mark all / open | handlers require `notificationEngine && actorId` (LIVE `actorId` is null when unverified) | `actorId` | **No unverified LIVE actor actions**; operations scoped to resolved actor. |
| `onResetDemoData` | calls provider `resetDemoData` (no `canPerformLiveWrite` gate in UI) | n/a | **Potential risk if invoked against LIVE-capable provider/mode**; not part of audited booking/approval actor mapping. Not exercised/validated against tenant; no production writes performed. |

**Conclusion:** No uncovered bypass identified for booking create/update, approval, rejection, assignment, completion, cancellation, or notification UI actions reviewed. Unverified LIVE cannot obtain a write-capable actor id through `getActorIdForMode`. Residual risk noted for `resetDemoData` (out of the specific actor-mapping paths above).

## 5. DEMO behavior / LIVE switching

- DEMO mode remains selectable and functional for demo workflows using explicit `demoActor` selection; demo identity labeled as non-authenticated.
- Switching to `ADDIN_DATA` clears `demoActor` and resolves authenticated principal; LIVE requires verified identity for gated writes.
- `getActorIdForMode` enforces separation (DEMO id never returned in LIVE; LIVE principal never returned in DEMO path).

## 6. Validation executed (local)

| Check | Result |
|---|---|
| `npx tsc -p apps/web/tsconfig.json --noEmit` | PASS |
| `npm --workspace apps/web run build` (tsc -b + vite + service build) | PASS |
| `node --experimental-strip-types --test apps\web\test\identityResolver.test.mjs` | PASS (12/12) |
| `node --experimental-strip-types --test apps\web\test\addinData.serialization.test.mjs` | PASS (10/10) |
| `node --experimental-strip-types --test apps\web\test\service-addin.test.mjs` | PASS (28/28) |
| `node --test apps\web\src\config\lifecycleDiagnostics.test.mjs` | PASS (14/14) |
| `node --experimental-strip-types --test apps\web\src\config\lifecycleBridge.test.mjs` | PASS (17/17) |
| `npm --workspace apps/api run typecheck` / `npm --workspace apps/api run test` | Not re-run in this finalization pass (API unchanged by this refactor); prior baseline reported 65/65. |

All discovered web test/spec files in `apps/web/test` and `apps/web/src/config` affected by/refreshed for this refactor were executed and passed.

## 7. Remaining risks / limitations

- **Runtime identity unverified:** No authenticated MyGeotab session/browser access to `https://my.geotab.com` (`opex_trial`, PRODUCTION). Cannot confirm actual `getSession` payload, real `Get User` matching behavior, canonical principal for target users (e.g. previously reported identifiers), or tenant-side behavior.
- **No live AddInData verification:** Cannot verify real Add/Get/Set, booking/notification lifecycles, `details` representation in tenant, or AddInId association.
- **Audit persistence pending:** `createAuditRecord` not invoked by UI; `actor_user_id`/audit trail not end-to-end.
- **`resetDemoData`:** not covered by LIVE write guard in UI; assess before enabling in LIVE contexts.
- **Automated UI/E2E coverage:** no browser-level E2E executed here; validation is type/build/unit-level plus code-path inspection.

## 8. Final status

**PARTIAL**

- **Achieved:** deterministic resolver, identity states/gating/helpers, App.tsx actor separation and LIVE-blocking for booking/approval/notification UI actions reviewed, DEMO separation preserved, local typecheck/build and relevant web regression suites passing, mapping documented.
- **Blocked/not claimed:** production/authenticated MyGeotab identity verification, live tenant/AddInData behavior, and end-to-end audit persistence (`createAuditRecord` not wired).
