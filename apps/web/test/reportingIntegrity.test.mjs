import test from "node:test";
import assert from "node:assert/strict";
import { validateResolvedBooking } from "../src/data/bookingValidation.ts";

/*───────────────────── Booking Reports integrity ─────────────────────*/

function classifyBookings(bookings) {
  const validationResults = bookings.map(b => validateResolvedBooking(b));
  const validBookings = bookings.filter((_, i) => validationResults[i].quality === "VALID");
  const invalidBookings = bookings.filter((_, i) => validationResults[i].quality !== "VALID");
  return { validBookings, invalidBookings, validationResults };
}

test("reporting: valid bookings separated from invalid", () => {
  const bookings = [
    { asset_id: "dev-001", requester_id: "u101", status: "PENDING_APPROVAL", start_at: "2026-11-16T08:00:00.000Z", end_at: "2026-11-16T17:00:00.000Z" },
    { asset_id: null, requester_id: "u101", status: "PENDING_APPROVAL", start_at: "2026-11-16T08:00:00.000Z", end_at: "2026-11-16T17:00:00.000Z" },
    { asset_id: "dev-001", requester_id: "u101", status: null, start_at: "2026-11-16T08:00:00.000Z", end_at: "2026-11-16T17:00:00.000Z" },
    { asset_id: "dev-001", requester_id: "u101", status: "PENDING_APPROVAL", start_at: null, end_at: "2026-11-16T17:00:00.000Z" },
  ];
  const { validBookings, invalidBookings } = classifyBookings(bookings);
  assert.equal(validBookings.length, 1);
  assert.equal(invalidBookings.length, 3);
});

test("reporting: undefined status classified as data-quality issue", () => {
  const bookings = [
    { asset_id: "dev-001", requester_id: "u101", status: undefined, start_at: "2026-11-16T08:00:00.000Z", end_at: "2026-11-16T17:00:00.000Z" },
  ];
  const { validBookings, invalidBookings } = classifyBookings(bookings);
  assert.equal(validBookings.length, 0);
  assert.equal(invalidBookings.length, 1);
  assert.equal(invalidBookings[0].status, undefined);
});

test("reporting: invalid asset does not count as valid utilization", () => {
  const bookings = [
    { asset_id: "dev-001", requester_id: "u101", status: "PENDING_APPROVAL", start_at: "2026-11-16T08:00:00.000Z", end_at: "2026-11-16T17:00:00.000Z" },
    { asset_id: null, requester_id: "u101", status: "PENDING_APPROVAL", start_at: "2026-11-16T08:00:00.000Z", end_at: "2026-11-16T17:00:00.000Z" },
    { asset_id: null, requester_id: "u102", status: "APPROVED", start_at: "2026-11-16T08:00:00.000Z", end_at: "2026-11-16T17:00:00.000Z" },
  ];
  const { validBookings } = classifyBookings(bookings);
  const assetsWithBookings = new Set(validBookings.filter(b => b.asset_id).map(b => b.asset_id)).size;
  assert.equal(assetsWithBookings, 1); // Only dev-001 counts, not null
});

test("reporting: empty dataset does not crash", () => {
  const bookings = [];
  const { validBookings, invalidBookings } = classifyBookings(bookings);
  assert.equal(validBookings.length, 0);
  assert.equal(invalidBookings.length, 0);
});

test("reporting: valid booking statuses aggregated correctly", () => {
  const bookings = [
    { asset_id: "dev-001", requester_id: "u101", status: "PENDING_APPROVAL", start_at: "2026-11-16T08:00:00.000Z", end_at: "2026-11-16T17:00:00.000Z" },
    { asset_id: "dev-001", requester_id: "u101", status: "PENDING_APPROVAL", start_at: "2026-11-16T08:00:00.000Z", end_at: "2026-11-16T17:00:00.000Z" },
    { asset_id: "dev-002", requester_id: "u101", status: "APPROVED", start_at: "2026-11-16T08:00:00.000Z", end_at: "2026-11-16T17:00:00.000Z" },
  ];
  const { validBookings } = classifyBookings(bookings);
  const byStatus = validBookings.reduce((acc, b) => { acc[b.status] = (acc[b.status] || 0) + 1; return acc; }, {});
  assert.equal(byStatus["PENDING_APPROVAL"], 2);
  assert.equal(byStatus["APPROVED"], 1);
  assert.ok(!("undefined" in byStatus));
});
