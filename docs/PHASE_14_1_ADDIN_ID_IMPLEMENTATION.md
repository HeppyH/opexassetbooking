# Phase 14.1 – AddInId Implementation for MyGeotab Storage API

**Repository:** `C:\04. Project 2026\Geotab\Book Vehicle\opex-vehicle-booking-clone`
**Target database:** `opex_trial`
**Date:** 2026-11-15

## 1. Problem

The MyGeotab database name `opex_trial` was manually entered into the application's AddInId field by an administrator. `opex_trial` is the database/tenant name, **not** a valid Storage API AddInId. The Geotab Storage API (AddInData) requires an AddInId — an encoded GUID issued during Add-In registration — to associate stored records with an Add-In.

Reference: https://developers.geotab.com/myGeotab/addIns/addInStorage/

## 2. Root Cause

The application had no hardcoded/default AddInId. The AddInId was entirely user-entered via the UI input field (`App.tsx`) and persisted in `localStorage` under key `opex-vbm-addin-id`. With no default value, an administrator could enter any string — including the database name `opex_trial` — causing AddInData API calls to target the wrong namespace.

## 3. Solution

Implemented a stable, dedicated AddInId for OPEX Asset Booking that is shared by both the Custom-page Add-In and the Service Add-In.

### 3.1 Generated AddInId

A unique encoded GUID was generated for OPEX Asset Booking:

**Redacted:** `d2c2efec-****-****-****-************` (full value in source code only)

The value is a UUID v4 formatted as `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx` per RFC 4122. It is stable across application loads and is NOT the database name, NOT arbitrary text, and NOT different on every load.

### 3.2 Code Changes

| File | Change |
|------|--------|
| `apps/web/src/config/addinId.ts` | **New file.** Defines `DEFAULT_ADDIN_ID`, `ADDIN_ID_STORAGE_KEY`, and `resolveAddInId()`. Primary source of truth for the Custom-page Add-In. |
| `apps/web/src/ui/App.tsx` | Imports `DEFAULT_ADDIN_ID`, `ADDIN_ID_STORAGE_KEY`, `resolveAddInId` from config. Uses `resolveAddInId()` as fallback when localStorage has no stored value. All localStorage key references use `ADDIN_ID_STORAGE_KEY` constant. |
| `apps/web/src/serviceAddin.ts` | Defines `DEFAULT_ADDIN_ID` directly (self-contained standalone bundle). `getAddInId()` falls back to `DEFAULT_ADDIN_ID` when storage returns null or throws. Returns `null` only when the storage service itself is missing/incomplete. |
| `apps/web/test/service-addin.test.mjs` | Updated storage tests to expect `DEFAULT_ADDIN_ID` fallback instead of `null` when no value is stored or read fails. |

### 3.3 Resolution Logic

**Custom-page Add-In (`App.tsx`):**
1. On initialization, read `ADDIN_ID_STORAGE_KEY` from `window.localStorage`
2. If a value exists, use it
3. If no value exists, use `DEFAULT_ADDIN_ID`
4. When user saves a custom value, it overwrites localStorage and becomes the active AddInId

**Service Add-In (`serviceAddin.ts`):**
1. On startup, read `ADDIN_ID_KEY` from `service.localStorage`
2. If a value exists, use it
3. If no value exists (or read fails), use `DEFAULT_ADDIN_ID`
4. If the storage service is missing/incomplete, return `null` (safe no-op)

Both components resolve to the same `DEFAULT_ADDIN_ID` when no user-configured value exists.

### 3.4 Data Safety

- No existing AddInData records were deleted, overwritten, or migrated
- Records previously stored under `opex_trial` (incorrect AddInId) remain under that namespace; they will not be visible under `DEFAULT_ADDIN_ID`
- No localStorage is used as production persistence in ADDIN_DATA mode
- No silent fallback to DEMO mode

### 3.5 API Initialization Findings

The `API not available` indicator is a **separate concern** from AddInId. Verified:

| Check | Status |
|-------|--------|
| MyGeotab API lifecycle (`initialize`/`focus`/`blur`) | Implemented in `main.tsx` |
| API availability inside Custom-page Add-In | Depends on MyGeotab injecting `geotab.addin.opexVehicleBooking` |
| AddInData provider initialization | `createAddInDataProvider(api, addInId)` — requires both `api` and non-null `addInId` |
| `api.call()` contract | `(method, params, success, error)` callback style — implemented in `addinDataProvider.ts` |
| AddInData Get/Add/Set parameters | All include `addInId` in entity/search — verified |
| Correct `addInId` value | Now `DEFAULT_ADDIN_ID` or user-configured value — no longer `opex_trial` by default |

Correcting AddInId alone does **not** fix API availability. API availability requires the Add-In to be registered in the `opex_trial` tenant and loaded inside MyGeotab.

## 4. Files Modified

| File | Lines | Change |
|------|-------|--------|
| `apps/web/src/config/addinId.ts` | New | DEFAULT_ADDIN_ID, ADDIN_ID_STORAGE_KEY, resolveAddInId() |
| `apps/web/src/ui/App.tsx` | ~8 | Import config, use resolveAddInId() fallback, constant storage key |
| `apps/web/src/serviceAddin.ts` | ~6 | DEFAULT_ADDIN_ID constant, getAddInId() fallback |
| `apps/web/test/service-addin.test.mjs` | ~12 | Updated 3 storage test expectations |

## 5. Validation Results

| Check | Result |
|-------|--------|
| `npx tsc -p apps/web/tsconfig.json --noEmit` | PASS (clean) |
| `npm test` | 65/65 PASS |
| Service Add-In tests | 16/16 PASS |
| `npm --workspace apps/web run build` | PASS (main + serviceAddin.js) |

## 6. Administrator Actions (Do Not Commit/Push/Deploy)

1. **Do not enter `opex_trial` as the AddInId.** It is the database name, not the AddInId.
2. Register the Custom-page Add-In in `opex_trial` via MyGeotab System Settings → Add-Ins
3. Record the AddInId generated by MyGeotab during registration
4. If the generated AddInId differs from `DEFAULT_ADDIN_ID`, enter the generated value in the app's AddInId field
5. Register the Service Add-In using the same AddInId
6. Deploy `serviceAddin.js` to the URL specified in `geotab/opex-vbm-service-config.json`
