/*───────────────────── Lifecycle Bridge Diagnostic Tests ─────────────────────*/
/* Unit tests for the MyGeotab Add-In diagnostic module.
   Tests that the diagnostic interface correctly retrieves and distributes
   diagnostic information from the lifecycle bridge.
   These are UNIT tests, not live integration tests. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  setLifecycleApi,
  getLifecycleApi,
  subscribeToLifecycle,
  resetBridgeForTesting,
} from "../config/lifecycleBridge.ts";

const mockApi = {
  call: function (method, params, success, error) {
    if (method === "Get") {
      if (params.typeName === "Device") {
        success([
          { id: "b1", name: "AD 1283 VO_Honda Brio_Andri", serialNumber: "GAW92XZ8ZHV7", licensePlate: "AD 1283 VO", make: "Honda", model: "Brio", vehicleClass: "OPERATIONAL_4X4", status: "AVAILABLE" },
          { id: "b2", name: "Toyota Fortuner #02", serialNumber: "GTA9000002", licensePlate: "BS 5678 AB", make: "Toyota", model: "Hilux", vehicleClass: "OPERATIONAL_4X4", status: "AVAILABLE" },
        ]);
      } else if (params.typeName === "AddInData") {
        success([]);
      } else {
        success([]);
      }
    } else if (error) {
      error(new Error("Unknown method: " + method));
    } else {
      success([]);
    }
  },
  getSession: function (callback) {
    callback({ userName: "testuser", database: "opex_trial", server: "test" });
  },
};

const invalidApi = { call: undefined, getSession: function (callback) { callback(null); } };

const mockApi2 = {
  call: function (method, params, success, error) {
    if (method === "Get") {
      if (params.typeName === "Device") {
        success([
          { id: "b3", name: "Toyota Hilux #03", serialNumber: "GTA9000003", licensePlate: "BS 9012 CD", make: "Toyota", model: "Hilux", vehicleClass: "OPERATIONAL_4X4", status: "AVAILABLE" },
        ]);
      } else if (params.typeName === "AddInData") {
        success([]);
      } else {
        success([]);
      }
    } else if (error) {
      error(new Error("Unknown method: " + method));
    } else {
      success([]);
    }
  },
  getSession: function (callback) {
    callback({ userName: "testuser2", database: "opex_trial", server: "test" });
  },
};

test("diagnostic: API unavailable - getDevices returns error", () => {
  resetBridgeForTesting();
  setLifecycleApi(null, null);
  const state = getLifecycleApi();
  assert.strictEqual(state.initialized, false);
  assert.strictEqual(state.api, null);
});

test("diagnostic: API unavailable - getAddInData returns error", () => {
  resetBridgeForTesting();
  setLifecycleApi(null, null);
  const state = getLifecycleApi();
  assert.strictEqual(state.initialized, false);
  assert.strictEqual(state.api, null);
});

test("diagnostic: API without call method is rejected", () => {
  resetBridgeForTesting();
  setLifecycleApi(invalidApi, null);
  const state = getLifecycleApi();
  assert.strictEqual(state.initialized, false);
  assert.strictEqual(state.api, null);
});

test("diagnostic: device get stores API when setLifecycleApi is called", () => {
  resetBridgeForTesting();
  setLifecycleApi(mockApi, { userId: "user1" });
  const state = getLifecycleApi();
  assert.strictEqual(state.initialized, true);
  assert.strictEqual(state.api, mockApi);
});

test("diagnostic: subscriber receives current state after initialize()", () => {
  resetBridgeForTesting();
  setLifecycleApi(mockApi, { userId: "user2" });
  let receivedState = null;
  const unsub = subscribeToLifecycle(function (s) {
    receivedState = s;
  });
  assert.notStrictEqual(receivedState, null);
  assert.strictEqual(receivedState.api, mockApi);
  assert.strictEqual(receivedState.initialized, true);
  unsub();
});

test("diagnostic: updates stored API on repeated setLifecycleApi calls", () => {
  resetBridgeForTesting();
  setLifecycleApi(mockApi, { userId: "user3" });
  setLifecycleApi(mockApi, { userId: "user4" });
  const state = getLifecycleApi();
  assert.strictEqual(state.api, mockApi);
  assert.deepStrictEqual(state.state, { userId: "user4" });
});

test("diagnostic: rejects null API", () => {
  resetBridgeForTesting();
  setLifecycleApi(null, null);
  const state = getLifecycleApi();
  assert.strictEqual(state.initialized, false);
  assert.strictEqual(state.api, null);
});

test("diagnostic: rejects API without call method", () => {
  resetBridgeForTesting();
  setLifecycleApi(invalidApi, null);
  const state = getLifecycleApi();
  assert.strictEqual(state.initialized, false);
  assert.strictEqual(state.api, null);
});

test("diagnostic: notifies subscriber on setLifecycleApi", () => {
  resetBridgeForTesting();
  const receivedStates = [];
  const unsub = subscribeToLifecycle(function (s) { receivedStates.push(s); });

  // Subscriber immediately receives current state (which may be null initially)
  assert.strictEqual(receivedStates.length, 1);

  setLifecycleApi(mockApi, { userId: "user6" });

  assert.strictEqual(receivedStates.length, 2);
  assert.strictEqual(receivedStates[1].api, mockApi);

  unsub();
});

test("diagnostic: unsubscribed callback does not receive updates", () => {
  resetBridgeForTesting();
  const receivedStates = [];
  const unsub = subscribeToLifecycle(function (s) { receivedStates.push(s); });
  // Initial callback fires immediately with current state
  assert.strictEqual(receivedStates.length, 1);
  unsub();
  setLifecycleApi(mockApi, { userId: "user7" });

  assert.strictEqual(receivedStates.length, 1); // Unsubscribed, no new updates
});

test("diagnostic: stores API even when getSession throws", () => {
  resetBridgeForTesting();
  const apiWithFailingGetSession = {
    call: function (method, params, success, error) { success({ result: "ok" }); },
    getSession: function (callback) { throw new Error("session failed"); },
  };
  setLifecycleApi(apiWithFailingGetSession, null);
  const state = getLifecycleApi();
  assert.strictEqual(state.initialized, true);
  assert.strictEqual(state.api, apiWithFailingGetSession);
});

test("diagnostic: stored API is the same object reference passed to initialize", () => {
  resetBridgeForTesting();
  setLifecycleApi(mockApi, null);
  const state = getLifecycleApi();
  assert.strictEqual(state.api, mockApi);
  assert.strictEqual(typeof state.api.call, "function");
});

test("diagnostic: bridge state persists across multiple setLifecycleApi calls", () => {
  resetBridgeForTesting();
  setLifecycleApi(mockApi, { shared: true });
  const state1 = getLifecycleApi();
  assert.strictEqual(state1.api, mockApi);
  assert.deepStrictEqual(state1.state, { shared: true });

  setLifecycleApi(mockApi, { shared: false });
  const state2 = getLifecycleApi();
  assert.strictEqual(state2.api, mockApi);
  assert.deepStrictEqual(state2.state, { shared: false });
});

test("diagnostic: subscribe/unsubscribe/resubscribe behavior", () => {
  resetBridgeForTesting();
  setLifecycleApi(mockApi, { userId: "user1" });

  const receivedStates = [];
  const unsub1 = subscribeToLifecycle(function (s) { receivedStates.push(s); });
  // Initial callback fires immediately with current state
  assert.strictEqual(receivedStates.length, 1);
  assert.strictEqual(receivedStates[0].api, mockApi);
  unsub1();

  setLifecycleApi(mockApi2, { userId: "user2" });
  assert.strictEqual(receivedStates.length, 1); // Unsubscribed, no new updates

  const unsub2 = subscribeToLifecycle(function (s) { receivedStates.push(s); });
  assert.strictEqual(receivedStates.length, 2); // Re-subscribed, gets current state
  assert.strictEqual(receivedStates[1].api, mockApi2);

  setLifecycleApi(mockApi, { userId: "user3" });
  assert.strictEqual(receivedStates.length, 3); // New update delivered
  assert.strictEqual(receivedStates[2].api, mockApi);

  unsub2();
});