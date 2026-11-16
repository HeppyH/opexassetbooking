# PHASE 16.4.6.2A.7 — MyGeotab Production Read-Only Verification

**Phase:** 16.4.6.2A.7 — Authenticated MyGeotab production runtime read-only verification  
**Application:** OPEX Vehicle Booking Management (web Add-In)  
**Tenant:** `https://my.geotab.com`, database `opex_trial` (**PRODUCTION**)  
**Date:** 2026-11-16 (UTC)  
**Final status:** **BLOCKED**

## 1. Executive summary

Authenticated browser/runtime access to the MyGeotab production tenant (`https://my.geotab.com`, database `opex_trial`) is **not available in this execution environment**. No live `getSession()` result, runtime identity resolution, LIVE provider/AddInData reads, or existing audit-record reads could be observed or evidenced. **No production data was accessed or modified.** This report documents required read-only verification scope, exact manual verification instructions, and what must be captured as sanitized evidence. Runtime claims are **not fabricated**.

## 2. Mandatory restrictions (observed)

- `opex_trial` treated as **PRODUCTION**.
- **Read-only operations only** intended; **no writes performed**.
- No booking creation, no approval/rejection, no AddInData `Add`/`Set`/`Remove`, no notification writes, no configuration changes, no deployment, no commit/push.
- Existing uncommitted changes preserved.
- No credentials, session tokens, or sensitive user data exposed.

## 3. Runtime verification results (blocked — no evidence)

| Item | Expected verification | Result | Evidence |
|---|---|---|---|
| Add-In initialization (MyGeotab runtime) | Add-In loads in `https://my.geotab.com/opex_trial` context; lifecycle/API bridge initialized | **BLOCKED** | Not available (no authenticated runtime) |
| Actual `getSession()` result (sanitized) | `userName`, `database`, `server` present/consistent; no tokens exposed | **BLOCKED** | Not available |
| Authenticated principal resolution | `resolveAuthenticatedPrincipal` resolves deterministically via targeted `Get User` search on `session.userName` (single canonical id match) | **BLOCKED** | Not available (local/unit behavior only; not live proof) |
| Resolved user ID and display identity | Verified principal `id`, `name`, roles from canonical `User` record | **BLOCKED** | Not available |
| Identity state `authenticated` | UI/state shows `authenticated` (not `loading/unresolved/error`) | **BLOCKED** | Not available |
| No DEMO actor fallback | LIVE mode must not use `demoActor`; `getActorIdForMode` returns verified principal only in `ADDIN_DATA` | **BLOCKED (runtime)** / implementation reviewed locally | No runtime screenshot/log |
| UI identity label correct | LIVE shows verified MyGeotab identity (name/id/db context) or explicit blocked reason; no "demo identity" presented as authenticated LIVE | **BLOCKED (runtime)** / implementation reviewed locally | No runtime screenshot/log |

**Implementation notes (code-level, not runtime evidence):** `apps/web/src/auth/identityResolver.ts` requires `api.call` + `getSession` + trimmed `userName`, performs `Get User` with `search:{name: session.userName}` and `resultsLimit:10`, accepts only one match with canonical non-empty `id`; otherwise `unresolved/error`. It does **not** infer identity from email/display-name equality as fallback and does not use demo/local identities.

## 4. Provider and AddInData verification (read-only) — blocked

| Item | Expected verification | Result | Evidence |
|---|---|---|---|
| Runtime provider mode | `ADDIN_DATA` / LIVE mode active in MyGeotab context | **BLOCKED** | Not available |
| LIVE provider selection | Active provider is AddInData/live provider (not local/demo for LIVE) | **BLOCKED** | Not available |
| Configured AddInId | UI/configured AddInId matches intended/registered value; format valid | **BLOCKED** | Not available (repo default resolved via `generateGeotabAddInId(...)` in `apps/web/src/config/addinId.ts`; tenant/runtime-configured value not verifiable here) |
| AddInData read capability | `Get` `AddInData` for configured `addInId` succeeds (read-only) | **BLOCKED** | Not available |
| Existing booking records readable | Existing booking AddInData records returned and deserializable without modification | **BLOCKED** | Not available |
| Existing audit records readable by booking ID | `getAuditRecords(bookingId)` / equivalent filtered read returns existing records without modification | **BLOCKED** | Not available |
| Serialization/deserialization compatibility | Existing stored `details` (object/string-compatible handling per prior implementation) parse correctly | **BLOCKED** | Not available (local tests passed previously; not tenant evidence) |

**AddIn configuration (repo artifact, not runtime proof):** `geotab/opex-vbm-config.json` points to `https://heppyh.github.io/opexassetbooking/` (menu `OPEX Asset Booking`, `ActivityLink`). Runtime-installed configuration in `opex_trial` must be confirmed manually.

## 5. Safety validation (no writes triggered) — blocked runtime / implementation reviewed

| Item | Expected verification | Result | Evidence |
|---|---|---|---|
| LIVE write guard enabled | Booking/approval/status actions gated by `canPerformLiveWrite`/verified identity in LIVE | **BLOCKED (runtime)** | Local implementation/tests previously validated; no live evidence |
| Unresolved identity blocks writes | `unresolved/error/loading/null` identity cannot authorize LIVE writes | **BLOCKED (runtime)** | No live evidence |
| DEMO reset unavailable in LIVE | `onResetDemoData` fails closed in LIVE / against live provider; no demo reset executable in LIVE | **BLOCKED (runtime)** | No live evidence |
| No DEMO provider/actor leaks into LIVE | Mode switching clears stale demo actor/state; LIVE actor resolved to verified principal only | **BLOCKED (runtime)** | No live evidence |

**Do not** deliberately trigger production write operations to prove blocking; rely on UI state/disabled controls/messages and read-only inspection.

## 6. Audit verification (read existing records only) — blocked

| Field | Expected | Result |
|---|---|---|
| `booking_id` | Present, matches target booking | **BLOCKED** |
| `action` | Present (e.g. lifecycle action) | **BLOCKED** |
| `actor_user_id` | Present; attributable actor id | **BLOCKED** |
| `previous_status` | Present or `null` as applicable | **BLOCKED** |
| `new_status` | Present or `null` as applicable | **BLOCKED** |
| `details` | JSON/string-compatible payload readable/deserializable | **BLOCKED** |
| `created_at` | Present timestamp | **BLOCKED** |

No test audit records created.

## 7. Sanitized evidence (none captured)

| Evidence item | Status | Notes |
|---|---|---|
| MyGeotab authenticated session (sanitized) | **Not captured** | Capture: database `opex_trial`, server, masked `userName` as policy allows; **no session tokens/cookies/credentials**. |
| OPEX VBM identity state | **Not captured** | Capture: `authenticated/unresolved/error/loading`, verified principal display name/id (sanitized), "Verified MyGeotab" indicator; no tokens. |
| Provider mode and AddInId | **Not captured** | Capture: LIVE/ADDIN_DATA indicator, configured AddInId (may be shown/masked per policy), "configured/invalid" status. |
| Read-only AddInData result | **Not captured** | Capture: count/record ids/types or sanitized booking summaries only; **no sensitive PII beyond necessary sanitized identifiers**. |
| Existing audit record structure | **Not captured** | Capture: field names/shape and sanitized values for one or more existing records (if present). |
| LIVE safety status | **Not captured** | Capture: write controls disabled/blocked reason when unverified (if observable without forcing unsafe state), no demo reset in LIVE. |

## 8. Exact manual verification instructions (read-only)

Perform only in an authorized, authenticated browser session. **Do not execute Add/Set/Remove, booking create/approve/reject/assign/complete/cancel, notification writes, demo reset in LIVE, or configuration changes.**

1. **Access:** Sign in to `https://my.geotab.com`, select database `opex_trial`. Navigate to **OPEX Asset Booking** Add-In (ActivityLink) as installed for the tenant.
2. **Initialization/session (sanitized):** Open browser devtools console/network only as needed for read-only observation. Confirm Add-In initializes without errors. If safe debug/UI indicators exist, record sanitized session context: `database` (`opex_trial`), `server`, `userName` (mask if required). **Do not copy/export tokens, cookies, credentials, or full sensitive headers.**
3. **Identity:** Observe identity panel/badge. Verify state `authenticated`, resolved principal `id` and display name/roles shown as "Verified MyGeotab identity" (not demo). Confirm no DEMO actor selector influencing LIVE and no demo fallback label in LIVE.
4. **Provider/AddInId:** Confirm mode is LIVE/`ADDIN_DATA` (inside MyGeotab). Record configured AddInId and validity indicator. Do not change/save AddInId.
5. **Read-only AddInData/bookings:** Allow the app to load/read existing data. Confirm existing booking records render/read (sanitized count/sample identifiers). Do not create/edit/delete bookings. Optionally, in console run **read-only** `api.call("Get", { typeName: "AddInData", search: { addInId: "<configured>" } }, cb, err)` only if permitted by local policy and without exporting sensitive payloads; capture sanitized record count/structure only.
6. **Read-only audit records:** If UI exposes audit history, inspect existing records for a known booking id and capture field structure (`booking_id`, `action`, `actor_user_id`, `previous_status`, `new_status`, `details`, `created_at`) sanitized. If not exposed, use a read-only provider/query path already available in the running app context if safe; **do not call Add/Set/Remove** and **do not create test audit records**.
7. **Safety (non-destructive):** Verify write actions are disabled/blocked when identity is unverified (only if naturally observable; do not force unsafe conditions via writes). Confirm DEMO reset is not available/executable in LIVE. Confirm mode/provider indicators show no demo leakage.
8. **Evidence capture:** Save sanitized screenshots/log snippets (redact user PII, tokens, credentials, raw record contents beyond necessary fields). Store under `docs/` evidence folder if created by authorized operator.

## 9. Remaining risks

- **No live runtime evidence:** identity resolution, `getSession` payload shape, `Get User` matching in tenant, provider/AddInId wiring, AddInData read behavior, and existing audit schema/contents unverified in production.
- Prior local phases: audit persistence wired but **not production-verified**; audit idempotency not durable across reloads; `BOOKING_UPDATED`/`DRIVER_ASSIGNED` workflows pending; no browser E2E in this environment.
- Any discrepancy between repo config/defaults and tenant-installed Add-In configuration unknown until manually verified.

## 10. Production readiness recommendation

**Not ready to claim production-verified.** Final status **BLOCKED** for this phase due to unavailable authenticated runtime access. Recommend completing the manual read-only verification above in `https://my.geotab.com` (`opex_trial`) with sanitized evidence before any production-readiness sign-off that depends on live identity, AddInData, or audit behavior.
