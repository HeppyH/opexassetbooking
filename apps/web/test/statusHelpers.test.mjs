import test from "node:test";
import assert from "node:assert/strict";
import { formatStatusLabel, statusClassKey } from "../src/ui/statusHelpers.ts";

test("formatStatusLabel: undefined returns safe placeholder", () => {
  assert.equal(formatStatusLabel(undefined), "—");
});

test("formatStatusLabel: null returns safe placeholder", () => {
  assert.equal(formatStatusLabel(null), "—");
});

test("formatStatusLabel: empty string returns safe placeholder", () => {
  assert.equal(formatStatusLabel(""), "—");
});

test("formatStatusLabel: valid string converts underscores to spaces", () => {
  assert.equal(formatStatusLabel("PENDING_APPROVAL"), "PENDING APPROVAL");
  assert.equal(formatStatusLabel("APPROVED"), "APPROVED");
  assert.equal(formatStatusLabel("VEHICLE_ASSIGNED"), "VEHICLE ASSIGNED");
  assert.equal(formatStatusLabel("BOOKING_CREATED"), "BOOKING CREATED");
});

test("formatStatusLabel: does not throw on any typed input", () => {
  const inputs = [undefined, null, "", "PENDING_APPROVAL", "APPROVED"];
  for (const input of inputs) {
    assert.doesNotThrow(() => formatStatusLabel(input));
  }
});

test("statusClassKey: undefined returns neutral class", () => {
  assert.equal(statusClassKey(undefined), "badge-completed");
});

test("statusClassKey: null returns neutral class", () => {
  assert.equal(statusClassKey(null), "badge-completed");
});

test("statusClassKey: empty string returns neutral class", () => {
  assert.equal(statusClassKey(""), "badge-completed");
});

test("statusClassKey: valid known status returns mapped class", () => {
  assert.equal(statusClassKey("PENDING_APPROVAL"), "badge-pending");
  assert.equal(statusClassKey("APPROVED"), "badge-approved");
  assert.equal(statusClassKey("ASSIGNED"), "badge-assigned");
  assert.equal(statusClassKey("COMPLETED"), "badge-completed");
  assert.equal(statusClassKey("REJECTED"), "badge-rejected");
  assert.equal(statusClassKey("CANCELLED"), "badge-cancelled");
});

test("statusClassKey: unknown status returns neutral class without throwing", () => {
  assert.equal(statusClassKey("UNKNOWN_STATUS"), "badge-completed");
  assert.doesNotThrow(() => statusClassKey("UNKNOWN_STATUS"));
});
