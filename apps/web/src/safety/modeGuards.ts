import type { AppMode, IdentityResolutionState } from "../auth/identityResolver";
import type { BookingDataProvider } from "../data/types";

/** Demo-only operations (reset/seed/clear) must never run in LIVE/ADDIN_DATA. Fail closed. */
export function canRunDemoOnlyOperation(mode: AppMode | null | undefined): boolean {
  return mode === "DEMO";
}

export function assertDemoOnlyOperation(mode: AppMode | null | undefined, op: string): void {
  if (!canRunDemoOnlyOperation(mode)) {
    throw new Error(`${op} is allowed only in DEMO mode.`);
  }
}

/** Ensure the active provider cannot be a live/AddInData provider for demo-only operations. */
export function assertProviderNotLiveForDemoOperation(provider: BookingDataProvider | null | undefined, op: string): void {
  if (!provider) throw new Error(`${op} unavailable: provider not initialized.`);
  if (provider.isLive()) {
    throw new Error(`${op} blocked: live provider cannot be used for demo-only operations.`);
  }
}

/**
 * After switching modes, stale actor/notification/pending state must be cleared.
 * Returns the reset state slice for UI state setters.
 */
export function getStateResetOnModeSwitch() {
  return {
    notifications: [] as OpexNotificationLike[],
    unreadCount: 0,
    notificationDropdownOpen: false,
    selectedBooking: null as unknown,
    rejectingId: null as string | null,
    rejectReason: {} as Record<string, string>,
    message: null as unknown,
  };
}

type OpexNotificationLike = unknown;

export function isKnownMode(mode: unknown): mode is AppMode {
  return mode === "DEMO" || mode === "ADDIN_DATA";
}

/** Fail-closed mode normalization: ambiguous values treated as not LIVE-authorized; caller must handle. */
export function normalizeModeStrict(mode: unknown): AppMode | null {
  if (mode === "DEMO" || mode === "ADDIN_DATA") return mode;
  return null;
}

export function canPerformLiveWriteStrict(mode: AppMode | null | undefined, identity: IdentityResolutionState | null | undefined): boolean {
  if (mode !== "ADDIN_DATA") return mode === "DEMO";
  return !!identity && identity.status === "authenticated";
}
