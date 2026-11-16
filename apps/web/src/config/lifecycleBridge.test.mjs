/*───────────────────── Lifecycle Bridge Tests ─────────────────────*/
/* Unit tests for the MyGeotab Add-In lifecycle bridge.
   Tests that the bridge correctly stores and distributes the API object
   received from initialize(), even when React mounts before or after
   initialize() is called. These are UNIT tests, not live integration tests. */

import test from "node:test";
import assert from "node:assert/strict";
import {
  setLifecycleApi,
  getLifecycleApi,
  subscribeToLifecycle,
  resetBridgeForTesting,
} from "../config/lifecycleBridge.ts";

const mockApi = {
  call: (method, params, success, error) => { success({ result: "ok" }); },
  getSession: (callback) => { callback({ userName: "testuser", database: "opex_trial", server: "test" }); },
  multiCall: (params, success, error) => { success({ results: [] }); },
};

const mockApi2 = {
  call: (method, params, success, error) => { success({ result: "ok" }); },
  getSession: (callback) => { callback({ userName: "testuser2", database: "opex_trial", server: "test" }); },
  multiCall: (params, success, error) => { success({ results: [] }); },
};

const invalidApi = { call: undefined, getSession: (callback) => callback(null) };

test("lifecycleBridge: stores API when setLifecycleApi is called", () => {
  resetBridgeForTesting();
  setLifecycleApi(mockApi, { userId: "user1" });
  const state = getLifecycleApi();
  assert.strictEqual(state.initialized, true);
  assert.strictEqual(state.api, mockApi);
  assert.deepStrictEqual(state.state, { userId: "user1" });
});

test("lifecycleBridge: subscriber receives current state after initialize()", () => {
  resetBridgeForTesting();
  setLifecycleApi(mockApi, { userId: "user2" });
  let receivedState = null;
  const unsub = subscribeToLifecycle((s) => {
    receivedState = s;
  });
  assert.notStrictEqual(receivedState, null);
  assert.strictEqual(receivedState.api, mockApi);
  assert.strictEqual(receivedState.initialized, true);
  unsub();
});

test("lifecycleBridge: updates stored API on repeated setLifecycleApi calls", () => {
  resetBridgeForTesting();
  setLifecycleApi(mockApi, { userId: "user3" });
  setLifecycleApi(mockApi2, { userId: "user4" });
  const state = getLifecycleApi();
  assert.strictEqual(state.api, mockApi2);
  assert.deepStrictEqual(state.state, { userId: "user4" });
});

test("lifecycleBridge: rejects null API", () => {
  resetBridgeForTesting();
  setLifecycleApi(null, null);
  const state = getLifecycleApi();
  assert.strictEqual(state.initialized, false);
  assert.strictEqual(state.api, null);
});

test("lifecycleBridge: rejects API without callable call method", () => {
  resetBridgeForTesting();
  setLifecycleApi(invalidApi, { userId: "user5" });
  const state = getLifecycleApi();
  assert.strictEqual(state.initialized, false);
  assert.strictEqual(state.api, null);
});

test("lifecycleBridge: stores API even when getSession throws", () => {
  resetBridgeForTesting();
  const apiWithFailingGetSession = {
    call: (method, params, success, error) => { success({ result: "ok" }); },
    getSession: (callback) => { throw new Error("session failed"); },
  };
  setLifecycleApi(apiWithFailingGetSession, null);
  const state = getLifecycleApi();
  assert.strictEqual(state.initialized, true);
  assert.strictEqual(state.api, apiWithFailingGetSession);
});

test("lifecycleBridge: stored API is the same object reference passed to initialize", () => {
  resetBridgeForTesting();
  setLifecycleApi(mockApi, null);
  const state = getLifecycleApi();
  assert.strictEqual(state.api, mockApi);
  assert.strictEqual(typeof state.api.call, "function");
});

test("lifecycleBridge: bridge state persists across multiple setLifecycleApi calls", () => {
  resetBridgeForTesting();
  setLifecycleApi(mockApi, { shared: true });
  const state1 = getLifecycleApi();
  assert.strictEqual(state1.api, mockApi);
  assert.deepStrictEqual(state1.state, { shared: true });

  setLifecycleApi(mockApi2, { shared: false });
  const state2 = getLifecycleApi();
  assert.strictEqual(state2.api, mockApi2);
  assert.deepStrictEqual(state2.state, { shared: false });
});