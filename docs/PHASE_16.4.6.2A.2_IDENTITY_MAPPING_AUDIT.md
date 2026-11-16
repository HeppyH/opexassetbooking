# PHASE 16.4.6.2A.2 — OPEX VBM Authenticated User Identity Mapping Audit

**Phase:** 16.4.6.2A.2 — Authenticated User Identity Mapping Audit  
**Application:** OPEX Vehicle Booking Management (MyGeotab Add-In)  
**Target database:** `opex_trial` (PRODUCTION) — **read-only investigation; no live tenant access from CLI**  
**Report date:** 2026-11-16 (UTC)  
**Overall status:** **PARTIAL**

> **Constraints honored:** Read-only source inspection only. No AddInData Add/Get/Set/Remove, no booking/notification creation, no user/tenant configuration changes, no source code modifications, no commits/pushes/deployment. All pre-existing uncommitted changes preserved. **No authenticated identity is claimed verified without evidence from the actual MyGeotab API/runtime context.**

## 1. Reported symptom

UI string observed/reported:
> `heppy@opexcg.com (b3D0) — demo identity, not authenticated MyGeotab`

This is rendered by the application when a `demoUser` (acting user context) is set and the New Booking screen displays it as a demo/non-authenticated identity.

## 2. Repository / environment snapshot (inspection context)

| Item | Value |
|---|---|
| Branch | `phase-14-5-addinid-diagnostics` |
| HEAD | `b9f9024` (`feat(asset): display MyGeotab vehicle identity in asset register`) |
| Working tree | Pre-existing uncommitted changes preserved: `M apps/web/src/data/addinDataProvider.ts`, `M apps/web/src/serviceAddin.ts`, `M apps/web/src/ui/App.tsx`, `?? apps/web/test/addinData.serialization.test.mjs`, and untracked phase docs. |

## 3. Files inspected (as requested)

- `apps/web/src/main.tsx` — MyGeotab Add-In lifecycle registration, API/state handoff to lifecycle bridge.
- `apps/web/src/config/lifecycleBridge.ts` — stores latest valid MyGeotab `api` (requires callable `call`), subscriber recovery.
- `apps/web/src/config/lifecycleDiagnostics.ts` — optional read-only diagnostics (build-time gated, disabled by default); no identity mapping logic.
- `apps/web/src/data/mygeotabProvider.ts` — live master-data reads (`Device/User/Group`) via `api.call("Get",...)`; booking transactions delegated to local provider in this class.
- `apps/web/src/data/dataProvider.ts` — local/demo provider (localStorage-backed bookings/notifications/audit, mock master data).
- `apps/web/src/data/types.ts` — domain/provider interfaces (`OpexBooking.requesterUserId`, `ResolvedBooking.requester_id`, `approver_id`, `OpexBookingAudit.actor_user_id`, etc.).
- `apps/web/src/ui/App.tsx` — mode selection, session retrieval, acting-user (`demoUser`) state, booking/approval UI flows, displayed identity banner.
- `apps/web/src/config/addinId.ts` — AddInId config (not identity-related).

## 4. Exact root cause (code-traced)

**Primary root cause:** The application does **not** resolve the authenticated MyGeotab session principal to a canonical MyGeotab User entity and does **not** maintain a separate authenticated-user identity for LIVE operations. Instead, it:

1. Retrieves only **session metadata** via `api.getSession(...)` (`userName`, `database`, `server`) and stores it as `currentMyGeotabUser` for display/context (`App.tsx`: `initialBridgeState.api.getSession` / subscription callbacks ~1703–1748; topbar display ~2328–2337).
2. Attempts a best-effort **name/id string match** between `currentMyGeotabUser.userName` and loaded provider users to auto-populate `demoUser` in `ADDIN_DATA` mode:  
   `users.find(u => u.name === currentMyGeotabUser?.userName || u.id === currentMyGeotabUser?.userName)` (~1779–1784).  
   No `Get` call for `User` filtered by authenticated session user; no use of session user identifiers beyond `userName`; no mapping from email/login to MyGeotab user `id`.
3. Uses a single acting-user state named `demoUser` for **all** requester/approver context and UI labeling, including in `ADDIN_DATA` mode. New Booking unconditionally labels this as:  
   `Booking as: <b>{demoUser.name}</b> ({demoUser.id}) — demo identity, not authenticated MyGeotab` (~732–736).  
   DEMO-mode user selector is shown when `mode === "DEMO"` (~2339–2358), but `demoUser` can also be auto-set in ADDIN_DATA by the heuristic match.
4. Uses `demoUser.id` as `requesterUserId` for booking creation (~1957–1968) and as `approverId` for approve/reject actions (~1995, ~2017), and as the notification recipient context in several UI refresh paths (e.g. ~1978, ~2004, ~2026). If `demoUser` is null, creation is blocked in UI (`!demoUser` guards ~671–674, ~1957).
5. **Identity source/meaning mismatch:** `mapLiveUser` in `addinDataProvider.ts` resolves live users as `{ id: raw.id, name: raw.name || "Unknown", roles: raw.role ? [raw.role] : ["EMPLOYEE"] }` (~170–176) and does not include `email` in `ResolvedUser` or in matching. If `getSession().userName` is an email/login (e.g. `heppy@opexcg.com`) while MyGeotab User `name` is a display name, the auto-match can fail or resolve to an unintended record depending on tenant data. Conversely, the displayed `demoUser.id` is the provider/user record `id` (for live AddInData path, `raw.id` from `Get User`).

**Contributing factors:**
- No dedicated authenticated-principal model/state; UI conflates "acting demo selection" with "authenticated MyGeotab identity".
- `MyGeotabUser` in types includes `email` (~types.ts users section) but `ResolvedUser` drops it and matching does not consult it.
- `getSession` callback/session shape used in app exposes `userName/database/server` only; no evidence in code of retrieving authenticated user `id` via `Get User` with session identity criteria.
- `currentMyGeotabUser` is shown in topbar as "MyGeotab User" (session info) while booking actions rely on `demoUser` — two different identity signals with inconsistent semantics.

## 5. Actual identity resolution flow (as implemented)

| Step | Component | Behavior |
|---|---|---|
| 1 | `main.tsx` | Registers `window.geotab.addin.opexVehicleBooking`; on `initialize/focus` stores `(api, state)` in lifecycle bridge and dispatches events. |
| 2 | `lifecycleBridge.ts` | Retains latest valid API; notifies subscribers (including pre-mount recovery). |
| 3 | `App.tsx` lifecycle effect | Reads bridge/subscribes; calls `api.getSession(cb)`; sets `currentMyGeotabUser = session` when present; may switch mode to `ADDIN_DATA` if AddInId configured (~1704–1748). |
| 4 | `App.tsx` data load | Selects provider: `ADDIN_DATA` → `createAddInDataProvider(geotabApi, addInId)`; else demo/local provider (~1761–1767, ~1836–1843). Loads assets/users/bookings. |
| 5 | `App.tsx` auto-map (ADDIN_DATA) | If `effectiveMode === "ADDIN_DATA" && currentMyGeotabUser`, finds user by `name === session.userName || id === session.userName` and sets `demoUser` if not already set (~1779–1784). **No email-based match; no `Get User` by authenticated identity.** |
| 6 | `App.tsx` UI/actions | `demoUser` required/used for create (`requesterUserId`), approve/reject (`approverId`), notification refresh context; New Booking banner always states "demo identity, not authenticated MyGeotab" when `demoUser` exists (~734). DEMO mode allows manual user selection from loaded users. |
| 7 | Providers | AddInData/live master-data user mapping: `ResolvedUser{id,name,roles}` from `Get User` results (`addinDataProvider.ts` mapLiveUser; `mygeotabProvider.ts` similar). Booking records persist `requesterUserId`/`approverId` (and audit schema includes `actor_user_id`) as provided by caller. |

## 6. Meaning and source of identity `b3D0` (verifiability)

- **In-repository evidence:** **Not found.** Searches across source/docs in workspace (excluding `node_modules`/`dist`) did not locate `b3D0`, `heppy`, or the exact banner string. Mock/demo users in `apps/web/src/data/mockMyGeotab.ts` use IDs like `u101`–`u115` with `@demo.local` emails (inspected), not `b3D0`/`heppy@opexcg.com`.
- **Plausible interpretation (unverified):** Given rendering `{demoUser.name} ({demoUser.id})` (~734), `b3D0` would be `demoUser.id` and `heppy@opexcg.com` would be `demoUser.name` at runtime. In LIVE/`ADDIN_DATA` master-data flows, `demoUser.id` originates from provider user records (for `AddInDataBookingDataProvider`, `raw.id` from `Get User` mapped in `mapLiveUser`). **This cannot be confirmed without evidence from the actual MyGeotab API/runtime context** (e.g. `getSession` result, `Get User` response for the authenticated principal, and selected `demoUser` object in browser).
- **Conclusion:** `b3D0` **cannot be verified from source alone** as either a local/demo identifier or an actual MyGeotab user ID. Treat as **unknown pending runtime evidence**.

## 7. Investigation questions — findings

| # | Question | Finding (code-traced) | Evidence status |
|---|---|---|---|
| 1 | Why is authenticated MyGeotab user not mapped to booking user? | Session provides `userName` only; app attempts name/id equality against provider users, does not query/resolve authenticated User entity by session identity/email, and uses `demoUser` (often manual/demo-labeled) as booking actor. Mismatch/failure leaves booking identity dependent on `demoUser` selection/state. | **Code evidence**; live session/user values unverified. |
| 2 | Meaning/source of `b3D0`? | Not present in repo; would correspond to rendered `demoUser.id`. | **Unverifiable from source; BLOCKED without runtime evidence.** |
| 3 | Is `b3D0` local/demo or actual MyGeotab user ID? | Cannot determine. Mock IDs differ (`u***`); live `Get User` IDs could differ. | **Unknown.** |
| 4 | Does MyGeotab API context expose authenticated user identity? | App consumes `api.getSession()` (userName/database/server). Whether session or other API calls in this runtime provide canonical user ID/email for `opex_trial` principal is **not proven by code alone**. | **Partial (session fields used); not verified in actual API context.** |
| 5 | Does app resolve authenticated user's actual user ID? | No explicit resolution to canonical authenticated user record/ID; only heuristic match to loaded users by `name`/`id` vs `session.userName`. | **No (per implementation).** |
| 6 | Can architecture safely map authenticated identity to OPEX booking identity? | **Potentially yes, with minimal changes:** lifecycle provides `api` in MyGeotab runtime; providers already fetch `User` entities in AddInData/live-master flows; session `userName` available. Safe mapping requires explicit principal resolution, clear separation of authenticated vs demo actor, and fail-safe behavior in LIVE mode. | **Feasible in design; not implemented/verified.** |
| 7 | What happens if identity resolution fails? | In ADDIN_DATA auto-map, `demoUser` remains unset unless previously set (~1779-1784 condition). UI blocks create if `!demoUser` (~671, ~1957) and shows "No demo user selected..." in New Booking (~737-741). However, semantics/messages remain "demo user" oriented; no explicit "authenticated identity unresolved" LIVE guard observed. | **Code-traced.** |
| 8 | Can a booking be created with a demo identity in LIVE mode? | **Possible in current design** if `demoUser` is set to a non-authenticated/demo-selected record while `mode === "ADDIN_DATA"` and provider allows write (AddInData provider performs `createBooking` with supplied `requesterUserId` from caller). Auto-match could also bind `demoUser` to a tenant user record but UI still labels it "demo identity, not authenticated MyGeotab" (misleading). Manual demo selection control is rendered for DEMO mode in topbar (~2340), reducing but not structurally eliminating ambiguity. **Runtime confirmation required.** | **Risk indicated by code; live behavior unverified.** |
| 9 | How are booking and approval audit fields populated? | **Booking:** `requesterUserId` = `demoUser.id` at create (`App.tsx` ~1961); stored in `OpexBooking.requesterUserId` / resolved to `requester_id`. `approverId` passed to `provider.updateBookingStatus(..., approverId, approvalRemarks)` from `demoUser?.id` on approve/reject (~1875-1879, ~1995, ~2017). **Audit:** `OpexBookingAudit`/`createAuditRecord` exist in types and providers (`addinDataProvider.ts` ~572+, `dataProvider.ts` ~378+, `types.ts`), but **no `createAuditRecord` invocation found in `apps/web/src/ui`** during inspection; audit persistence on UI transitions appears **not wired** in inspected UI flow (notification engine handles notifications separately). | **Code-traced; partial.** |

## 8. Security and audit risks

| Risk | Severity | Description |
|---|---|---|
| Identity spoofing / misattribution (LIVE) | **High** | Booking requester/approver IDs are taken from mutable `demoUser` UI state, not a verified authenticated principal binding. Incorrect mapping or inappropriate selection can attribute actions to wrong user. |
| Misleading assurance | **High** | "MyGeotab User" session info displayed in topbar while actions may use separately resolved `demoUser` labeled "demo identity, not authenticated MyGeotab", creating ambiguous trust signals. |
| Audit trail weakness | **High** | Approval/rejection pass `approverId` into status updates, but UI does not appear to emit `createAuditRecord` entries; audit completeness/immutability for actor attribution cannot be confirmed from inspected flow. |
| Fallback/denial ambiguity | **Medium** | If session-user resolution fails, creation blocked by missing `demoUser` (safe against anonymous create) but lacks explicit LIVE-mode authenticated-identity enforcement and operator feedback. |
| Data integrity / supportability | **Medium** | Reliance on string equality against `userName` (possibly email/login) vs `name`/`id` is brittle across tenants/locales/name formats. |
| Compliance/traceability | **Medium** | In production (`opex_trial`), inability to prove actor identity from application logic undermines non-repudiation for bookings/approvals. |

## 9. Relevant files and functions (trace anchors)

- `apps/web/src/main.tsx`: `window.geotab.addin.opexVehicleBooking` `initialize/focus/blur` → `setLifecycleApi`.
- `apps/web/src/config/lifecycleBridge.ts`: `setLifecycleApi`, `getLifecycleApi`, `subscribeToLifecycle`.
- `apps/web/src/ui/App.tsx`: `currentMyGeotabUser` state; `getSession` usage (~1703–1748); provider selection/load (~1761–1843); auto-match `demoUser` (~1779–1784); `onCreateBooking` (~1953–1991, `requesterUserId: demoUser.id`); `onApprove`/`onConfirmReject`/`onAssign` (~1993–2055, `approverId`/assigner from `demoUser`); New Booking identity banner/guards (~671–674, ~732–741, ~761); topbar session and DEMO user selector (~2328–2358); `mode` `DEMO|ADDIN_DATA`.
- `apps/web/src/data/addinDataProvider.ts`: `mapLiveUser` (~170–176), `createBooking` persists `requesterUserId` from input, `updateBookingStatus` persists `approverId/approvalRemarks`, `createAuditRecord` API available (~572+) but caller-dependent.
- `apps/web/src/data/mygeotabProvider.ts`: live `Get User/Device/Group`, user mapping, booking delegation to local provider.
- `apps/web/src/data/dataProvider.ts`: local/demo storage and user resolution; `createAuditRecord` available (~378+).
- `apps/web/src/data/types.ts`: `OpexBooking.requesterUserId`, `ResolvedBooking.requester_id/approver_id`, `OpexBookingAudit.actor_user_id`, `ResolvedUser`.

## 10. Acceptance criteria assessment

| Criterion | Result | Notes |
|---|---|---|
| Authenticated identity source identified | **PASS (partial evidence)** | Source is MyGeotab runtime `api.getSession` (session metadata) captured in UI; canonical principal resolution not implemented. |
| Demo identity origin identified | **PASS** | `demoUser` state (manual DEMO selection and/or heuristic auto-match) rendered as "demo identity, not authenticated MyGeotab" in New Booking; backed by provider user records (mock or live `Get User` mapping depending on mode/data). |
| Booking identity mapping traced | **PASS** | `demoUser.id` → `createBooking.requesterUserId` / stored booking requester fields. |
| Audit trail mapping traced | **PARTIAL** | Status updates carry `approverId`; audit record structures/APIs exist but UI write path for `createAuditRecord` not observed in inspected flow. |
| LIVE identity fallback behavior understood | **PASS (code-traced)** | Heuristic match only; if unresolved, `demoUser` may remain null and create is guarded; no explicit authenticated-principal enforcement or clear LIVE error semantics. |
| Safe remediation documented | **PASS** | See `docs/PHASE_16.4.6.2A.2_REMEDIATION_PLAN.md`. |

## 11. Final status

**PARTIAL**

**Rationale:** Static code tracing is sufficient to identify the root cause, mapping paths, and risks, but (1) the specific reported identity values (`heppy@opexcg.com`, `b3D0`) and (2) actual MyGeotab session/user payloads and effective runtime behavior in `opex_trial` **cannot be verified without evidence from the actual MyGeotab API/browser runtime context**. No write operations performed; no code changed.
