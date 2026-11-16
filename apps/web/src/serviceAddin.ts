/*───────────────────── OPEX Asset Booking – MyGeotab Service Add-In ─────────────────────*/
/* Service Add-In entry point. Runs in a WebWorker background context within MyGeotab.
   Polls AddInData for pending notifications and delivers them via service.notifications.show().
   Registered via: geotab.addin.service = (service) => { ... } */

/*───────────────────── Types ─────────────────────*/

type LocalStorageService = {
  get?: (key: string) => Promise<string | null>;
  set?: (key: string, value: string) => Promise<void>;
  remove?: (key: string) => Promise<void>;
};

type ServiceAddIn = {
  notifications?: {
    show?: (opts: {
      title: string;
      text: string;
      type?: "info" | "warning" | "error" | "success";
      duration?: number;
      buttons?: unknown[];
    }) => unknown;
  };
  api?: {
    call?: (method: string, params: Record<string, unknown>) => Promise<unknown>;
    getSession?: () => Promise<{ userName?: string; database?: string; server?: string }>;
  };
  localStorage?: LocalStorageService;
};

type OpexNotification = {
  id: string;
  eventId: string;
  idempotencyKey: string;
  type: string;
  recipient_user_id: string;
  related_booking_id: string | null;
  title: string;
  message: string;
  is_read: boolean;
  delivery_status: "pending" | "delivered" | "failed";
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

type AddInDataDetails = string | Record<string, unknown>;
type AddInDataRecord = { addInId?: string; details?: AddInDataDetails; id?: string };

/*───────────────────── Constants ─────────────────────*/

const ADDIN_ID_KEY = "opex-vbm-addin-id";
const DEFAULT_ADDIN_ID = "aDJjMmVmZWMtYzU1OC00MTJ";
const NOTIFICATION_GROUP_ID = "GroupCompanyId";
const POLL_INTERVAL_MS = 30000; // 30 seconds
const MAX_NOTIFICATIONS_PER_POLL = 10;
const MAX_NOTIFICATION_CALLS_PER_MINUTE = 6;
const MAX_VISIBLE_NOTIFICATIONS = 2;
const ROLLING_WINDOW_MS = 60000; // 1 minute
const RETRY_BACKOFF_MS = 60000; // 1 minute between retries

/*───────────────────── Helpers ─────────────────────*/

function deserializeNotification(details: AddInDataDetails): OpexNotification | null {
  try {
    return (typeof details === "string" ? JSON.parse(details) : details) as OpexNotification;
  } catch {
    return null;
  }
}

async function apiCall<T>(service: ServiceAddIn, method: string, params: Record<string, unknown>): Promise<T | null> {
  try {
    const call = service.api?.call;
    if (typeof call !== "function") return null;
    const result = await call(method, params);
    return (result as T) ?? null;
  } catch {
    return null;
  }
}

async function getAddInId(service: ServiceAddIn): Promise<string | null> {
  try {
    const localStorage = service.localStorage;
    if (!localStorage || typeof localStorage.get !== "function") return null;
    const addInId = await localStorage.get(ADDIN_ID_KEY);
    return addInId ?? DEFAULT_ADDIN_ID;
  } catch {
    return DEFAULT_ADDIN_ID;
  }
}

/*───────────────────── Notification Rate Limiter ─────────────────────*/
/* Enforces MyGeotab rate limits:
   - Maximum 6 notification calls per rolling minute
   - Maximum 2 visible notifications at a time */

type CallRecord = { timestamp: number };

class NotificationRateLimiter {
  private calls: CallRecord[] = [];
  private visibleCount = 0;

  canCall(): boolean {
    const now = Date.now();
    // Remove calls outside the rolling window
    this.calls = this.calls.filter(c => now - c.timestamp < ROLLING_WINDOW_MS);
    return this.calls.length < MAX_NOTIFICATION_CALLS_PER_MINUTE;
  }

  recordCall(): void {
    this.calls.push({ timestamp: Date.now() });
  }

  canShow(): boolean {
    return this.visibleCount < MAX_VISIBLE_NOTIFICATIONS;
  }

  incrementVisible(): void {
    this.visibleCount += 1;
  }

  decrementVisible(): void {
    if (this.visibleCount > 0) this.visibleCount -= 1;
  }
}

const rateLimiter = new NotificationRateLimiter();

/*───────────────────── Diagnostic Logging ─────────────────────*/
function diagLog(message: string, detail?: unknown): void {
  try {
    if (typeof console !== "undefined" && console.log) {
      const detailStr = detail !== undefined ? ` | detail=${String(detail).slice(0, 100)}` : "";
      console.log(`[OPEX-VBM-ServiceAddIn] ${message}${detailStr}`);
    }
  } catch {
    // Logging must never throw
  }
}

/* Local AddInId validation for standalone Service Add-In bundle.
   Mirrors config/addinId.ts isValidAddInId but self-contained for WebWorker context. */
function isValidAddInIdLocal(value: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  if (value.length !== 23) return false;
  if (!value.startsWith("a")) return false;
  return /^a[A-Za-z0-9_-]{22}$/.test(value);
}

/*───────────────────── Notification Delivery ─────────────────────*/

async function deliverPendingNotifications(service: ServiceAddIn): Promise<void> {
  diagLog("Service Add-In deliverPendingNotifications started");
  const addInId = await getAddInId(service);
  if (!addInId) {
    diagLog("Service Add-In deliverPendingNotifications: no AddInId, safe no-op");
    return;
  }
  diagLog("Service Add-In AddInId resolved", { addInIdValid: isValidAddInIdLocal(addInId) });

  // Retrieve pending notifications from AddInData
  const records = await apiCall<AddInDataRecord[]>(
    service,
    "Get",
    {
      typeName: "AddInData",
      search: {
        addInId,
        whereClause: `details.delivery_status = "pending"`,
        resultsLimit: MAX_NOTIFICATIONS_PER_POLL,
      },
    }
  );

  if (!records || records.length === 0) {
    diagLog("Service Add-In deliverPendingNotifications: no pending records");
    return;
  }

  diagLog("Service Add-In deliverPendingNotifications: pending records found", { count: records.length });

  for (const record of records) {
    // Re-check delivery status before processing (idempotency guard)
    const n = deserializeNotification(record.details ?? "");
    if (!n || n.delivery_status !== "pending") continue;

    // Rate limit: max 6 calls per rolling minute
    if (!rateLimiter.canCall()) {
      // Leave as pending for next poll cycle
      continue;
    }

    // Rate limit: max 2 visible notifications at a time
    if (!rateLimiter.canShow()) {
      // Leave as pending; will be retried when a visible slot frees up
      continue;
    }

    rateLimiter.recordCall();
    rateLimiter.incrementVisible();

    let delivered = false;
    try {
      const show = service.notifications?.show;
      if (typeof show === "function") {
        await show({
          title: n.title,
          text: n.message,
          type: "info",
          duration: 10,
        });
        delivered = true;
      }
    } catch {
      // Native notification failed – do NOT mark as delivered
    }

    // Update delivery status in AddInData
    n.delivery_status = delivered ? "delivered" : "failed";
    n.delivered_at = delivered ? new Date().toISOString() : n.delivered_at;
    n.updated_at = new Date().toISOString();

    await apiCall<unknown>(
      service,
      "Set",
      {
        typeName: "AddInData",
        entity: {
          addInId,
          id: record.id,
          details: n,
          groups: [{ id: NOTIFICATION_GROUP_ID }],
        },
      }
    );

    // Decrement visible count after notification duration expires
    setTimeout(() => {
      rateLimiter.decrementVisible();
    }, 10000); // matches duration: 10 seconds
  }
}

/*───────────────────── Service Add-In Entry Point ─────────────────────*/

/* WebWorker-compatible registration. Uses self.geotab instead of window.geotab
   because Service Add-Ins run in a WebWorker context where window is unavailable.
   Guarded with typeof checks so the module can be imported in non-WebWorker
   environments (e.g., unit tests) without throwing. */

if (typeof self !== "undefined") {
  const selfGlobal = self as unknown as {
    geotab?: {
      addin?: {
        service?: (service: ServiceAddIn) => void;
      } | null;
    } | null;
  };

  selfGlobal.geotab = selfGlobal.geotab ?? {};
  selfGlobal.geotab.addin = selfGlobal.geotab.addin ?? {};

  selfGlobal.geotab.addin.service = (service: ServiceAddIn) => {
    diagLog("Service Add-In registered, initializing notification delivery");
    // Deliver pending notifications on startup
    deliverPendingNotifications(service).catch(() => {
      // Swallow errors – Service Add-In must not crash
    });

    // Periodic polling for new pending notifications
    const interval = setInterval(() => {
      deliverPendingNotifications(service).catch(() => {
        // Swallow errors
      });
    }, POLL_INTERVAL_MS);

    // Keep the service alive (WebWorker context)
    return () => {
      diagLog("Service Add-In cleanup, stopping notification polling");
      clearInterval(interval);
    };
  };
}

/*───────────────────── Module export (for bundling and testing) ─────────────────────*/

export {
  NotificationRateLimiter,
  getAddInId,
  deliverPendingNotifications,
  type ServiceAddIn,
  type OpexNotification,
  type LocalStorageService,
};
