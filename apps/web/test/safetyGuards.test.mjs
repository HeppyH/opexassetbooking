import test from "node:test";
import assert from "node:assert/strict";
import {
  canRunDemoOnlyOperation,
  assertDemoOnlyOperation,
  assertProviderNotLiveForDemoOperation,
  getStateResetOnModeSwitch,
  isKnownMode,
  normalizeModeStrict,
} from "../src/safety/modeGuards.ts";
import { canPerformLiveWrite, getActorIdForMode } from "../src/auth/identityResolver.ts";

test("demo-only operations allowed only in DEMO mode", () => {
  assert.equal(canRunDemoOnlyOperation("DEMO"), true);
  assert.equal(canRunDemoOnlyOperation("ADDIN_DATA"), false);
  assert.equal(canRunDemoOnlyOperation(undefined), false);
  assert.equal(canRunDemoOnlyOperation(null), false);
  assert.doesNotThrow(() => assertDemoOnlyOperation("DEMO", "Demo reset"));
  assert.throws(() => assertDemoOnlyOperation("ADDIN_DATA", "Demo reset"), /only in DEMO mode/);
  assert.throws(() => assertDemoOnlyOperation("SOMETHING_ELSE", "Demo seed"), /only in DEMO mode/);
});

test("demo reset/seed blocked in LIVE and ambiguous modes (fail closed)", () => {
  for (const mode of ["ADDIN_DATA", "", "demo", "LIVE", null, undefined]) {
    assert.equal(canRunDemoOnlyOperation(mode), false);
  }
});

test("provider leakage: demo-only operation cannot use live provider", () => {
  const live = { isLive: () => true };
  const demo = { isLive: () => false };
  assert.throws(() => assertProviderNotLiveForDemoOperation(live, "Demo reset"), /live provider/);
  assert.doesNotThrow(() => assertProviderNotLiveForDemoOperation(demo, "Demo reset"));
  assert.throws(() => assertProviderNotLiveForDemoOperation(null, "Demo reset"), /provider not initialized/);
});

test("mode switch clears stale actor/notification/pending state shape", () => {
  const reset = getStateResetOnModeSwitch();
  assert.deepEqual(reset.notifications, []);
  assert.equal(reset.unreadCount, 0);
  assert.equal(reset.notificationDropdownOpen, false);
  assert.equal(reset.selectedBooking, null);
  assert.equal(reset.rejectingId, null);
  assert.deepEqual(reset.rejectReason, {});
  assert.equal(reset.message, null);
});

test("no stale actor after mode switching (actor selection helpers)", () => {
  const authenticated = { status: "authenticated", principal: { id: "live-u1", name: "Live", roles: ["EMPLOYEE"], session: {} }, session: {} };
  assert.equal(getActorIdForMode("ADDIN_DATA", authenticated, "demo-u1"), "live-u1");
  assert.equal(getActorIdForMode("DEMO", authenticated, "demo-u1"), "demo-u1");
  assert.equal(getActorIdForMode("ADDIN_DATA", { status: "unresolved", reason: "x" }, "demo-u1"), null);
});

test("no stale notification actor after mode switching: unresolved LIVE yields no actor id", () => {
  const unresolved = { status: "unresolved", reason: "not verified" };
  assert.equal(getActorIdForMode("ADDIN_DATA", unresolved, "demo-old"), null);
  assert.equal(getActorIdForMode("ADDIN_DATA", null, "demo-old"), null);
});

test("LIVE writes blocked with unresolved/ambiguous identity (fail closed)", () => {
  assert.equal(canPerformLiveWrite("ADDIN_DATA", null), false);
  assert.equal(canPerformLiveWrite("ADDIN_DATA", { status: "loading" }), false);
  assert.equal(canPerformLiveWrite("ADDIN_DATA", { status: "unresolved", reason: "x" }), false);
  assert.equal(canPerformLiveWrite("ADDIN_DATA", { status: "error", reason: "x" }), false);
  assert.equal(canPerformLiveWrite("ADDIN_DATA", { status: "authenticated", principal: { id: "u", name: "n", roles: [], session: {} }, session: {} }), true);
  assert.equal(canPerformLiveWrite("DEMO", null), true);
});

test("mode normalization is fail-closed for ambiguous values", () => {
  assert.equal(isKnownMode("DEMO"), true);
  assert.equal(isKnownMode("ADDIN_DATA"), true);
  assert.equal(isKnownMode("LIVE"), false);
  assert.equal(normalizeModeStrict("DEMO"), "DEMO");
  assert.equal(normalizeModeStrict("ADDIN_DATA"), "ADDIN_DATA");
  assert.equal(normalizeModeStrict("live"), null);
  assert.equal(normalizeModeStrict(undefined), null);
});
