import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveAuthenticatedPrincipal,
  canPerformLiveWrite,
  getLiveBlockedReason,
  getActorIdForMode,
} from "../src/auth/identityResolver.ts";

function makeApi({ session, users, userError, sessionThrows, callThrows } = {}) {
  return {
    getSession(cb) {
      if (sessionThrows) throw new Error("session boom");
      cb(session ?? null);
    },
    call(method, params, success, error) {
      if (callThrows) throw new Error("call boom");
      if (method === "Get" && params?.typeName === "User") {
        if (userError) return error(userError);
        return success(users ?? []);
      }
      return success([]);
    },
  };
}

test("successful authenticated identity resolution", async () => {
  const api = makeApi({
    session: { userName: "jdoe", database: "opex_trial", server: "srv" },
    users: [{ id: "u-123", name: "John Doe", role: "APPROVER" }],
  });
  const state = await resolveAuthenticatedPrincipal(api);
  assert.equal(state.status, "authenticated");
  assert.equal(state.principal.id, "u-123");
  assert.equal(state.principal.name, "John Doe");
  assert.deepEqual(state.principal.roles, ["APPROVER"]);
  assert.equal(state.session.userName, "jdoe");
  assert.equal(state.session.database, "opex_trial");
});

test("user lookup failure returns error state", async () => {
  const api = makeApi({
    session: { userName: "jdoe", database: "opex_trial" },
    userError: new Error("GET_USER_FAILED"),
  });
  const state = await resolveAuthenticatedPrincipal(api);
  assert.equal(state.status, "error");
  assert.match(state.reason, /GET_USER_FAILED/);
});

test("missing identity (no matching user) is unresolved", async () => {
  const api = makeApi({
    session: { userName: "nobody", database: "opex_trial" },
    users: [],
  });
  const state = await resolveAuthenticatedPrincipal(api);
  assert.equal(state.status, "unresolved");
  assert.match(state.reason, /could not be found/i);
});

test("ambiguous identity (multiple matches) is unresolved", async () => {
  const api = makeApi({
    session: { userName: "common", database: "opex_trial" },
    users: [{ id: "u1", name: "Common A" }, { id: "u2", name: "Common B" }],
  });
  const state = await resolveAuthenticatedPrincipal(api);
  assert.equal(state.status, "unresolved");
  assert.match(state.reason, /ambiguous/i);
});

test("session unavailable yields unresolved", async () => {
  const api = makeApi({ session: null });
  const state = await resolveAuthenticatedPrincipal(api);
  assert.equal(state.status, "unresolved");
  assert.match(state.reason, /session is unavailable/i);
});

test("session retrieval throws yields unresolved (no crash)", async () => {
  const api = makeApi({ sessionThrows: true });
  const state = await resolveAuthenticatedPrincipal(api);
  assert.equal(state.status, "unresolved");
});

test("api unavailable yields unresolved", async () => {
  const state = await resolveAuthenticatedPrincipal(null);
  assert.equal(state.status, "unresolved");
});

test("LIVE write blocked when identity is unresolved/error/loading/null", () => {
  assert.equal(canPerformLiveWrite("ADDIN_DATA", { status: "unresolved", reason: "x" }), false);
  assert.equal(canPerformLiveWrite("ADDIN_DATA", { status: "error", reason: "x" }), false);
  assert.equal(canPerformLiveWrite("ADDIN_DATA", { status: "loading" }), false);
  assert.equal(canPerformLiveWrite("ADDIN_DATA", null), false);
  assert.ok(getLiveBlockedReason("ADDIN_DATA", { status: "unresolved", reason: "nope" }));
  assert.ok(getLiveBlockedReason("ADDIN_DATA", null));
});

test("LIVE write allowed only for authenticated identity", () => {
  const auth = { status: "authenticated", principal: { id: "u1", name: "N", roles: ["EMPLOYEE"], session: { userName: "u1" } }, session: { userName: "u1" } };
  assert.equal(canPerformLiveWrite("ADDIN_DATA", auth), true);
  assert.equal(getLiveBlockedReason("ADDIN_DATA", auth), null);
});

test("DEMO mode remains functional without LIVE identity verification", () => {
  assert.equal(canPerformLiveWrite("DEMO", null), true);
  assert.equal(canPerformLiveWrite("DEMO", { status: "unresolved", reason: "x" }), true);
  assert.equal(getLiveBlockedReason("DEMO", null), null);
});

test("DEMO identity cannot be used in LIVE actor selection", () => {
  const auth = { status: "authenticated", principal: { id: "u-live", name: "Live", roles: ["EMPLOYEE"], session: { userName: "live" } }, session: { userName: "live" } };
  assert.equal(getActorIdForMode("ADDIN_DATA", { status: "unresolved", reason: "x" }, "demo-1"), null);
  assert.equal(getActorIdForMode("ADDIN_DATA", auth, "demo-1"), "u-live");
  assert.equal(getActorIdForMode("DEMO", { status: "unresolved", reason: "x" }, "demo-1"), "demo-1");
  assert.equal(getActorIdForMode("DEMO", null, null), null);
});

test("no cross-mode leakage helper behavior", () => {
  assert.equal(getLiveBlockedReason("DEMO", { status: "unresolved", reason: "x" }), null);
  assert.equal(getLiveBlockedReason("ADDIN_DATA", { status: "loading" }), "Resolving authenticated MyGeotab identity…");
});
