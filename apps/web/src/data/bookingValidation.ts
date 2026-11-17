/*───────────────────── Booking data validation ─────────────────────*/
/* Classifies booking data quality issues without modifying the raw record.
   A booking may have multiple validation issues; the most severe
   classification is reported, with all issues enumerated. */

import type {
  BookingDataQuality,
  BookingValidationResult,
  OpexBooking,
} from "./types.ts";

export type { BookingDataQuality, BookingValidationResult };

/* Determine whether an ISO datetime string is parseable and not empty. */
function isValidDateTime(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value === "") return false;
  const time = new Date(value).getTime();
  return !Number.isNaN(time);
}

/* Validate a booking's data quality. Returns the most severe issue plus
   all detected issues. Does not mutate the booking. */
export function validateBooking(booking: OpexBooking): BookingValidationResult {
  const issues: string[] = [];

  if (!booking.deviceId) issues.push("MISSING_ASSET");
  if (!booking.requesterUserId) issues.push("MISSING_REQUESTER");
  if (!booking.status) issues.push("MISSING_STATUS");
  if (!isValidDateTime(booking.startAt)) issues.push("INVALID_DATETIME");
  if (!isValidDateTime(booking.endAt)) issues.push("INVALID_DATETIME");

  let quality: BookingDataQuality = "VALID";
  if (issues.length === 0) {
    quality = "VALID";
  } else if (issues.length === 1) {
    quality = issues[0] as BookingDataQuality;
  } else {
    quality = "MULTIPLE_VALIDATION_ERRORS";
  }

  return { quality, issues };
}

/* Validate a resolved booking view model. */
export function validateResolvedBooking(booking: {
  asset_id: string | null;
  requester_id: string;
  status: string;
  start_at: string;
  end_at: string;
}): BookingValidationResult {
  const issues: string[] = [];

  if (!booking.asset_id) issues.push("MISSING_ASSET");
  if (!booking.requester_id) issues.push("MISSING_REQUESTER");
  if (!booking.status) issues.push("MISSING_STATUS");
  if (!isValidDateTime(booking.start_at)) issues.push("INVALID_DATETIME");
  if (!isValidDateTime(booking.end_at)) issues.push("INVALID_DATETIME");

  let quality: BookingDataQuality = "VALID";
  if (issues.length === 0) {
    quality = "VALID";
  } else if (issues.length === 1) {
    quality = issues[0] as BookingDataQuality;
  } else {
    quality = "MULTIPLE_VALIDATION_ERRORS";
  }

  return { quality, issues };
}
