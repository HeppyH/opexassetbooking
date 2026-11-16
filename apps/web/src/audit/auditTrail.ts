import type { BookingDataProvider, NotificationDataProvider, ResolvedBooking } from "../data/types";
import type { AppMode } from "../auth/identityResolver";

export type AuditAction =
  | "BOOKING_CREATED"
  | "BOOKING_UPDATED"
  | "BOOKING_APPROVED"
  | "BOOKING_REJECTED"
  | "VEHICLE_ASSIGNED"
  | "DRIVER_ASSIGNED"
  | "BOOKING_COMPLETED"
  | "BOOKING_CANCELLED";

export type AuditFieldSnapshot = {
  status?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  destination?: string | null;
  purpose?: string | null;
  assetId?: string | null;
  assetName?: string | null;
  driverId?: string | null;
  driverName?: string | null;
};

export type AuditEmitInput = {
  mode: AppMode;
  provider: BookingDataProvider & Partial<NotificationDataProvider>;
  entityId: string;
  action: AuditAction;
  actorUserId: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  previous?: AuditFieldSnapshot | null;
  next?: AuditFieldSnapshot | null;
  metadata?: Record<string, unknown>;
  /** Key to suppress duplicate emits for the same logical action in-process */
  idempotencyKey?: string;
};

export type AuditEmitResult =
  | { ok: true; deduped?: boolean }
  | { ok: false; error: string; deduped?: boolean };

const recentKeys = new Set<string>();

export function resetAuditDedupForTests() {
  recentKeys.clear();
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ note: "unserializable_details" });
  }
}

export function snapshotBooking(b: ResolvedBooking | null | undefined): AuditFieldSnapshot | null {
  if (!b) return null;
  return {
    status: b.status ?? null,
    startAt: b.start_at ?? null,
    endAt: b.end_at ?? null,
    destination: b.destination ?? null,
    purpose: b.purpose ?? null,
    assetId: b.asset_id ?? null,
    assetName: b.asset_name ?? null,
    driverId: b.driver_id ?? null,
    driverName: b.driver_name ?? null,
  };
}

export function diffRelevantFields(previous: AuditFieldSnapshot | null | undefined, next: AuditFieldSnapshot | null | undefined) {
  const keys: (keyof AuditFieldSnapshot)[] = ["status", "startAt", "endAt", "destination", "purpose", "assetId", "driverId"];
  const changed: Record<string, { previous: unknown; next: unknown }> = {};
  for (const k of keys) {
    const p = previous?.[k] ?? null;
    const n = next?.[k] ?? null;
    if (p !== n) changed[k] = { previous: p, next: n };
  }
  return changed;
}

export async function emitAuditEvent(input: AuditEmitInput): Promise<AuditEmitResult> {
  const { mode, provider, entityId, action, actorUserId } = input;
  if (!entityId || !action || !actorUserId) {
    return { ok: false, error: "AUDIT_INVALID_INPUT" };
  }
  const createAuditRecord = provider.createAuditRecord;
  if (typeof createAuditRecord !== "function") {
    return { ok: false, error: "AUDIT_PROVIDER_UNAVAILABLE" };
  }

  const idem = input.idempotencyKey || `${mode}:${entityId}:${action}:${input.previousStatus ?? ""}:${input.newStatus ?? ""}:${actorUserId}:${safeJson(input.metadata ?? null)}`;
  if (recentKeys.has(idem)) {
    return { ok: true, deduped: true };
  }

  const details = safeJson({
    entityType: "BOOKING",
    entityId,
    mode,
    previous: input.previous ?? null,
    new: input.next ?? null,
    changed: diffRelevantFields(input.previous, input.next),
    metadata: input.metadata ?? null,
    idempotencyKey: idem,
  });

  try {
    await createAuditRecord.call(provider, {
      booking_id: entityId,
      action,
      actor_user_id: actorUserId,
      previous_status: input.previousStatus ?? input.previous?.status ?? null,
      new_status: input.newStatus ?? input.next?.status ?? null,
      details,
    });
    recentKeys.add(idem);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AUDIT_WRITE_FAILED" };
  }
}
