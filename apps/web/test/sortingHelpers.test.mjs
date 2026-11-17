import test from "node:test";
import assert from "node:assert/strict";
import {
  safeStringCompare,
  safeStringCompareWithMissingLast,
  safeDateTimeCompare,
  sortByStringAccessor,
  sortByDateTimeAccessor,
} from "../src/ui/sortingHelpers.ts";

/*───────────────────── safeStringCompare ─────────────────────*/

test("safeStringCompare: both valid strings", () => {
  assert.equal(safeStringCompare("apple", "banana"), -1);
  assert.equal(safeStringCompare("banana", "apple"), 1);
  assert.equal(safeStringCompare("apple", "apple"), 0);
});

test("safeStringCompare: first value undefined", () => {
  assert.equal(safeStringCompare(undefined, "banana"), -1); // "" < "banana"
  assert.equal(safeStringCompare(undefined, ""), 0);
});

test("safeStringCompare: second value undefined", () => {
  assert.equal(safeStringCompare("apple", undefined), 1); // "apple" > ""
  assert.equal(safeStringCompare("", undefined), 0);
});

test("safeStringCompare: both values undefined", () => {
  assert.equal(safeStringCompare(undefined, undefined), 0);
});

test("safeStringCompare: null values", () => {
  assert.equal(safeStringCompare(null, "banana"), -1);
  assert.equal(safeStringCompare("apple", null), 1);
  assert.equal(safeStringCompare(null, null), 0);
});

test("safeStringCompare: empty strings", () => {
  assert.equal(safeStringCompare("", ""), 0);
  assert.equal(safeStringCompare("", "a"), -1);
  assert.equal(safeStringCompare("a", ""), 1);
});

test("safeStringCompare: numeric or unexpected values", () => {
  assert.equal(safeStringCompare(123, "banana"), -1); // "" < "banana"
  assert.equal(safeStringCompare("apple", 456), 1); // "apple" > ""
  assert.equal(safeStringCompare(123, 456), 0); // "" === ""
});

/*───────────────────── safeStringCompareWithMissingLast ─────────────────────*/

test("safeStringCompareWithMissingLast: both valid strings", () => {
  assert.equal(safeStringCompareWithMissingLast("apple", "banana"), -1);
  assert.equal(safeStringCompareWithMissingLast("banana", "apple"), 1);
});

test("safeStringCompareWithMissingLast: missing first sorts last", () => {
  assert.equal(safeStringCompareWithMissingLast(undefined, "banana"), 1);
  assert.equal(safeStringCompareWithMissingLast(null, "banana"), 1);
  assert.equal(safeStringCompareWithMissingLast("", "banana"), 1);
});

test("safeStringCompareWithMissingLast: missing second sorts last", () => {
  assert.equal(safeStringCompareWithMissingLast("apple", undefined), -1);
  assert.equal(safeStringCompareWithMissingLast("apple", null), -1);
  assert.equal(safeStringCompareWithMissingLast("apple", ""), -1);
});

test("safeStringCompareWithMissingLast: both missing are equal", () => {
  assert.equal(safeStringCompareWithMissingLast(undefined, undefined), 0);
  assert.equal(safeStringCompareWithMissingLast(null, null), 0);
  assert.equal(safeStringCompareWithMissingLast("", ""), 0);
});

/*───────────────────── safeDateTimeCompare ─────────────────────*/

test("safeDateTimeCompare: newest first", () => {
  assert.equal(safeDateTimeCompare("2026-11-17T08:00:00.000Z", "2026-11-16T08:00:00.000Z"), -1);
  assert.equal(safeDateTimeCompare("2026-11-16T08:00:00.000Z", "2026-11-17T08:00:00.000Z"), 1);
  assert.equal(safeDateTimeCompare("2026-11-16T08:00:00.000Z", "2026-11-16T08:00:00.000Z"), 0);
});

test("safeDateTimeCompare: missing first sorts last", () => {
  assert.equal(safeDateTimeCompare(undefined, "2026-11-16T08:00:00.000Z"), 1);
  assert.equal(safeDateTimeCompare(null, "2026-11-16T08:00:00.000Z"), 1);
  assert.equal(safeDateTimeCompare("", "2026-11-16T08:00:00.000Z"), 1);
});

test("safeDateTimeCompare: missing second sorts last", () => {
  assert.equal(safeDateTimeCompare("2026-11-16T08:00:00.000Z", undefined), -1);
  assert.equal(safeDateTimeCompare("2026-11-16T08:00:00.000Z", null), -1);
});

test("safeDateTimeCompare: both missing are equal", () => {
  assert.equal(safeDateTimeCompare(undefined, undefined), 0);
  assert.equal(safeDateTimeCompare(null, null), 0);
});

test("safeDateTimeCompare: invalid datetime sorts last", () => {
  assert.equal(safeDateTimeCompare("not-a-date", "2026-11-16T08:00:00.000Z"), 1);
  assert.equal(safeDateTimeCompare("2026-11-16T08:00:00.000Z", "not-a-date"), -1);
});

/*───────────────────── sortByStringAccessor ─────────────────────*/

test("sortByStringAccessor: sorts by accessor, missing last", () => {
  const items = [
    { name: "banana" },
    { name: undefined },
    { name: "apple" },
    { name: null },
  ];
  const sorted = sortByStringAccessor(items, item => item.name);
  assert.equal(sorted[0].name, "apple");
  assert.equal(sorted[1].name, "banana");
  assert(sorted[2].name === null || sorted[2].name === undefined);
  assert(sorted[3].name === null || sorted[3].name === undefined);
});

test("sortByStringAccessor: does not mutate original array", () => {
  const items = [{ name: "b" }, { name: "a" }];
  const original = [...items];
  sortByStringAccessor(items, item => item.name);
  assert.deepEqual(items, original);
});

/*───────────────────── sortByDateTimeAccessor ─────────────────────*/

test("sortByDateTimeAccessor: newest first", () => {
  const items = [
    { created_at: "2026-11-16T08:00:00.000Z" },
    { created_at: "2026-11-18T08:00:00.000Z" },
    { created_at: "2026-11-17T08:00:00.000Z" },
    { created_at: undefined },
  ];
  const sorted = sortByDateTimeAccessor(items, item => item.created_at);
  assert.equal(sorted[0].created_at, "2026-11-18T08:00:00.000Z");
  assert.equal(sorted[1].created_at, "2026-11-17T08:00:00.000Z");
  assert.equal(sorted[2].created_at, "2026-11-16T08:00:00.000Z");
  assert.equal(sorted[3].created_at, undefined);
});

test("sortByDateTimeAccessor: does not mutate original array", () => {
  const items = [{ created_at: "2026-11-16T08:00:00.000Z" }, { created_at: "2026-11-18T08:00:00.000Z" }];
  const original = [...items];
  sortByDateTimeAccessor(items, item => item.created_at);
  assert.deepEqual(items, original);
});
