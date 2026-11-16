# Phase 16.4.6.2A.9 — New Booking Enhancement: Optional Driver & Independent Start/End DateTime

## Status
Complete — implemented, tested, typecheck passes, all 85 automated web suites pass.

## Summary of Changes

### 1. `apps/web/src/config/tenantTimezone.ts` (new)
Tenant-timezone helpers used to interpret date/time inputs in the tenant timezone (Asia/Jakarta, WIB UTC+7) rather than the browser's local timezone:
- `getTenantTimezone()` — returns `{ timezone, offsetMinutes, label }`
- `toIsoFromTenantParts(date, time, tz)` — produces a UTC ISO string from tenant-local `YYYY-MM-DD` / `HH:MM`
- `toTenantLocalParts(iso, tz)` — reverse conversion for display
- `formatTenantDateTime(iso, tz)` — human-readable tenant-local string

### 2. `apps/web/src/data/types.ts`
- `ResolvedBooking`: added `driver_id: string | null` and `driver_name: string | null`
- `ResolvedUser`: added optional `companyGroups?: string[]` (enables asset-group-based driver resolution)
- `BookingDataProvider.createBooking` input: added optional `driverId?: string | null` and `driverName?: string | null`

### 3. `apps/web/src/data/dataProvider.ts` (LocalBookingDataProvider)
- `resolveBooking`: resolves `driver_id`/`driver_name` from `assignedDriverUserId` via user map
- `resolveUser`: populates `companyGroups`
- `createBooking`: accepts optional `driverId`/`driverName`, persists `assignedDriverUserId`

### 4. `apps/web/src/data/addinDataProvider.ts` (AddInDataBookingDataProvider)
- `resolveAddInDataBooking` / `resolveBookingToResolved`: include `driver_id`/`driver_name`
- `mapLiveUser`: populates `companyGroups`
- `createBooking`: accepts optional `driverId`/`driverName`, persists `assignedDriverUserId`
- Conflict check retained (full datetime interval overlap)

### 5. `apps/web/src/audit/auditTrail.ts`
- `snapshotBooking`: now populates `driverId`/`driverName` from `ResolvedBooking.driver_id`/`driver_name` instead of hard-coded null
- `BOOKING_CREATED` audit records now include driver and full start/end datetimes in the snapshot

### 6. `apps/web/src/ui/App.tsx`
**NewBooking component:**
- Added optional **Driver** dropdown below Available Asset (auto-resolved from asset group overlap, manual override, clear capability)
- Replaced single **Booking Date** with independent **Start Date** / **Start Time** / **End Date** / **End Time** fields (multi-day/overnight supported)
- Datetime values interpreted in tenant timezone (Asia/Jakarta) via `toIsoFromTenantParts`; conflict display uses `formatDateTime`
- Validation: all four datetime fields required; end must be strictly after start; driver must be a known user when selected
- Conflict detection uses full datetime intervals (`overlaps(start, end, bStart, bEnd)`)
- `onCreateBooking` signature extended with optional `driverId`/`driverName`, passed through to `provider.createBooking`
- `Asset` type gained optional `groupIds`; `Booking` type gained `driver_id`/`driver_name`/`approver_id`/`approval_remarks`/`updated_at`
- NewBooking call site passes `users={users}`

**onCreateBooking handler:** accepts and forwards `driverId`/`driverName` to the provider; audit snapshot includes driver/datetime fields.

## Design Decisions

- **Driver is optional:** leaving it unselected stores `assignedDriverUserId: null`. The dropdown defaults to "Auto-resolve from asset" (picks the first eligible driver sharing a group with the asset; falls back to the first eligible driver; clears if none). A "Clear" button resets to auto-resolve.
- **No new asset/driver fields invented:** driver persistence reuses the existing `OpexBooking.assignedDriverUserId` field. `driverName` is resolved on read via the user map, not stored separately.
- **Multi-day/overnight:** start and end dates are independent; end date may be after start date. Validation only requires `end > start`.
- **Timezone:** date/time inputs are interpreted in the tenant timezone (Asia/Jakarta, UTC+7) to avoid browser-local ambiguity. Existing `parseISO(b.start_at)` for conflict comparison continues to work on stored UTC ISO strings.

## Tests
New file: `apps/web/test/bookingDriverDatetime.test.mjs` — 8 tests:
1. Tenant timezone Asia/Jakarta WIB UTC+7 interpretation (08:00 local → 01:00 UTC)
2. Create booking with no driver (driver_id null)
3. Create booking with explicit driver persisted + audit snapshot includes driverId/driverName
4. Multi-day overnight booking (18:00 → next day 06:00, 12-hour interval)
5. Local provider permits overlapping bookings (no server-side conflict check); conflict prevention at UI + AddInData provider
6. `diffRelevantFields` captures driverId/endAt/status changes, ignores unchanged fields
7. AddInData provider `createBooking` accepts and serializes driverId
8. `snapshotBooking` includes driverId/driverName from a created booking

All 8 new tests pass; all 77 pre-existing tests continue to pass (85 total, 0 failures).

## Verification
- `npx tsc -b` (apps/web): clean, no errors
- `node --test test/*.mjs` (apps/web): 85/85 pass
- Safety constraints preserved: no tenant writes, no commits/pushes/deploys, existing uncommitted baseline untouched

## Related Files
- `apps/web/src/ui/App.tsx` — NewBooking component + onCreateBooking handler
- `apps/web/src/data/types.ts` — ResolvedBooking, ResolvedUser, BookingDataProvider
- `apps/web/src/data/dataProvider.ts` — LocalBookingDataProvider
- `apps/web/src/data/addinDataProvider.ts` — AddInDataBookingDataProvider
- `apps/web/src/audit/auditTrail.ts` — snapshotBooking, diffRelevantFields
- `apps/web/src/config/tenantTimezone.ts` — tenant timezone helpers (new)
- `apps/web/test/bookingDriverDatetime.test.mjs` — new tests (new)
- `docs/PHASE_16.4.6.2A.9_BOOKING_DRIVER_DATETIME_REPORT.md` — this report
