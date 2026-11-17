/*───────────────────── Safe string comparison helpers ─────────────────────*/
/* Reusable comparison utilities that never throw on undefined, null, or
   non-string values. These replace unsafe direct .localeCompare() calls
   that crashed the Add-In when AddInData records contained missing fields. */

/* Compare two values safely as strings. Non-string values (undefined, null,
   numbers, objects) are coerced to "" so they sort deterministically without
   throwing. Missing values sort before present values. */
export function safeStringCompare(a: unknown, b: unknown): number {
  const left = typeof a === "string" ? a : "";
  const right = typeof b === "string" ? b : "";
  return left.localeCompare(right);
}

/* Compare two optional string fields, treating missing/empty values as lower
   priority than present values. Returns a negative number if a sorts before b,
   positive if a sorts after b, 0 if equal. Missing values sort last. */
export function safeStringCompareWithMissingLast(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const aMissing = a === null || a === undefined || a === "";
  const bMissing = b === null || b === undefined || b === "";

  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return a.localeCompare(b);
}

/* Compare two ISO datetime strings safely. Invalid/missing values sort last.
   Falls back to string comparison for equal timestamps. */
export function safeDateTimeCompare(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const aMissing = a === null || a === undefined || a === "";
  const bMissing = b === null || b === undefined || b === "";

  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;

  const aTime = new Date(a).getTime();
  const bTime = new Date(b).getTime();
  const aInvalid = Number.isNaN(aTime);
  const bInvalid = Number.isNaN(bTime);

  if (aInvalid && bInvalid) return safeStringCompare(a, b);
  if (aInvalid) return 1;
  if (bInvalid) return -1;

  return bTime > aTime ? 1 : bTime < aTime ? -1 : 0;
}

/* Sort an array of objects by a string accessor, returning a new sorted array
   without mutating the original. Missing/undefined accessor values sort last. */
export function sortByStringAccessor<T>(
  items: readonly T[],
  accessor: (item: T) => string | null | undefined,
): T[] {
  return [...items].sort((a, b) =>
    safeStringCompareWithMissingLast(accessor(a), accessor(b)),
  );
}

/* Sort an array of objects by a datetime accessor (newest first), returning a
   new sorted array without mutating the original. Invalid/missing datetimes
   sort last. */
export function sortByDateTimeAccessor<T>(
  items: readonly T[],
  accessor: (item: T) => string | null | undefined,
): T[] {
  return [...items].sort((a, b) => safeDateTimeCompare(accessor(a), accessor(b)));
}
