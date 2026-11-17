import test from "node:test";
import assert from "node:assert/strict";
import { validateBooking, validateResolvedBooking } from "../src/data/bookingValidation.ts";

/*───────────────────── validateBooking ─────────────────────*/

test("validateBooking: all fields present → VALID", () => {
  const result = validateBooking({
    id: "b001",
    deviceId: "dev-001",
    requesterUserId: "u101",
    requestedClass: "PASSENGER",
    startAt: "2026-11-16T08:00:00.000Z",
    endAt: "2026-11-16T17:00:00.000Z",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 30,
    purpose: "Trip",
    destination: "Site A",
    passengerCount: 2,
    status: "PENDING_APPROVAL",
    assignedDriverUserId: null,
    approverId: null,
    approvalRemarks: null,
    createdAt: "2026-11-16T08:00:00.000Z",
    updatedAt: "2026-11-16T08:00:00.000Z",
    version: 1,
  });
  assert.equal(result.quality, "VALID");
  assert.deepEqual(result.issues, []);
});

test("validateBooking: missing deviceId → MISSING_ASSET", () => {
  const result = validateBooking({
    id: "b001",
    deviceId: null,
    requesterUserId: "u101",
    requestedClass: "PASSENGER",
    startAt: "2026-11-16T08:00:00.000Z",
    endAt: "2026-11-16T17:00:00.000Z",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 30,
    purpose: "Trip",
    destination: "Site A",
    passengerCount: 2,
    status: "PENDING_APPROVAL",
    assignedDriverUserId: null,
    approverId: null,
    approvalRemarks: null,
    createdAt: "2026-11-16T08:00:00.000Z",
    updatedAt: "2026-11-16T08:00:00.000Z",
    version: 1,
  });
  assert.equal(result.quality, "MISSING_ASSET");
  assert.ok(result.issues.includes("MISSING_ASSET"));
});

test("validateBooking: missing requesterUserId → MISSING_REQUESTER", () => {
  const result = validateBooking({
    id: "b001",
    deviceId: "dev-001",
    requesterUserId: null,
    requestedClass: "PASSENGER",
    startAt: "2026-11-16T08:00:00.000Z",
    endAt: "2026-11-16T17:00:00.000Z",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 30,
    purpose: "Trip",
    destination: "Site A",
    passengerCount: 2,
    status: "PENDING_APPROVAL",
    assignedDriverUserId: null,
    approverId: null,
    approvalRemarks: null,
    createdAt: "2026-11-16T08:00:00.000Z",
    updatedAt: "2026-11-16T08:00:00.000Z",
    version: 1,
  });
  assert.equal(result.quality, "MISSING_REQUESTER");
  assert.ok(result.issues.includes("MISSING_REQUESTER"));
});

test("validateBooking: missing status → MISSING_STATUS", () => {
  const result = validateBooking({
    id: "b001",
    deviceId: "dev-001",
    requesterUserId: "u101",
    requestedClass: "PASSENGER",
    startAt: "2026-11-16T08:00:00.000Z",
    endAt: "2026-11-16T17:00:00.000Z",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 30,
    purpose: "Trip",
    destination: "Site A",
    passengerCount: 2,
    status: null,
    assignedDriverUserId: null,
    approverId: null,
    approvalRemarks: null,
    createdAt: "2026-11-16T08:00:00.000Z",
    updatedAt: "2026-11-16T08:00:00.000Z",
    version: 1,
  });
  assert.equal(result.quality, "MISSING_STATUS");
  assert.ok(result.issues.includes("MISSING_STATUS"));
});

test("validateBooking: invalid startAt → INVALID_DATETIME", () => {
  const result = validateBooking({
    id: "b001",
    deviceId: "dev-001",
    requesterUserId: "u101",
    requestedClass: "PASSENGER",
    startAt: null,
    endAt: "2026-11-16T17:00:00.000Z",
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 30,
    purpose: "Trip",
    destination: "Site A",
    passengerCount: 2,
    status: "PENDING_APPROVAL",
    assignedDriverUserId: null,
    approverId: null,
    approvalRemarks: null,
    createdAt: "2026-11-16T08:00:00.000Z",
    updatedAt: "2026-11-16T08:00:00.000Z",
    version: 1,
  });
  assert.equal(result.quality, "INVALID_DATETIME");
  assert.ok(result.issues.includes("INVALID_DATETIME"));
});

test("validateBooking: multiple issues → MULTIPLE_VALIDATION_ERRORS", () => {
  const result = validateBooking({
    id: "b001",
    deviceId: null,
    requesterUserId: null,
    requestedClass: "PASSENGER",
    startAt: null,
    endAt: null,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 30,
    purpose: "Trip",
    destination: "Site A",
    passengerCount: 2,
    status: null,
    assignedDriverUserId: null,
    approverId: null,
    approvalRemarks: null,
    createdAt: "2026-11-16T08:00:00.000Z",
    updatedAt: "2026-11-16T08:00:00.000Z",
    version: 1,
  });
  assert.equal(result.quality, "MULTIPLE_VALIDATION_ERRORS");
  assert.ok(result.issues.includes("MISSING_ASSET"));
  assert.ok(result.issues.includes("MISSING_REQUESTER"));
  assert.ok(result.issues.includes("MISSING_STATUS"));
  assert.ok(result.issues.includes("INVALID_DATETIME"));
});

/*───────────────────── validateResolvedBooking ─────────────────────*/

test("validateResolvedBooking: all fields present → VALID", () => {
  const result = validateResolvedBooking({
    asset_id: "dev-001",
    requester_id: "u101",
    status: "PENDING_APPROVAL",
    start_at: "2026-11-16T08:00:00.000Z",
    end_at: "2026-11-16T17:00:00.000Z",
  });
  assert.equal(result.quality, "VALID");
  assert.deepEqual(result.issues, []);
});

test("validateResolvedBooking: missing asset_id → MISSING_ASSET", () => {
  const result = validateResolvedBooking({
    asset_id: null,
    requester_id: "u101",
    status: "PENDING_APPROVAL",
    start_at: "2026-11-16T08:00:00.000Z",
    end_at: "2026-11-16T17:00:00.000Z",
  });
  assert.equal(result.quality, "MISSING_ASSET");
});

test("validateResolvedBooking: empty status → MISSING_STATUS", () => {
  const result = validateResolvedBooking({
    asset_id: "dev-001",
    requester_id: "u101",
    status: "",
    start_at: "2026-11-16T08:00:00.000Z",
    end_at: "2026-11-16T17:00:00.000Z",
  });
  assert.equal(result.quality, "MISSING_STATUS");
});
