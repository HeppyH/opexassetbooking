# Phase 14.4 – MyGeotab API Connectivity Diagnostic

**Repository:** `C:\04. Project 2026\Geotab\Book Vehicle\opex-vehicle-booking-clone`
**Target database:** `opex_trial`
**Date:** 2026-11-15

## 1. Symptom

The application previously displayed `API not available` when running outside a registered MyGeotab Add-In context. The Add-In lifecycle callbacks (`initialize`, `focus`, `blur`) never fired because the Add-In was not registered or loaded in the MyGeotab tenant.

## 2. API Lifecycle Architecture

### Custom-page Add-In Registration (`main.tsx`)

```typescript
window.geotab.addin.opexVehicleBooking = () => ({
  initialize: (api, state, callback) => {
    document.documentElement.dataset.opexVbm = "initialized";
    window.dispatchEvent(new CustomEvent("opex-vbm:initialize", { detail: { api, state } }));
    callback();
  },
  focus: (api, state) => {
    window.dispatchEvent(new CustomEvent("opex-vbm:focus", { detail: { api, state } }));
  },
  blur: (api, state) => {
    window.dispatchEvent(new CustomEvent("opex-vbm:blur", { detail: { api, state } }));
  }
});
```

### API Consumption (`App.tsx`)

1. Listens for `opex-vbm:initialize` CustomEvent with `{ api, state }` detail
2. Sets `geotabApi` state from `ce.detail.api`
3. Calls `ce.detail.api.getSession(...)` to retrieve user identity
4. On session success, auto-activates ADDIN_DATA mode if `addInId` is configured
5. Creates `AddInDataBookingDataProvider(geotabApi, addInId)` when in ADDIN_DATA mode

### Effective Mode Logic

```
effectiveMode = mode === "ADDIN_DATA" && !geotabApi ? "DEMO" : mode
```

If ADDIN_DATA is intended but `geotabApi` is null, falls back to DEMO (no silent use of ADDIN_DATA without API).

## 3. Root Cause of "API not available"

| Cause | Classification | Explanation |
|-------|---------------|-------------|
| Add-In not registered in `opex_trial` tenant | REQUIRES TENANT VALIDATION | `geotab.addin.opexVehicleBooking` lifecycle never registered → `initialize`/`focus` events never fire |
| Add-In not loaded in current MyGeotab session | REQUIRES TENANT VALIDATION | Add-In registered but user hasn't opened it from the MyGeotab menu |
| `ce.detail.api` is null/undefined | REQUIRES TENANT VALIDATION | MyGeotab didn't inject a valid API object into the CustomPage context |
| Running in standalone browser (not inside MyGeotab iframe) | EXPECTED | No `window.geotab` object exists outside MyGeotab context |
| `api.call` not a function | REQUIRES TENANT VALIDATION | API object exists but doesn't have the expected `call` method |

## 4. Code-Level Safeguards

The application implements these safeguards for API unavailability:

| Safeguard | Location | Behavior |
|-----------|----------|----------|
| `geotabApi` null check | `App.tsx:1708` | Falls back to DEMO mode if ADDIN_DATA intended but no API |
| `api?.call` null check | `addinDataProvider.ts:161` | Rejects with `GEOTAB_API_NOT_AVAILABLE` |
| Error surfacing | `App.tsx:1747` | Shows clear error: "MyGeotab Add-In API is not available" |
| No silent fallback | `App.tsx:1746-1753` | ADDIN_DATA failures are surfaced, not silently swallowed |
| DEMO mode last resort | `App.tsx:1755` | Only falls back to DEMO when mode is already DEMO |

## 5. Diagnostic Logging (Added in Phase 14.4)

Safe diagnostic logging was added (no sensitive data logged):

### `addinDataProvider.ts`
- `AddInDataBookingDataProvider constructed` — logs hasApi, hasAddInId, addInIdValid
- `AddInData API call started` — logs method, typeName
- `AddInData API call succeeded` — logs method, typeName
- `AddInData API call failed` — logs method, typeName, error message (truncated)

### `serviceAddin.ts`
- `Service Add-In registered, initializing notification delivery`
- `Service Add-In deliverPendingNotifications started`
- `Service Add-In AddInId resolved` — logs addInIdValid (boolean only, not the value)
- `Service Add-In deliverPendingNotifications: no pending records`
- `Service Add-In deliverPendingNotifications: pending records found` — logs count
- `Service Add-In cleanup, stopping notification polling`

### Logging Safety

- Never logs session tokens, authentication credentials, or personal data
- Never logs actual AddInId values (only validity boolean)
- Error messages are truncated to 100 characters
- Logging is wrapped in try/catch to never throw

## 6. Read-Only AddInData Get Diagnostic

The `addinDataProvider.ts` implements read-only Get operations:

| Operation | Method | Parameters | addInId Required |
|-----------|--------|------------|------------------|
| Get bookings | `Get` | `{ typeName: "AddInData", search: { addInId, whereClause, resultsLimit } }` | No (read) |
| Get notifications | `Get` | `{ typeName: "AddInData", search: { addInId, ... } }` | No (read) |
| Get audit records | `Get` | `{ typeName: "AddInData", search: { addInId, ... } }` | No (read) |

**Important:** Read-only Get operations do NOT check addInId validity. They send the request to the API with whatever addInId is configured. The API may return:
- Empty array (no records under that AddInId)
- API error (invalid AddInId format)
- Records (if AddInId matches registered Add-In)

## 7. Service Add-In Diagnostic

### Initialization Flow

1. `geotab.addin.service = (service) => { ... }` registered in WebWorker context
2. `deliverPendingNotifications(service)` called on startup
3. `getAddInId(service)` reads from `service.localStorage`
4. If no AddInId → safe no-op (returns early)
5. If AddInId exists → polls AddInData every 30 seconds for pending notifications

### Error Handling

| Failure | Handling |
|---------|----------|
| `service.localStorage` missing | `getAddInId` returns null → safe no-op |
| `service.localStorage.get` throws | Falls back to `DEFAULT_ADDIN_ID` |
| `service.api.call` missing | `apiCall` returns null → no delivery attempted |
| `service.notifications.show` missing | Delivery skipped, record left as pending |
| Native notification fails | Record marked as `failed`, not `delivered` |
| AddInData Get fails | `apiCall` returns null → no records processed |

### False Positive Prevention

Missing API context does NOT produce false successful delivery statuses:
- If `service.api.call` is missing, `apiCall` returns null
- `deliverPendingNotifications` checks `if (!records || records.length === 0) return`
- No records are marked as delivered unless `service.notifications.show()` succeeds

## 7. Verification Checklist (Requires Tenant Access)

| Check | Status | Notes |
|-------|--------|-------|
| Add-In registered in `opex_trial` | REQUIRES TENANT VALIDATION | Register via System Settings → Add-Ins |
| `geotab.addin.opexVehicleBooking` lifecycle fires | REQUIRES TENANT VALIDATION | Open Add-In from MyGeotab menu |
| `ce.detail.api` is a valid API object | REQUIRES TENANT VALIDATION | Check `api.call` is a function |
| `api.getSession()` returns session | REQUIRES TENANT VALIDATION | Retrieves userName, database, server |
| AddInData Get returns results | REQUIRES TENANT VALIDATION | Read-only, no data modification |
| Service Add-In `service.notifications.show` works | REQUIRES TENANT VALIDATION | Native toast delivery in tenant |
