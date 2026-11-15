# Phase 14.3 – Geotab AddInId Generator Compatibility

**Repository:** `C:\04. Project 2026\Geotab\Book Vehicle\opex-vehicle-booking-clone`
**Target database:** `opex_trial`
**Date:** 2026-11-15

## 1. Algorithm Audit

### Previous Implementation (Phase 14.2) – INCORRECT

The Phase 14.2 implementation used **standard Base64URL encoding of the 16 raw UUID bytes**:

```typescript
const bytes = Buffer.from(hex, "hex");        // 16 raw bytes
const b64url = bytes.toString("base64url");   // base64url of raw bytes
```

This produced: `0sLv7MVYQSy5TwusJHpGQA`

This does **not** match the official Geotab generator algorithm.

### Official Geotab Generator Algorithm

Per the official Geotab documentation (https://developers.geotab.com/myGeotab/addIns/addInStorage/):

1. **Generate a conventional UUID v4 string** (e.g., `d2c2efec-c558-412c-b94f-0bac247a4640`)
2. **Base64-encode the UUID string** (UTF-8 bytes of the string, not raw UUID bytes)
3. **Replace `/` with `_`**
4. **Replace `+` with `-`**
5. **Return `"a" + encoded.substring(1, 23)`**

### Corrected Implementation

The implementation now follows the exact official algorithm:

| Step | Operation | Example |
|------|-----------|---------|
| 1 | UUID string | `d2c2efec-c558-412c-b94f-0bac247a4640` |
| 2 | Base64-encode string | `ZDJjMmVmZWMtYzU1OC00MTJjLWI5NGYtMGJhYzI0N2E0NjQw` |
| 3 | Replace `/` → `_` | (no change, no `/` in this encoding) |
| 4 | Replace `+` → `-` | (no change, no `+` in this encoding) |
| 5 | `"a" + substring(1, 23)` | `aDJjMmVmZWMtYzU1OC00MTJ` |

**Generated AddInId:** `aDJjMmVmZWMtYzU1OC00MTJ` (23 characters, starts with `a`)

This matches the Geotab example format `a2C4ABQuLFkepPVf6-4OKAQ` (also 23 characters, starts with `a`).

## 2. Code Changes

| File | Change |
|------|--------|
| `apps/web/src/config/addinId.ts` | Rewrote with `generateGeotabAddInId()` implementing exact official algorithm; `DEFAULT_ADDIN_ID` = `aDJjMmVmZWMtYzU1OC00MTJ`; `isValidAddInId()` validates 23 chars starting with `a` |
| `apps/web/src/ui/App.tsx` | Imports `DEFAULT_ADDIN_ID`, `ADDIN_ID_STORAGE_KEY`, `resolveAddInId`, `isValidAddInId`; shows `⚠ invalid format` warning |
| `apps/web/src/serviceAddin.ts` | `DEFAULT_ADDIN_ID` = `aDJjMmVmZWMtYzU1OC00MTJ` (self-contained constant) |
| `apps/web/test/service-addin.test.mjs` | Added 9 algorithm verification tests |

## 3. GenerateGeotabAddInId Function

```typescript
export function generateGeotabAddInId(uuid: string): string {
  const encoded = btoa(uuid);
  const urlSafe = encoded.replace(/\//g, "_").replace(/\+/g, "-");
  return "a" + urlSafe.substring(1, 23);
}
```

- `btoa(uuid)` — Base64-encodes the UUID string (UTF-8 bytes)
- `.replace(/\//g, "_")` — URL-safe: replace `/` with `_`
- `.replace(/\+/g, "-")` — URL-safe: replace `+` with `-`
- `"a" + urlSafe.substring(1, 23)` — Prefix with `a`, take chars 1-22 from encoded

## 4. Stability Guarantee

- `DEFAULT_ADDIN_ID` is computed **once** at module load time using a **fixed UUID string**
- The UUID string `d2c2efec-c558-412c-b94f-0bac247a4640` is hardcoded — it is **not** regenerated on each application load
- Both Custom-page Add-In and Service Add-In use the identical value
- `generateGeotabAddInId()` is exported for verification but not called at runtime to produce a new ID

## 5. isValidAddInId Validation

```typescript
export function isValidAddInId(value: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  if (value.length !== 23) return false;
  if (!value.startsWith("a")) return false;
  return /^a[A-Za-z0-9_-]{22}$/.test(value);
}
```

- Rejects: `null`, `undefined`, empty strings, `opex_trial` (10 chars), hyphenated UUIDs (36 chars)
- Accepts: 23-char base64url strings starting with `a` (e.g., `aDJjMmVmZWMtYzU1OC00MTJ`, `a2C4ABQuLFkepPVf6-4OKAQ`)

## 6. Data Safety

- No existing AddInData records deleted, overwritten, or migrated
- If an administrator previously entered `opex_trial` (or any invalid value) as AddInId, it remains in localStorage
- UI shows `⚠ invalid format` warning for invalid values — no silent overwrite
- No silent fallback to MyGeotab database name

## 7. API Connectivity

A correctly formatted AddInId does **not** prove API connectivity. The `API not available` indicator is a separate concern requiring:
- MyGeotab Add-In registered in `opex_trial` tenant
- Add-In loaded inside MyGeotab iframe (not standalone browser)
- `geotab.addin.opexVehicleBooking` lifecycle methods invoked by MyGeotab
- `api.getSession()` returning valid session
