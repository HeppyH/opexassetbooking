/*───────────────────── MyGeotab Add-In Lifecycle Bridge ─────────────────────*/
/* Module-level bridge that stores the latest MyGeotab API object received
   from initialize(). This ensures React can recover the API object even if
   initialize() is called before React's useEffect registers its event
   listener, eliminating the race condition between module load and
   React mount. */

export interface GeotabApiLike {
  call?: (method: string, params: Record<string, unknown>, success: (result: unknown) => void, error?: (error: unknown) => void) => void;
  getSession?: (callback: (session: { userName?: string; database?: string; server?: string } | null) => void) => void;
  multiCall?: (params: Record<string, unknown>, success: (result: unknown) => void, error?: (error: unknown) => void) => void;
}

export interface LifecycleBridgeState {
  api: GeotabApiLike | null;
  state: unknown;
  initialized: boolean;
}

let bridgeState: LifecycleBridgeState = {
  api: null,
  state: null,
  initialized: false,
};

let subscribers: Array<(state: LifecycleBridgeState) => void> = [];

/* Store the latest valid API object received from MyGeotab initialize().
   Only objects with a callable `call` method are stored, ensuring invalid
   or incomplete API objects are never retained.
   Passing null clears the stored state. */
export function setLifecycleApi(api: GeotabApiLike | null, state: unknown): void {
  if (api === null) {
    bridgeState = { api: null, state: null, initialized: false };
    const current = { ...bridgeState };
    subscribers.forEach(fn => fn(current));
    return;
  }
  if (typeof api.call !== "function") return;

  bridgeState = {
    api,
    state,
    initialized: true,
  };

  // Notify all subscribers synchronously with a copy of current state
  const current = { ...bridgeState };
  subscribers.forEach(fn => fn(current));
}

/* Return a snapshot of the current lifecycle bridge state. */
export function getLifecycleApi(): LifecycleBridgeState {
  return { ...bridgeState };
}

/* Subscribe to lifecycle state changes. Immediately invokes the callback
   with the current state so callers can recover state even if they
   subscribed after initialize() was called. Returns an unsubscribe function. */
export function subscribeToLifecycle(callback: (state: LifecycleBridgeState) => void): () => void {
  subscribers.push(callback);
  callback({ ...bridgeState });
  return () => {
    const idx = subscribers.indexOf(callback);
    if (idx >= 0) subscribers.splice(idx, 1);
  };
}

/* For testing only: resets bridge state and clears all subscribers. */
export function resetBridgeForTesting(): void {
  bridgeState = { api: null, state: null, initialized: false };
  subscribers = [];
}
