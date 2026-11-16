# PHASE 16.4.6.2 — Known Issues

**Phase:** 16.4.6.2 — MyGeotab Sandbox Integration & Regression Testing  
**Date:** 2026-11-16 (UTC)  
**Branch / Commit:** `phase-14-5-addinid-diagnostics` / `b9f9024`

## 1. Unresolved defects

| ID | Severity | Area | Description | Status | Recommended action |
|---|---|---|---|---|---|
| KI-16.4.6.2-01 | Unknown (integration risk) | AddInData live contract | Actual MyGeotab Sandbox behavior for `details` storage/return shape (object vs JSON string) not observed in this phase. Automated tests validate serializer output and string/object deserialization compatibility, but cannot prove tenant-side response format. | **BLOCKED** | Execute controlled sandbox Add/Get/Set with `PHASE16462-TEST` records once environment is positively identified and capture sanitized request/response metadata. |
| KI-16.4.6.2-02 | Medium | Booking lifecycle | Create/approve/reject/status persistence, audit history, and notification side-effects not end-to-end validated against live AddInData. | **BLOCKED** | Run Phase 4 scenarios in sandbox with dedicated test asset/user; verify refresh persistence and field integrity. |
| KI-16.4.6.2-03 | Medium | Notification Center (LIVE) | Filters, read/unread transitions, Open Booking navigation, and post-refresh persistence not validated in tenant-backed UI. | **BLOCKED** | Run Phase 5 UI scenarios in sandbox and capture screenshots/evidence. |
| KI-16.4.6.2-04 | Medium | Failure handling | Live fault-injection cases not exercised: AddInData API unavailable during LIVE flow, Set failure, duplicate/retry behavior/idempotency. | **NOT TESTED** | Add controlled integration/error-injection tests (or documented manual sandbox procedure) without introducing architectural rewrites. Evaluate idempotency for create/update if duplicates are possible. |
| KI-16.4.6.2-05 | Low | UI messaging | Post-persist notification-failure path now reports distinct error in code, but no automated rendered-UI assertion exists for toast/message content. | **Open (coverage gap)** | Consider lightweight UI/component or integration test for message outcomes if project test stack supports it. |

## 2. Environmental limitations

- **Sandbox identification unavailable:** MyGeotab sandbox tenant/database, authenticated session, and live API access were not available in the CLI execution environment. Per safety constraints, all tenant write/read integration steps were halted before execution.
- **No browser-in-tenant automation:** UI verification inside MyGeotab iframe/Add-In context (including screenshots of live connection, booking actions, notification center persistence) could not be performed.
- **Geotab Add-In manifests:** Point to hosted URLs (`https://heppyh.github.io/opexassetbooking/`); validation of currently deployed bundle vs this working tree was out of scope and not performed (no deployment).

## 3. Sandbox-specific issues

- None observed (sandbox access not established). Record any tenant-specific errors, permission denials, AddInId registration issues, or AddInData quota/behavior anomalies during future sandbox execution.

## 4. Recommended follow-up improvements (separate from this validation)

- Perform full Phase 16.4.6.2 sandbox run in a controlled, authenticated environment with a confirmed non-production database and dedicated test asset/user; prefix all created records `PHASE16462-TEST` and capture sanitized evidence.
- If `details` is returned as a string by MyGeotab in practice, confirm current tolerant deserialization is sufficient end-to-end (provider + service add-in) and add a live-contract note to docs.
- Review idempotency/deduplication for booking and notification creation paths to prevent duplicates on retries/network uncertainty (only if aligned with current architecture).
- Ensure Service Add-In notification query/filter behavior is compatible with actual AddInData storage/indexing semantics in tenant (whereClause/payload shape) during live validation.
- After successful sandbox validation, follow normal approval process before commit/push/deploy.

## 5. Test records / cleanup

- **Test records created in this phase:** None.
- **Cleanup required:** None. Future sandbox test records must be identifiable by `PHASE16462-TEST`, ID-confirmed, and deleted only when safe and supported (no deletion of pre-existing records).
