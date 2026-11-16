/*───────────────────── MyGeotab Add-In Diagnostic Interface ─────────────────────*/
/* Temporary diagnostic bridge that exposes read-only MyGeotab API operations
   through window.__OPEX_DIAGNOSTICS__ when the DIAGNOSTICS_ENABLED build flag
   is true. Disabled by default in production builds.

   The diagnostic interface:
   - Retrieves the API object from the existing lifecycle bridge
   - Validates api.call is available before calling
   - Uses the exact callback signature: api.call(method, params, success, error)
   - Uses the configured AddInId from application configuration
   - Never exposes the raw API object globally
   - Never exposes session information, authentication tokens, or credentials
   - Returns sanitized results and record counts only
   - Implements read-only operations only (Get)
   - Defaults to disabled; must be explicitly enabled at build time
   */

import { getLifecycleApi, GeotabApiLike } from "./lifecycleBridge";
import { ADDIN_ID_STORAGE_KEY } from "./addinId";

/*───────────────────── Diagnostic Configuration ─────────────────────*/

/* Build-time flag. Set to true only for diagnostic builds.
   Defaults to false in all production builds via Vite define. */
declare const __DIAGNOSTICS_ENABLED__: boolean;
export const DIAGNOSTICS_ENABLED = __DIAGNOSTICS_ENABLED__;

/*───────────────────── Diagnostic Types ─────────────────────*/

export interface DiagnosticDevice {
  id: string;
  name?: string;
  serialNumber?: string;
  licensePlate?: string;
  make?: string;
  model?: string;
}

export interface DiagnosticAddInDataResult {
  success: boolean;
  recordCount: number;
  error?: string;
}

export interface DiagnosticDeviceResult {
  success: boolean;
  deviceCount: number;
  devices: DiagnosticDevice[];
  error?: string;
}

/*───────────────────── Diagnostic Implementation ─────────────────────*/

/* Retrieve the API object from the lifecycle bridge. Returns null if
   the API has not been initialized yet (MyGeotab has not called
   initialize() yet). */
function getDiagnosticApi(): GeotabApiLike | null {
  const bridgeState = getLifecycleApi();
  return bridgeState.api;
}

/* Validate that the API object has a callable call method.
   Returns a type predicate so TypeScript narrows the type after the check. */
function isApiUsable(api: GeotabApiLike | null): api is GeotabApiLike {
  return api !== null && typeof api.call === "function";
}

/* Execute a read-only Get call against the MyGeotab Add-In API.
   Wraps the callback-based api.call in a Promise for cleaner usage. */
function geotabApiGet(
  api: GeotabApiLike,
  method: string,
  params: Record<string, unknown>
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (typeof api.call !== "function") {
      reject(new Error("API.call not available"));
      return;
    }
    api.call(method, params, (result: unknown) => {
      resolve(result);
    }, (error: unknown) => {
      reject(error ?? new Error("GEOTAB_API_ERROR"));
    });
  });
}

/* Sanitize a MyGeotab device record to only expose safe fields.
   Never exposes internal identifiers beyond what's needed for diagnostics. */
function sanitizeDevice(device: Record<string, unknown>): DiagnosticDevice {
  return {
    id: device.id as string,
    name: device.name as string | undefined,
    serialNumber: device.serialNumber as string | undefined,
    licensePlate: device.licensePlate as string | undefined,
    make: device.make as string | undefined,
    model: device.model as string | undefined,
  };
}

/*───────────────────── Diagnostic Public API ─────────────────────*/

/* Execute a read-only Get for MyGeotab Device records.
   Returns device count and sanitized device records. */
async function getDevices(): Promise<DiagnosticDeviceResult> {
  const api = getDiagnosticApi();
  if (!isApiUsable(api)) {
    return {
      success: false,
      deviceCount: 0,
      devices: [],
      error: "API not available: MyGeotab Add-In has not initialized or API object is missing",
    };
  }

  try {
    const records = await geotabApiGet(api, "Get", {
      typeName: "Device",
      resultsLimit: 1000,
    });

    const deviceList = (Array.isArray(records) ? records : []) as Record<string, unknown>[];
    return {
      success: true,
      deviceCount: deviceList.length,
      devices: deviceList.map(sanitizeDevice),
      error: undefined,
    };
  } catch (error) {
    return {
      success: false,
      deviceCount: 0,
      devices: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/* Execute a read-only Get for MyGeotab AddInData records scoped to the
   configured AddInId. Returns record count and sanitized metadata only.
   Never exposes record content (booking details, notifications, etc.). */
async function getAddInData(): Promise<DiagnosticAddInDataResult> {
  const api = getDiagnosticApi();
  if (!isApiUsable(api)) {
    return {
      success: false,
      recordCount: 0,
      error: "API not available: MyGeotab Add-In has not initialized or API object is missing",
    };
  }

  const addInId = localStorage.getItem(ADDIN_ID_STORAGE_KEY);
  if (!addInId) {
    return {
      success: false,
      recordCount: 0,
      error: "AddInId not configured in localStorage",
    };
  }

  try {
    const records = await geotabApiGet(api, "Get", {
      typeName: "AddInData",
      search: { addInId },
    });

    return {
      success: true,
      recordCount: Array.isArray(records) ? records.length : 0,
      error: undefined,
    };
  } catch (error) {
    return {
      success: false,
      recordCount: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/*───────────────────── Window Exposure ─────────────────────*/

/* Expose the diagnostic interface on window only when DIAGNOSTICS_ENABLED
   is true. Disabled by default in production builds. */
function exposeDiagnosticInterface(): void {
  if (!DIAGNOSTICS_ENABLED) return;

  (window as unknown as {
    __OPEX_DIAGNOSTICS__?: {
      getDevices: () => Promise<DiagnosticDeviceResult>;
      getAddInData: () => Promise<DiagnosticAddInDataResult>;
      isEnabled: () => boolean;
    };
  }).__OPEX_DIAGNOSTICS__ = {
    getDevices,
    getAddInData,
    isEnabled: () => DIAGNOSTICS_ENABLED,
  };
}

/* Initialize the diagnostic interface immediately upon module load. */
exposeDiagnosticInterface();
