# Phase 14.2 – AddInId Format Audit

**Repository:** `C:\04. Project 2026\Geotab\Book Vehicle\opex-vehicle-booking-clone`
**Target database:** `opex_trial`
**Date:** 2026-11-15

## 1. Format Classification: FAIL → PASS

### Before Phase 14.2 (FAIL)

The `DEFAULT_ADDIN_ID` was a conventional hyphenated UUID:

```
d2c2efec-c558-412c-b94f-0bac247a4640
```

This format does NOT match the official Geotab Storage API documentation. Geotab's documented example:

```
a2C4ABQuLFkepPVf6-4OKAQ
```

This is a **base64url-encoded UUID v4** (22 characters, no padding, no hyphens), not a hyphenated UUID string.

### After Phase 14.2 (PASS)

The `DEFAULT_ADDIN_ID` was regenerated as base64url-encoded UUID v4:

```
0sLv7MVYQSy5TwusJHpGQA
```

This matches the Geotab documented format:
- 22 characters
- Base64url alphabet: `[A-Za-z0-9_-]`
- No padding (`=`)
- No hyphens
- Same length as Geotab's example (`a2C4ABQuLFkepPVf6-4OKAQ` is also 22 chars)

## 2. Generation Algorithm

The AddInId is generated as follows:

1. Generate a UUID v4 (16 random bytes with version/variant bits set)
2. Base64url-encode the 16 raw bytes (NOT the hex string)
3. Strip padding (`=`)

**Verification script:**
```javascript
const crypto = require('crypto');
const buf = crypto.randomBytes(16);
buf[6] = (buf[6] & 0x0f) | 0x40; // version 4
buf[8] = (buf[8] & 0x3f) | 0x80; // variant 10xx
const b64url = buf.toString('base64url').replace(/=+$/, '');
console.log(b64url); // 22 chars, base64url format
```

## 3. Code Locations Updated

| File | Change |
|------|--------|
| `apps/web/src/config/addinId.ts` | DEFAULT_ADDIN_ID changed to base64url format; added `isValidAddInId()` validation |
| `apps/web/src/ui/App.tsx` | Imports `isValidAddInId`; shows `⚠ invalid format` warning when stored value is invalid; updated placeholder to base64url example |
| `apps/web/src/serviceAddin.ts` | DEFAULT_ADDIN_ID changed to same base64url format (self-contained in standalone bundle) |
| `apps/web/test/service-addin.test.mjs` | Updated 2 test expectations to new base64url DEFAULT_ADDIN_ID |

## 4. AddInId Consistency: PASS

Both Custom-page Add-In and Service Add-In use the exact same `DEFAULT_ADDIN_ID` value: `0sLv7MVYQSy5TwusJHpGQA`.

- `apps/web/src/config/addinId.ts` line 10: `export const DEFAULT_ADDIN_ID = "0sLv7MVYQSy5TwusJHpGQA";`
- `apps/web/src/serviceAddin.ts` line 50: `const DEFAULT_ADDIN_ID = "0sLv7MVYQSy5TwusJHpGQA";`

## 5. localStorage Migration: PASS (No Silent Migration)

**No silent namespace change.** The implementation follows these rules:

| Scenario | Behavior |
|----------|----------|
| No stored AddInId | Falls back to `DEFAULT_ADDIN_ID` (base64url format) |
| Stored valid base64url AddInId | Uses stored value (user-configured) |
| Stored invalid value (e.g. `opex_trial`) | Returns stored value as-is (no silent overwrite), UI shows `⚠ invalid format` warning |
| Storage service missing/incomplete | Returns `null` (safe no-op for Service Add-In) |

**Key safety rule:** If an administrator previously entered `opex_trial` as their AddInId, it remains in localStorage. The code does NOT silently overwrite it because existing AddInData records may exist under that namespace. The UI displays `⚠ invalid format` to alert the administrator that the value needs correction.

## 6. isValidAddInId Validation

```typescript
export function isValidAddInId(value: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  if (value.length !== 22) return false;
  return /^[A-Za-z0-9_-]{22}$/.test(value);
}
```

- Rejects `null`, `undefined`, empty strings
- Rejects `opex_trial` (10 chars, fails length check)
- Rejects hyphenated UUIDs (36 chars, fails length check)
- Accepts base64url-encoded UUID v4 (22 chars, base64url alphabet)

## 7. Files Not Modified (Intentional)

| File | Reason |
|------|--------|
| `geotab/opex-vbm-config.json` | Contains Add-In registration URL and metadata, not AddInId |
| `geotab/opex-vbm-service-config.json` | Contains Service Add-In `serviceSrc` URL, not AddInId |
| `apps/web/src/data/addinDataProvider.ts` | Already uses `this.addInId` parameter — no hardcoded value |
| `apps/web/src/ui/App.tsx` localStorage key | Already uses `ADDIN_ID_STORAGE_KEY` constant — no change needed |

## 8. Remaining Risks

| Risk | Classification |
|------|---------------|
| Administrator previously entered `opex_trial` as AddInId | Stored value takes precedence; UI shows warning but does not auto-correct |
| AddInId not issued by MyGeotab during registration | DEFAULT_ADDIN_ID is a pre-generated placeholder; administrator should replace with value from actual MyGeotab registration |
| Cross-context `localStorage` sharing | `window.localStorage` (custom-page) and `service.localStorage` (WebWorker) sharing is not guaranteed by Geotab docs |

## 9. API Initialization: NOT VERIFIED

A correct AddInId format does NOT prove API connectivity. The `API not available` indicator is a separate concern requiring:
- MyGeotab Add-In registered in `opex_trial` tenant
- Add-In loaded inside MyGeotab iframe (not standalone browser)
- `geotab.addin.opexVehicleBooking` lifecycle methods invoked by MyGeotab
- `api.getSession()` returning valid session
