# PHASE 16.4.6.2A.6 — Regression Report

**Phase:** 16.4.6.2A.6 — End-to-end regression & audit reliability validation  
**Application:** OPEX Vehicle Booking Management (web)  
**Scope:** Combined validation of 16.4.6.2A.3 (Identity Resolver), 16.4.6.2A.4 (LIVE/DEMO Safety Hardening), 16.4.6.2A.5 (Audit Trail Integration)  
**Target database:** `opex_trial` (PRODUCTION context; **no production writes/tests performed**)  
**Date:** 2026-11-16 (UTC)  
**Final status:** **PARTIAL**

## 1. Objective and constraints

- Validated combined behavior using **isolated mock/local providers only** (`LocalBookingDataProvider` in-memory/localStorage-backed test environment). No unrelated features added.
- **No production booking creation, no production AddInData Add/Set/Remove, no deployment, no commits/pushes.** Existing uncommitted baseline preserved.
- Browser E2E: **not available** (no Playwright/Cypress/e2e config detected in repo; `@playwright/test` not installed).

## 2. End-to-end workflow validation (isolated mock/local providers)

Executed in `apps/web/test/workflowRegression.test.mjs` (and covered by `apps/web/test/auditTrail.test.mjs` emitter tests):

| Workflow | Booking state transition | Actor attribution (mode-aware) | Audit count (logical) | Previous/new status | Entity ID | Timestamp | Audit details | Cross-mode leakage |
|---|---|---|---|---|---|---|---|---|
| Create booking | `PENDING_APPROVAL` created; `requester_id` correct | DEMO explicit actor verified (`BOOKING_CREATED`); LIVE path uses `getActorIdForMode` verified principal by design/guards | 1 | `null -> PENDING_APPROVAL` | `booking_id` == entity id in details | `created_at` present | `entityType/entityId/mode/previous/new/changed` incl. destination/purpose/schedule/asset snapshot fields | None observed (mode markers/actor helpers validated) |
| Approve booking | `PENDING_APPROVAL -> APPROVED` | DEMO explicit approver actor verified; LIVE-actor attribution validated in audit records | 1 | Correct | Correct | Present | Correct metadata/snapshots | None |
| Reject booking | `PENDING_APPROVAL -> REJECTED` | LIVE verified-principal actor attribution validated | 1 | Correct | Correct | Present | Reason captured in metadata/details | None |
| Assign vehicle | `APPROVED -> ASSIGNED` | Mode-aware actor validated | 1 | Correct | Correct | Present | Status/asset/snapshot changes captured | None |
| Complete booking | `ASSIGNED -> COMPLETED` | Mode-aware actor validated | 1 | Correct | Correct | Present | Correct | None |
| Cancel booking | `PENDING_APPROVAL -> CANCELLED` (validated) | Mode-aware actor validated | 1 | Correct | Correct | Present | Correct | None |

**UI wiring (code-inspected, 16.4.6.2A.5):** `BOOKING_CREATED/APPROVED/REJECTED/VEHICLE_ASSIGNED/COMPLETED/CANCELLED` emitted post-write with `getActorIdForMode`/`canPerformLiveWrite` guards and explicit audit-failure surfacing. `BOOKING_UPDATED` and `DRIVER_ASSIGNED` are **not wired** (no existing workflows).

## 3. Audit failure and recovery validation

| Scenario | Result |
|---|---|
| Booking write failure | No audit emitted for failed booking write (simulated provider); no spurious audit record. |
| Audit write failure after successful booking write | Booking persisted, audit reported failed (`ok:false,error`), **no duplicate booking created**, no audit record stored in real provider. UI behavior (inspected): explicit error states booking saved/not reverted and audit requires recovery; not reported as full success. |
| Duplicate action submission | In-process idempotency key dedup prevents repeat emit in same process for same logical action. |
| Application reload after audit failure / repeated emission | **Reload simulation clears in-memory dedup** (`resetAuditDedupForTests` equivalent), allowing a duplicate audit record for same logical action. Confirms in-memory key is **not** durable idempotency. |
| Notification failure after successful booking and audit | Booking and audit remain persisted (no rollback); notification handled as separate post-persist concern. UI messages distinguish audit/notification failures. |
| Retry/reconciliation without duplicate booking | No automatic retry creates a duplicate booking. Reconciliation is possible by querying audit records by booking/entity id (`getAuditRecords`) to detect existing action records before manual replay. |

## 4. AddInData reconciliation capability & durability assessment

- **Existing APIs:** `createAuditRecord`, `getAuditRecords(bookingId)` available on providers/types; local/AddInData implementations support reading records by booking id (AddInData scans `AddInData` by `addInId` and filters by `booking_id`).
- **Durable idempotency:** **Not supported/claimed.** `apps/web/src/audit/auditTrail.ts` uses in-memory `Set` for dedup only (cleared on reload/process restart). `apps/web/src/data/addinDataProvider.ts` `createAuditRecord` performs unconditional `Add` with generated id/timestamp and has no idempotency key lookup/uniqueness enforcement; `details` contains `idempotencyKey` metadata but it is not used for provider-side dedupe.
- **Limitation:** durable recovery/replay cannot be guaranteed idempotent across process restarts without schema/provider support.
- **Compatible recommendation (no implementation in this phase):** persist/derive a deterministic audit idempotency key per logical action (e.g. mode + booking_id + action + previous/new + actor [+ transition timestamp/version where safe]), store it in a queryable/indexable field or dedicated audit key field, and make `createAuditRecord` check-then-add (or use provider-native uniqueness if available) before insert; alternatively reconcile by scanning existing audit records for the same key/action transition prior to retry. Until then, operators must reconcile manually via `getAuditRecords` and avoid blind retries.

## 5. Missing workflow assessment (`BOOKING_UPDATED`, `DRIVER_ASSIGNED`)

| Action | Assessment | Decision |
|---|---|---|
| `BOOKING_UPDATED` | No existing booking-edit/reschedule/update workflow or provider mutation in UI/data layer; only create + status transitions implemented. | **Remain pending** (correct). No unrelated edit functionality created. |
| `DRIVER_ASSIGNED` | `assignedDriverUserId` exists in model/types but no driver-assignment UI flow or provider mutation found; current assignment flow emits `VEHICLE_ASSIGNED` on `ASSIGNED` transition. | **Remain pending** (correct). No unrelated driver-assignment functionality created. |

Emitter supports these action types for compatibility, but end-to-end workflow wiring is intentionally absent.

## 6. LIVE/DEMO security regression

Validated via `identityResolver`/`modeGuards`/workflow regression tests and UI inspection:
- LIVE identity **authenticated**: writes permitted (guarded path), actor resolved to verified principal only.
- LIVE identity **unresolved/error/loading/null**: `canPerformLiveWrite` fails closed; `getActorIdForMode` returns `null` in LIVE; UI blocks gated actions.
- **DEMO mode:** explicit demo actor used; demo-only operations allowed only in DEMO.
- **DEMO reset:** guarded by mode and non-live provider (`assertDemoOnlyOperation`, `assertProviderNotLiveForDemoOperation`) with stale-state clearing.
- **Mode switching:** stale actor/notification/pending state cleared (defense-in-depth) and demo actor cannot authorize LIVE operations.
- **Stale notification actions/actor:** depend on resolved `actorId`; unresolved LIVE yields no actionable actor id.
- **Provider isolation:** live provider blocked for demo-only operations; provider selection explicit/fail-closed by mode.

## 7. User experience (audit failure after persisted booking)

From `apps/web/src/ui/App.tsx` behavior:
- Booking persistence is attempted first; on audit failure the booking is **not resubmitted/re-created/reverted**.
- User is informed booking was saved/action applied **and** that audit persistence failed with recovery note (not full success). Notification failures reported separately and do not mask audit failure.
- Reconciliation context available (booking id surfaced in message; audit records queryable by booking id in providers), but UI does not implement an automated recovery action.

## 8. Test execution (exact commands and results)

| Command | Result |
|---|---|
| `npx tsc -p apps/web/tsconfig.json --noEmit` | PASS |
| `npm --workspace apps/web run build` (tsc -b + vite + service build) | PASS |
| `node --experimental-strip-types --test apps\web\test\workflowRegression.test.mjs` | PASS (10/10) |
| `node --experimental-strip-types --test apps\web\test\auditTrail.test.mjs` | PASS (9/9) |
| `node --experimental-strip-types --test apps\web\test\safetyGuards.test.mjs` | PASS (8/8) |
| `node --experimental-strip-types --test apps\web\test\identityResolver.test.mjs` | PASS (12/12) |
| `node --experimental-strip-types --test apps\web\test\addinData.serialization.test.mjs` | PASS (10/10) |
| `node --experimental-strip-types --test apps\web\test\service-addin.test.mjs` | PASS (28/28) |
| `node --test apps\web\src\config\lifecycleDiagnostics.test.mjs` | PASS (14/14) |
| `node --experimental-strip-types --test apps\web\src\config\lifecycleBridge.test.mjs` | PASS (17/17) |
| Browser E2E (Playwright/Cypress) | **N/A** — no e2e framework/config or dependency available |

**Total executed:** 108/108 passed. Mock/local providers only.

## 9. Remaining limitations and production readiness assessment

- **Durable audit idempotency/recovery:** in-memory dedup only; AddInData audit writes not durably idempotent across reloads/retries. Reconciliation requires manual/query-based checks.
- **Workflow gaps:** `BOOKING_UPDATED` and `DRIVER_ASSIGNED` pending due to absent application workflows/mutations (intentional).
- **No live MyGeotab verification:** no authenticated runtime evidence for `https://my.geotab.com` (`opex_trial`), real `getSession/Get User`, AddInData behavior, or end-to-end audit persistence in tenant. **Live MyGeotab verification not claimed.**
- **No browser E2E automation** in this environment.
- **UI/flow integration coverage:** validated at provider/emitter/guard/module level plus code inspection; not full UI-driven integration in-browser.

**Production readiness:** **Not ready for production claim**. Local/type/build/regression evidence is strong for implemented paths and fail-closed safety behavior, but blocked by missing live authenticated MyGeotab/runtime verification, non-durable audit idempotency, and absent E2E/live workflow evidence. Status **PARTIAL**.
