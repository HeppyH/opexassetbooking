# PHASE 16.4.6.11 — Data Integrity Report

## Executive Summary

Documented data integrity issues found in the OPEX Vehicle Booking Management Add-In when operating in LIVE (MyGeotab/AddInData) mode against Production tenant `opex_trial`. Malformed, legacy, and incomplete AddInData records can cause UI crashes, incorrect Dashboard/Report metrics, and misleading asset mapping. All findings are code-confirmed; Production runtime verification is BLOCKED due to lack of authenticated access.

---

## 1. Asset Mapping Findings

### Data Flow

```
MyGeotab Device (GET Device)
  → mapLiveAsset() [mygeotabProvider.ts:60-72]
  → ResolvedAsset { id, asset_code: `VEH-${id.slice(-3).toUpperCase()}`, asset_name: parseVehicleName(name) }
  → Booking.deviceId stored in AddInData details
  → resolveBooking() / resolveAddInDataBooking() lookup device by booking.deviceId
```

### Identity Mapping Table (Mock Data)

| MyGeotab Device ID | Device Name | License Plate | Asset Code |
|-------------------|-------------|---------------|------------|
| dev-001 | Toyota Fortuner #01 | BS 1234 XY | VEH-001 |
| dev-002 | Toyota Hilux #02 | BS 5678 AB | VEH-002 |
| dev-003 | Toyota Zenix #03 | BS 9012 CD | VEH-003 |
| ... | ... | ... | ... |
| dev-016 | Toyota Innova #16 | BS 2627 WX | VEH-016 |

### Production Discrepancy (BLOCKED)

| Observation | Mock Data | Production (screenshot) |
|-------------|-----------|------------------------|
| Total Assets | 16 | 2 |
| Most Booked Asset | VEH-001 (mock) | VEH-B1 |
| Booking #y3sa Asset | N/A | Unassigned |

**VEH-B1 does not exist in mock data.** It would require a Production device with ID ending in `B1`. Cannot verify without authenticated Production access.

### Root Causes

1. **Mock data ≠ Production data**: The 16 mock devices are development fixtures. Production `opex_trial` tenant has its own device set.
2. **No asset ID normalization**: `deviceId` in bookings and `id` in devices use the same value, but if Production device IDs differ in format from mock data, lookups fail silently.
3. **Unmapped devices not flagged**: When `devices.get(booking.deviceId)` returns `undefined`, the booking shows "Unassigned" with no data quality indicator.

---

## 2. Booking Data Integrity Findings

### How Malformed Records Are Produced

Booking #y3sa (Unassigned, Unknown User, Invalid Date, status `—`) results from **silent degradation** in `resolveAddInDataBooking()`:

| Rendered Value | Code Location | Root Cause |
|---------------|---------------|------------|
| `Unassigned` | `addinDataProvider.ts:681` | `devices.get(booking.deviceId)` → `undefined` → `asset_name: null` |
| `Unknown User` | `addinDataProvider.ts:680` | `users.get(booking.requesterUserId)` → `undefined` → `"Unknown User"` |
| `Invalid Date` | `App.tsx:111-115` | `new Date(null/undefined/"")` → `Invalid Date` |
| `—` (status) | `statusHelpers.ts:11` | `formatStatusLabel(null/undefined)` → `"—"` |

### Data Quality Classification (New)

| Classification | Condition | Count in Business Metrics? |
|---------------|-----------|---------------------------|
| `VALID` | All required fields present | Yes |
| `MISSING_ASSET` | `deviceId` null/empty | No |
| `MISSING_REQUESTER` | `requesterUserId` null/empty | No |
| `MISSING_STATUS` | `status` null/empty | No |
| `INVALID_DATETIME` | `startAt`/`endAt` unparseable | No |
| `MULTIPLE_VALIDATION_ERRORS` | 2+ issues | No |

### Validation Logic

`validateResolvedBooking()` (`bookingValidation.ts:46-64`) checks all required fields and returns the most severe quality level plus all detected issues. Applied in:
- `resolveAddInDataBooking` (`addinDataProvider.ts`)
- `resolveBooking` (`dataProvider.ts`)
- `resolveBookingToResolved` (`addinDataProvider.ts`)

### Malformed Details Handling

`deserializeBooking()` (`addinDataProvider.ts:58-59`) calls `JSON.parse()` on record details. If details are malformed JSON, it throws. Now wrapped in try/catch in `resolveAddInDataBooking`, producing a fallback record instead of crashing all bookings.

---

## 3. Dashboard vs Booking Reports Discrepancies

### Same Dataset?

Yes. Both use `filterBookings()` on the same `bookings` state with the same `filters`.

### Metric Reconciliation

| Metric | Dashboard | Report | Calculation | Difference | Root Cause |
|--------|-----------|--------|-------------|------------|------------|
| Total Assets | 2 | — | `assets.length` | — | Production returns 2 devices; mock has 16 |
| Available Assets | 2 | — | `status === "AVAILABLE"` | — | Same device fetch |
| Total Bookings | — | 6 | `bookings.length` | — | Counts invalid records too |
| Asset Utilization | — | 50% | `assetsWithBookings / assets.length` | — | Only 2 assets visible |
| Most Booked Asset | — | VEH-B1 | `byAsset` max | — | VEH-B1 not in mock data |
| UNDEFINED status | — | 5 | `byStatus["undefined"]` | — | Undefined status counted as business status |
| COMPLETED status | — | 1 | `byStatus["COMPLETED"]` | — | Valid |
| Pending Approval | 1 | — | `status === "PENDING_APPROVAL"` | — | #5624 |
| Active Bookings | 0 | — | `APPROVED` or `ASSIGNED` | — | None |

### Fix Applied

Booking Reports now separates:
- **Operational metrics**: Valid bookings only (excludes invalid from status/asset/utilization)
- **Data Quality Metrics**: Invalid records counted separately by issue type

---

## 4. Booking #y3sa Investigation

### Confirmed (code behavior)

- `deviceId` not found in device map → "Unassigned"
- `requesterUserId` not found in user map → "Unknown User"  
- `startAt`/`endAt` null/invalid → `new Date(null)` → "Invalid Date"
- `status` null/undefined → `formatStatusLabel()` → `"—"`

### Blocked (requires Production access)

- Whether #y3sa's `deviceId` exists in Production MyGeotab
- Whether stored JSON has null fields or missing fields
- Whether `deviceId` format matches Production device ID format

---

## 5. Booking #5624 Datetime Investigation

### Rendered Values (from screenshot)

| Field | Value | Source |
|-------|-------|--------|
| Date | 17 Nov 2026 | `formatDate(b.start_at)` |
| Time | 23:05–14:08 | `formatTime(b.start_at)` – `formatTime(b.end_at)` |

### Timezone Inconsistency

| Component | Timezone | Uses `tenantTimezone.ts`? |
|-----------|----------|--------------------------|
| New Booking form submission | Asia/Jakarta | ✅ Yes (`toIsoFromTenantParts`) |
| Dashboard `formatDate`/`formatTime` | Browser local | ❌ No |
| Booking Reports `formatDate`/`formatTime` | Browser local | ❌ No |

### Same Day vs Next Day (BLOCKED)

Cannot determine if end time (14:08) is same day or next day without stored ISO values:
- If start `2026-11-16T23:05:00Z`, end `2026-11-17T14:08:00Z` → overnight
- If start `2026-11-17T23:05:00Z`, end `2026-11-17T14:08:00Z` → same-day error

### Fix Applied

- `formatStatusLabel` now used in Status Summary instead of raw `status.replace()`
- Tenant timezone helpers available but not yet applied to Dashboard/Reports rendering (P1 recommendation)

---

## 6. CI and Test Coverage Findings

### Before This Phase

| Check | Coverage |
|-------|----------|
| Root `npm test` | API tests only |
| `apps/web/test/*.mjs` | NOT run by CI |
| Asset ID mapping | No tests |
| Missing device/user references | No tests |
| Invalid datetime handling | No tests |
| Booking aggregation | No tests |
| Dashboard/report reconciliation | No tests |

### After This Phase

| Check | Coverage |
|-------|----------|
| Root `npm test` | API tests only |
| `npm --workspace apps/web run test` | All web `.mjs` tests (129 total) |
| Asset ID mapping | ✅ Covered |
| Missing device/user references | ✅ Covered |
| Invalid datetime handling | ✅ Covered |
| Booking aggregation | ✅ Covered |
| Dashboard/report reconciliation | ✅ Covered |

### CI Change

Added to `.github/workflows/ci.yml`:
```yaml
- name: Web regression tests
  run: npm --workspace apps/web run test
```

---

## 7. Prioritized Remediation Plan

### P0 (Critical)

1. ✅ Fixed `localeCompare` crash at `App.tsx:549` — `safeStringCompare` helper
2. ✅ Fixed malformed details crash — try/catch in `resolveAddInDataBooking`
3. ✅ Fixed Status Summary `status.replace()` crash — `formatStatusLabel`
4. ✅ Added Error Boundary for section isolation

### P1 (High)

5. Apply tenant timezone to Dashboard/Reports date rendering (`formatTenantDateTime`)
6. Show end date for overnight bookings in reports
7. Add per-record try/catch in `getBookings` (dataProvider.ts)
8. Add data quality exception counts to Dashboard stats

### P2 (Medium)

9. Web tests in CI (done)
10. Additional regression tests for edge cases
11. Investigate VEH-B1 Production device identity (requires Production access)

---

## 8. Safety Confirmation

- No Production AddInData Add/Set/Remove executed
- No Production booking actions performed
- No Production tenant configuration changes
- No Production data cleanup or migration
- No Production deployment
- No Git commit, push, merge, or rebase
- No credentials exposed
- All existing work preserved
