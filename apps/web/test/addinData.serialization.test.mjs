import test from "node:test";
import assert from "node:assert/strict";
import {
  AddInDataBookingDataProvider,
  serializeBooking,
  serializeNotification,
  serializeAudit,
  deserializeBooking,
  deserializeNotification,
  deserializeAudit,
} from "../src/data/addinDataProvider.ts";

const sampleBooking = {
  id: "b-1",
  deviceId: "dev-1",
  requesterUserId: "u-1",
  requestedClass: "PASSENGER",
  startAt: "2026-11-16T09:00:00Z",
  endAt: "2026-11-16T10:00:00Z",
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 30,
  purpose: "Site visit",
  destination: "HQ",
  passengerCount: 2,
  status: "PENDING_APPROVAL",
  assignedDriverUserId: null,
  approverId: null,
  approvalRemarks: null,
  createdAt: "2026-11-16T08:00:00Z",
  updatedAt: "2026-11-16T08:00:00Z",
  version: 1,
};

const sampleNotification = {
  id: "n-1",
  eventId: "evt-1",
  idempotencyKey: "notif:booking_created:b-1:u-2",
  type: "booking_created",
  recipient_user_id: "u-2",
  related_booking_id: "b-1",
  title: "New Vehicle Booking Request",
  message: "A new booking request requires your approval.",
  is_read: false,
  delivery_status: "pending",
  delivered_at: null,
  created_at: "2026-11-16T08:00:00Z",
  updated_at: "2026-11-16T08:00:00Z",
};

const sampleAudit = {
  id: "a-1",
  booking_id: "b-1",
  action: "CREATED",
  actor_user_id: "u-1",
  previous_status: null,
  new_status: "PENDING_APPROVAL",
  details: "created",
  created_at: "2026-11-16T08:00:00Z",
};

test("booking serializer returns an object", () => {
  const out = serializeBooking(sampleBooking);
  assert.equal(typeof out, "object");
  assert.ok(out !== null);
  assert.equal(Array.isArray(out), false);
});

test("notification serializer returns an object", () => {
  const out = serializeNotification(sampleNotification);
  assert.equal(typeof out, "object");
  assert.ok(out && !Array.isArray(out));
});

test("audit serializer returns an object", () => {
  const out = serializeAudit(sampleAudit);
  assert.equal(typeof out, "object");
  assert.ok(out && !Array.isArray(out));
});

for (const [name, fn, value] of [
  ["booking", serializeBooking, sampleBooking],
  ["notification", serializeNotification, sampleNotification],
  ["audit", serializeAudit, sampleAudit],
]) {
  test(`${name} JSON serialization succeeds`, () => {
    const out = fn(value);
    assert.doesNotThrow(() => JSON.stringify(out));
    const json = JSON.stringify(out);
    assert.ok(json.startsWith("{"));
  });
}

test("maximum details length validation still works", () => {
  const big = { ...sampleBooking, purpose: "x".repeat(12000) };
  assert.throws(() => serializeBooking(big), /ADDIN_DATA_DETAILS_EXCEEDED/);
});

test("deserialization remains compatible with string and object details", () => {
  const bObj = deserializeBooking(sampleBooking);
  const bStr = deserializeBooking(JSON.stringify(sampleBooking));
  assert.equal(bObj.id, bStr.id);
  assert.equal(bObj.purpose, bStr.purpose);

  const nObj = deserializeNotification(sampleNotification);
  const nStr = deserializeNotification(JSON.stringify(sampleNotification));
  assert.equal(nObj.id, nStr.id);

  const aObj = deserializeAudit(sampleAudit);
  const aStr = deserializeAudit(JSON.stringify(sampleAudit));
  assert.equal(aObj.id, aStr.id);
});

function makeApi({ devices = [], users = [], bookings = [] } = {}) {
  const calls = [];
  const addInId = "aDJjMmVmZWMtYzU1OC00MTJ";
  const records = bookings.map((b, i) => ({ id: b.id || `rec-${i}`, addInId, details: b, groups: [{ id: "GroupCompanyId" }] }));
  const api = {
    call(method, params, success) {
      calls.push({ method, params: JSON.parse(JSON.stringify(params, (_, v) => v)) });
      if (method === "Get" && params.typeName === "Device") return success(devices);
      if (method === "Get" && params.typeName === "User") return success(users);
      if (method === "Get" && params.typeName === "AddInData") return success(records);
      if (method === "Add") return success({ id: "new-booking-id" });
      if (method === "Set" || method === "Remove") return success({});
      return success(null);
    },
  };
  return { api, calls, addInId };
}

test("booking Add request passes an object as entity.details and is not double-serialized", async () => {
  const { api, calls, addInId } = makeApi({
    devices: [{ id: "dev-1", name: "Toyota Hilux", licensePlate: "AD 1" }],
    users: [{ id: "u-1", name: "User One" }],
  });
  const provider = new AddInDataBookingDataProvider(api, addInId);
  await provider.createBooking({
    deviceId: "dev-1",
    requesterUserId: "u-1",
    requestedClass: "PASSENGER",
    startAt: "2026-11-16T09:00:00Z",
    endAt: "2026-11-16T10:00:00Z",
    purpose: "Trip",
    destination: "Site",
    passengerCount: 1,
  });
  const addCall = calls.find(c => c.method === "Add" && c.params.typeName === "AddInData");
  assert.ok(addCall, "AddInData Add call expected");
  assert.equal(typeof addCall.params.entity.details, "object");
  assert.notEqual(typeof addCall.params.entity.details, "string");
  assert.equal(addCall.params.entity.details.deviceId, "dev-1");
  assert.equal(addCall.params.entity.details.status, "PENDING_APPROVAL");
  // ensure not double serialized
  assert.equal(typeof addCall.params.entity.details.purpose, "string");
});

test("existing AddInData Get/deserialization remains compatible for object details", async () => {
  const bookingRecord = { ...sampleBooking, id: "b-obj" };
  const { api, addInId } = makeApi({
    devices: [{ id: "dev-1", name: "AD 1_Toyota Hilux_Driver", licensePlate: "AD 1" }],
    users: [{ id: "u-1", name: "User One" }],
    bookings: [bookingRecord],
  });
  const provider = new AddInDataBookingDataProvider(api, addInId);
  const list = await provider.getBookings();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "b-obj");
  assert.equal(list[0].purpose, "Site visit");
});
