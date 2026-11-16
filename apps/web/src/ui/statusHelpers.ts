/*───────────────────── Status label formatting helpers ─────────────────────*/
/* Safe formatting for booking statuses displayed in StatusBadge.
   The raw status value can legitimately be undefined/null/empty (e.g. LIVE
   AddInData records with a missing status field). Calling .replace() on
   undefined crashes the whole Add-In with a blank page. These helpers never
   throw and never substitute a misleading identity/default value. */

/* Render a human-readable status label. Returns a neutral placeholder for
   missing/empty status so the UI degrades gracefully instead of crashing. */
export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return status.replace(/_/g, " ");
}

/* Return the CSS class key for a status, defaulting to a neutral class when
   status is missing or unknown. */
export function statusClassKey(status: string | null | undefined): string {
  const map: Record<string, string> = {
    PENDING_APPROVAL: "badge-pending",
    APPROVED: "badge-approved",
    ASSIGNED: "badge-assigned",
    COMPLETED: "badge-completed",
    REJECTED: "badge-rejected",
    CANCELLED: "badge-cancelled",
  };
  if (!status) return "badge-completed";
  return map[status] ?? "badge-completed";
}
