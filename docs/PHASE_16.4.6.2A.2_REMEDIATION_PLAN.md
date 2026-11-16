# PHASE 16.4.6.2A.2 — Identity Mapping Remediation Plan

**Phase:** 16.4.6.2A.2 — OPEX VBM Authenticated User Identity Mapping Audit (remediation planning only)  
**Application:** OPEX Vehicle Booking Management  
**Target database:** `opex_trial` (PRODUCTION)  
**Report date:** 2026-11-16 (UTC)  
**Status:** Planning only — **no implementation without separate approval**

## 1. Goal

Ensure that in **LIVE (MyGeotab / `ADDIN_DATA`)** mode, booking requester and approval/audit actor identities are derived from a **verified authenticated MyGeotab principal**, not from a selectable/demo-labeled UI identity. Preserve DEMO mode behavior for local/demo workflows where explicitly intended.

## 2. Minimal, safe remediation (recommended)

### 2.1 Separate identity concepts in UI/state
- Introduce distinct state/models:
  - **Authenticated principal (LIVE):** resolved from MyGeotab runtime (session + canonical `User` record/id) — read-only to user selection in LIVE.
  - **Demo actor (DEMO only):** explicit demo user selection, clearly labeled and never treated as authenticated.
- Replace/limit `demoUser` usage so booking/approval actions in LIVE consume the authenticated principal, not a demo selector.

### 2.2 Deterministic authenticated principal resolution
- On `getSession` success (and when API becomes available), resolve the authenticated user via `api.call("Get", { typeName: "User", ... })` using the most reliable session identifier(s) available in the runtime (**to be confirmed in-browser**; do not infer equivalence from email string matching without evidence). Prefer canonical MyGeotab user `id` if obtainable; otherwise use a documented, verified lookup strategy.
- Store resolved principal: `{ id, name, userName/login/email if available, roles/groups as needed }` with provenance (session-verified).
- **Matching rule:** avoid ambiguous `name === userName || id === userName` as the sole mechanism; include email/login matching only if field presence is verified in `Get User` results and types are extended safely.

### 2.3 LIVE-mode enforcement and fail-safe behavior
- **If LIVE and principal unresolved:** block booking create/approve/reject actions that require actor identity; show an explicit, non-misleading error (e.g. "Authenticated MyGeotab identity could not be resolved") and do not fall back to DEMO/local identity or to arbitrary user records.
- **No silent fallback:** preserve existing "no silent DEMO fallback" posture for persistence; extend to identity.
- Keep DEMO selector/labeling only when `mode === "DEMO"`.

### 2.4 Audit trail correctness
- On create/approve/reject/assign (as applicable), persist `createAuditRecord` with verified `actor_user_id` (authenticated principal in LIVE, explicit demo actor in DEMO) and appropriate action/status/details — but only after confirming provider support and idempotency/error-handling expectations.
- Ensure `approverId` (and any future `createdBy`/`updatedBy` fields if added) come from the same verified principal source.

### 2.5 UI/UX corrections
- Remove/replace "demo identity, not authenticated MyGeotab" banner in LIVE; display authenticated principal clearly (without exposing sensitive tokens). Keep session/database/server indicators as today if useful.
- Prevent DEMO user picker from influencing LIVE actions.

### 2.6 Type and provider touch points (minimal surface)
- Consider extending `ResolvedUser`/mapping to include email/login if needed for verified matching (align with `MyGeotabUser`), without breaking existing consumers.
- Keep persistence contract unchanged unless required; prefer passing verified IDs through existing `requesterUserId`/`approverId`/`actor_user_id` fields.

## 3. Relevant implementation areas (for approved change)

| Area | File(s) | Planned change (conceptual) |
|---|---|---|
| Session/principal resolution | `apps/web/src/ui/App.tsx`, possibly small helper/module | Resolve authenticated principal after `getSession`; query `Get User` as needed; store separately from demo actor. |
| Mode/guards | `apps/web/src/ui/App.tsx` | Enforce LIVE principal for write/approval actions; explicit unresolved-identity handling. |
| User mapping/matching | `apps/web/src/data/addinDataProvider.ts`, `apps/web/src/data/mygeotabProvider.ts`, `apps/web/src/data/types.ts` | Expose fields needed for verified matching (e.g. email) if confirmed; tighten lookup. |
| Audit emission | `apps/web/src/ui/App.tsx`, provider interfaces/calls | Invoke `createAuditRecord` at key transitions with verified actor (subject to existing AddInData behavior). |
| Labels | `apps/web/src/ui/App.tsx` | Correct LIVE vs DEMO identity messaging. |

**Out of scope for minimal fix:** authentication architecture rewrite, new persistence backends, unrelated refactors, production deployment.

## 4. Read-only verification steps (post-fix, in authenticated browser)

1. **Environment:** `https://my.geotab.com`, database positively confirmed as `opex_trial`, LIVE/`ADDIN_DATA` mode active, valid AddInId configured.
2. **Principal resolution:** Confirm session retrieved and authenticated principal resolves to the expected MyGeotab user record (sanitized: display name/id format only, no tokens). Verify resolution does not rely on manual demo selection.
3. **UI:** Confirm no "demo identity, not authenticated MyGeotab" label for authenticated LIVE actor; DEMO mode still clearly indicates demo context.
4. **Create booking (authorized test only, if/when write testing is separately approved):** Verify `requesterUserId`/stored requester matches authenticated principal ID; verify no ability to submit as another user in LIVE.
5. **Approve/reject (authorized test only):** Verify `approverId` and audit actor (if implemented) match authenticated approver principal.
6. **Failure mode:** Simulate/observe unresolved identity condition (as safely possible) and confirm actions are blocked with explicit error and no fallback identity.
7. **Evidence:** Sanitized screenshots/log notes; no credentials/tokens/PII or sensitive record contents.

## 5. Regression test recommendations

| Type | Recommendation |
|---|---|
| Unit (UI logic/helpers) | Principal resolution precedence: session+matched user vs unresolved; LIVE blocks writes without principal; DEMO retains explicit demo actor; no cross-mode leakage. |
| Unit (mapping) | `mapLiveUser`/resolved user includes fields required for verified matching; matching uses confirmed identifiers (id/email/login as applicable) deterministically. |
| Integration (mocked API) | `getSession` + `Get User` flows: success resolves principal; missing/ambiguous user results in blocked LIVE actions; no fallback to first/selected demo user. |
| Provider/contract | `createBooking`/`updateBookingStatus` receive expected actor IDs; audit record creation invoked with correct `actor_user_id` on transitions (where supported). |
| E2E/manual (browser, `opex_trial`, authorized) | Authenticated identity displayed and used for create/approve; demo label absent in LIVE; audit/requester attribution correct per inspected records (sanitized). |
| Negative | Unauthenticated/standalone context cannot perform LIVE-attributed writes; unresolved principal produces explicit error. |

## 6. Risks / notes

- Actual `getSession` payload and `User` fields available in the target MyGeotab runtime must be confirmed before finalizing matching logic (do not assume email presence/equivalence).
- `b3D0` / `heppy@opexcg.com` remain **unverified** until observed in authenticated runtime; remediation must not hardcode assumptions based on this report.
- Any code change requires separate approval; production writes/tests require explicit authorization and appropriate phase controls.

## 7. Deliverables produced

- `docs/PHASE_16.4.6.2A.2_IDENTITY_MAPPING_AUDIT.md`
- `docs/PHASE_16.4.6.2A.2_REMEDIATION_PLAN.md`
