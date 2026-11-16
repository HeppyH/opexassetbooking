import test from "node:test";
import assert from "node:assert/strict";
import { emitAuditEvent, snapshotBooking, diffRelevantFields, resetAuditDedupForTests } from "../src/audit/auditTrail.ts";

function makeProvider(overrides = {}) {
  const calls = [];
  return {
    calls,
    isLive: () => false,
    async createAuditRecord(input) {
      calls.push(input);
      if (overrides.fail) throw new Error(overrides.fail);
    },
    ...overrides,
  };
}

const booking = {
  id: "b1",
  requester_id: "u1",
  requester_name: "User",
  requested_class: "PASSENGER",
  asset_id: "a1",
  asset_code: "VEH-001",
  asset_name: "Car",
  registration_no: "ABC",
  start_at: "2026-11-16T08:00:00.000Z",
  end_at: "2026-11-16T09:00:00.000Z",
  buffer_before_minutes: 0,
  buffer_after_minutes: 30,
  purpose: "Trip",
  destination: "Site A",
  passenger_count: null,
  status: "PENDING_APPROVAL",
  approver_id: null,
  approval_remarks: null,
  version: 1,
  created_at: "2026-11-16T07:00:00.000Z",
  updated_at: "2026-11-16T07:00:00.000Z",
};

test.beforeEach(() => resetAuditDedupForTests());

test("emitAuditEvent records BOOKING_CREATED with correct actor and values", async () => {
  const p = makeProvider();
  const res = await emitAuditEvent({
    mode: "DEMO",
    provider: p,
    entityId: "b1",
    action: "BOOKING_CREATED",
    actorUserId: "demo-user",
    previousStatus: null,
    newStatus: "PENDING_APPROVAL",
    previous: null,
    next: snapshotBooking(booking),
    idempotencyKey: "k1",
  });
  assert.equal(res.ok, true);
  assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].booking_id, "b1");
  assert.equal(p.calls[0].action, "BOOKING_CREATED");
  assert.equal(p.calls[0].actor_user_id, "demo-user");
  assert.equal(p.calls[0].previous_status, null);
  assert.equal(p.calls[0].new_status, "PENDING_APPROVAL");
  const details = JSON.parse(p.calls[0].details);
  assert.equal(details.entityType, "BOOKING");
  assert.equal(details.mode, "DEMO");
  assert.equal(details.new.destination, "Site A");
  assert.equal(details.new.purpose, "Trip");
});

test("emitAuditEvent supports all required action types", async () => {
  const actions = [
    "BOOKING_CREATED","BOOKING_UPDATED","BOOKING_APPROVED","BOOKING_REJECTED",
    "VEHICLE_ASSIGNED","DRIVER_ASSIGNED","BOOKING_COMPLETED","BOOKING_CANCELLED",
  ];
  for (const action of actions) {
    resetAuditDedupForTests();
    const p = makeProvider();
    const res = await emitAuditEvent({ mode: "DEMO", provider: p, entityId: "b1", action, actorUserId: "u1", idempotencyKey: action });
    assert.equal(res.ok, true, action);
    assert.equal(p.calls[0].action, action);
  }
});

test("deduplicates same logical action by idempotency key", async () => {
  const p = makeProvider();
  const input = { mode: "DEMO", provider: p, entityId: "b1", action: "BOOKING_APPROVED", actorUserId: "u1", idempotencyKey: "same" };
  const r1 = await emitAuditEvent(input);
  const r2 = await emitAuditEvent(input);
  assert.equal(r1.ok, true);
  assert.equal(r2.ok, true);
  assert.equal(r2.deduped, true);
  assert.equal(p.calls.length, 1);
});

test("reports audit persistence failure without throwing", async () => {
  const p = makeProvider({ fail: "ADDIN_WRITE_FAILED" });
  const res = await emitAuditEvent({ mode: "ADDIN_DATA", provider: p, entityId: "b1", action: "BOOKING_APPROVED", actorUserId: "live-user", idempotencyKey: "f1" });
  assert.equal(res.ok, false);
  assert.match(res.error, /ADDIN_WRITE_FAILED/);
});

test("fails when provider cannot persist audit", async () => {
  const res = await emitAuditEvent({ mode: "DEMO", provider: { isLive: () => false }, entityId: "b1", action: "BOOKING_CREATED", actorUserId: "u1" });
  assert.equal(res.ok, false);
  assert.equal(res.error, "AUDIT_PROVIDER_UNAVAILABLE");
});

test("diff captures date/time, destination, purpose, vehicle and driver changes", () => {
  const prev = { status: "APPROVED", startAt: "2026-11-16T08:00:00Z", endAt: "2026-11-16T09:00:00Z", destination: "A", purpose: "P1", assetId: "v1", driverId: null };
  const next = { status: "ASSIGNED", startAt: "2026-11-16T10:00:00Z", endAt: "2026-11-16T11:00:00Z", destination: "B", purpose: "P2", assetId: "v2", driverId: "d1" };
  const diff = diffRelevantFields(prev, next);
  assert.ok(diff.status && diff.startAt && diff.endAt && diff.destination && diff.purpose && diff.assetId && diff.driverId);
  assert.equal(diff.destination.previous, "A");
  assert.equal(diff.destination.next, "B");
  assert.equal(diff.driverId.next, "d1");
});

test("LIVE actor attribution preserved in audit record", async () => {
  const p = makeProvider();
  await emitAuditEvent({ mode: "ADDIN_DATA", provider: p, entityId: "b1", action: "BOOKING_APPROVED", actorUserId: "verified-live-principal", previousStatus: "PENDING_APPROVAL", newStatus: "APPROVED", idempotencyKey: "live1" });
  assert.equal(p.calls[0].actor_user_id, "verified-live-principal");
  assert.equal(JSON.parse(p.calls[0].details).mode, "ADDIN_DATA");
});

test("DEMO actor attribution preserved and isolated by mode marker", async () => {
  const p = makeProvider();
  await emitAuditEvent({ mode: "DEMO", provider: p, entityId: "b1", action: "BOOKING_CANCELLED", actorUserId: "demo-actor", previousStatus: "APPROVED", newStatus: "CANCELLED", idempotencyKey: "demo1" });
  assert.equal(p.calls[0].actor_user_id, "demo-actor");
  assert.equal(JSON.parse(p.calls[0].details).mode, "DEMO");
});

test("snapshotBooking maps relevant booking fields", () => {
  const snap = snapshotBooking(booking);
  assert.equal(snap.status, "PENDING_APPROVAL");
  assert.equal(snap.startAt, booking.start_at);
  assert.equal(snap.endAt, booking.end_at);
  assert.equal(snap.destination, "Site A");
  assert.equal(snap.purpose, "Trip");
  assert.equal(snap.assetId, "a1");
});
