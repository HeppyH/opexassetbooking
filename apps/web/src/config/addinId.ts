/*───────────────────── OPEX Asset Booking – Stable AddInId ─────────────────────*/
/* Encoded GUID issued for the OPEX Asset Booking MyGeotab Add-In.
   This value identifies the Add-In to the MyGeotab Storage API (AddInData).
   It is stable across application loads and shared by both:
     - Custom-page Add-In (runs in browser iframe, uses window.localStorage)
     - Service Add-In (runs in WebWorker, uses service.localStorage)
   Format: official Geotab AddInId encoding algorithm:
     1. Generate a conventional UUID v4 string
     2. Base64-encode the UUID string (UTF-8 bytes)
     3. Replace '/' with '_'
     4. Replace '+' with '-'
     5. Return "a" + encoded.substring(1, 23)
   Reference: https://developers.geotab.com/myGeotab/addIns/addInStorage/
   Example from Geotab docs: "a2C4ABQuLFkepPVf6-4OKAQ" (23 chars)
   It is NOT the MyGeotab database name (e.g. "opex_trial").
   It is NOT a secret. It may be stored in version-controlled configuration. */

/* Official Geotab AddInId generator algorithm.
   Implements the exact transformation described in the Geotab documentation:
   base64-encode the UUID string, URL-safe encode, then prefix with 'a'. */
export function generateGeotabAddInId(uuid: string): string {
  const encoded = btoa(uuid);
  const urlSafe = encoded.replace(/\//g, "_").replace(/\+/g, "-");
  return "a" + urlSafe.substring(1, 23);
}

/* Validate that an AddInId matches the official Geotab format:
   23 characters, starts with 'a', base64url alphabet. */
export function isValidAddInId(value: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  if (value.length !== 23) return false;
  if (!value.startsWith("a")) return false;
  /* base64url alphabet: A-Z a-z 0-9 - _ */
  return /^a[A-Za-z0-9_-]{22}$/.test(value);
}

/* Stable AddInId for OPEX Asset Booking.
   Generated once using generateGeotabAddInId() with a fixed UUID.
   Stable across application loads — never regenerated. */
export const DEFAULT_ADDIN_ID: string = generateGeotabAddInId(
  "d2c2efec-c558-412c-b94f-0bac247a4640"
);

export const ADDIN_ID_STORAGE_KEY = "opex-vbm-addin-id";

/* Resolve the AddInId to use for AddInData operations.
   Preference order:
     1. User-configured value persisted in storage (if any) — NEVER silently overwritten
     2. DEFAULT_ADDIN_ID (stable fallback)
   Never silently fall back to the MyGeotab database name.
   Returns the resolved value; callers should check isValidAddInId() to warn if invalid. */
export function resolveAddInId(storedValue: string | null): string {
  return storedValue ?? DEFAULT_ADDIN_ID;
}
