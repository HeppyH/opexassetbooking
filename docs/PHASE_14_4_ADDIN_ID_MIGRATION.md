# Phase 14.4 – AddInId Migration

**Repository:** `C:\04. Project 2026\Geotab\Book Vehicle\opex-vehicle-booking-clone`
**Target database:** `opex_trial`
**Date:** 2026-11-15

## 1. Problem

The administrator previously entered `opex_trial` into the application's AddInId field. `opex_trial` is the MyGeotab database/tenant name, **not** a valid Geotab Storage API AddInId. The Geotab Storage API requires an AddInId that is an encoded GUID (base64-encoded UUID string, URL-safe encoded, prefixed with `a`).

If `opex_trial` is used as the AddInId, all AddInData API calls (Get/Add/Set/Remove) will target the wrong namespace and will fail or return empty results.

## 2. Migration Behavior

The application implements **safe, non-destructive migration** with the following rules:

| Scenario | Behavior |
|----------|----------|
| No stored AddInId | Falls back to `DEFAULT_ADDIN_ID` (stable, valid format) |
| Stored valid AddInId | Uses stored value directly |
| Stored invalid value (e.g. `opex_trial`) | Returns stored value **as-is** (never silently overwritten); UI shows `⚠ invalid format` warning; write operations are rejected |
| Stored empty string | Returns empty string; flagged as invalid |
| Storage service missing (Service Add-In) | Returns `null`; safe no-op, no delivery attempted |
| Storage access exception | Falls back to `DEFAULT_ADDIN_ID` |

### Key Safety Rules

1. **No silent namespace change:** If an administrator previously entered `opex_trial`, it remains in `localStorage` under key `opex-vbm-addin-id`. The code never silently overwrites it because existing AddInData records may exist under that namespace.
2. **Write operations rejected for invalid IDs:** `addinDataProvider.ts` checks `isValidAddInId()` before Add/Set/Remove operations and rejects with `ADDIN_ID_INVALID` if the format doesn't match.
3. **Read operations allowed:** Get operations are not blocked by invalid AddInId (the API may return empty results or an error, which is surfaced to the user).
4. **No DEMO fallback:** The application does not silently switch to DEMO mode when ADDIN_DATA is intended but the AddInId is invalid.

## 3. AddInId Resolution Logic

### Custom-page Add-In (`App.tsx`)

1. On initialization, reads `opex-vbm-addin-id` from `window.localStorage`
2. If a value exists, uses it (even if invalid — flagged to user)
3. If no value exists, uses `DEFAULT_ADDIN_ID`
4. `isValidAddInId()` is checked; invalid values show `⚠ invalid format` in the UI
5. When user saves a new value, it overwrites `localStorage` and becomes the active AddInId

### Service Add-In (`serviceAddin.ts`)

1. On startup, reads `opex-vbm-addin-id` from `service.localStorage`
2. If a value exists, uses it (even if invalid — logged as invalid)
3. If no value exists or read throws, uses `DEFAULT_ADDIN_ID`
4. If the storage service is missing/incomplete, returns `null` (safe no-op)
5. Both components use the same `DEFAULT_ADDIN_ID` value: `aDJjMmVmZWMtYzU1OC00MTJ`

## 4. Code Locations

| File | Role |
|------|------|
| `apps/web/src/config/addinId.ts` | Primary source: `DEFAULT_ADDIN_ID`, `ADDIN_ID_STORAGE_KEY`, `generateGeotabAddInId()`, `isValidAddInId()`, `resolveAddInId()` |
| `apps/web/src/ui/App.tsx` | Custom-page Add-In: reads/writes localStorage, shows invalid format warning |
| `apps/web/src/serviceAddin.ts` | Service Add-In: self-contained `DEFAULT_ADDIN_ID` and `isValidAddInIdLocal()` for WebWorker context |
| `apps/web/src/data/addinDataProvider.ts` | Rejects write operations when addInId is null or invalid format |
| `apps/web/test/service-addin.test.mjs` | 28 tests including 7 migration tests |

## 5. Migration Test Results

All migration tests pass (28/28 service add-in tests):

| Test | Result |
|------|--------|
| No stored value returns DEFAULT_ADDIN_ID | PASS |
| Missing get method returns null | PASS |
| Valid stored value is retrieved | PASS |
| Storage read failure returns DEFAULT_ADDIN_ID | PASS |
| Previous invalid value `opex_trial` returned as-is (not overwritten) | PASS |
| Empty stored value flagged as invalid | PASS |
| Valid stored value used directly | PASS |

## 6. Administrator Actions

1. **Do not enter `opex_trial` as AddInId** — it is the database name, not a valid AddInId
2. Register Custom-page + Service Add-Ins in `opex_trial` via MyGeotab System Settings → Add-Ins
3. Record the AddInId generated during registration
4. If the generated AddInId differs from `DEFAULT_ADDIN_ID`, enter it in the app's AddInId field
5. If the UI shows `⚠ invalid format`, correct the AddInId value before using ADDIN_DATA mode
6. Read-only Get operations work with any AddInId value (API may return empty results for invalid IDs)
7. Write operations require a valid AddInId format
