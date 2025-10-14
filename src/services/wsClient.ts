// src/services/wsClient.ts

/**
 * WebSocket client for real-time location & health stream
 * - Connects to `${origin}/ws/location?token=...&as=web|mobile&region=...`
 * - Automatically reconnects with exponential backoff
 * - Routes messages by `type`: "location" | "health"
 *
 * Tip: In development, add `src/setupProxy.js` to proxy `/ws` to your backend
 * so the browser connects to the same origin and avoids TLS/Origin issues.
 */

export type LocationPayload = {
  driverId?: number;
  driverName?: string;
  region?: string;
  lat?: number;
  lng?: number;
  capturedAt?: string;
  addressShort?: string;
  timestamp?: number;
};

export type HealthPayload = {
  driverId?: number;
  driverName?: string;
  region?: string;
  heartRate?: number;
  step?: number;
  recordedAt?: string;
  capturedAt?: string; // some servers use this field name
  timestamp?: number;
  userId?: number | string;
};

export type WSMessage =
  | { type: "location"; payload: LocationPayload }
  | { type: "health"; payload: HealthPayload }
  | { type?: string; payload?: unknown }; // fallback safe-parse

export interface ConnectHandlers {
  onLocation?: (msg: { type: "location"; payload: LocationPayload }) => void;
  onHealth?: (msg: { type: "health"; payload: HealthPayload }) => void;
}

export interface ConnectOptions {
  /** "web" for admin, "mobile" for driver app */
  as: "web" | "mobile";
  /** Optional region filter (e.g., "성북구") */
  region?: string;
  /** Lifecycle hooks */
  onOpen?: (ev: Event) => void;
  onError?: (ev: Event) => void;
  onClose?: (ev: CloseEvent) => void;
  /** Message handlers */
  handlers?: ConnectHandlers;
  /** Reconnect behavior */
  reconnect?: boolean;
  maxRetries?: number; // default 5
  retryDelayMs?: number; // base delay, default 2000
}

/** Safely read access token from storage */
function getAccessToken(): string {
  return (
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("accessToken") ||
    ""
  );
}

/** Build WS URL using current origin (so CRA proxy can tunnel `/ws`) */
function buildUrl(as: "web" | "mobile", region?: string): string {
  const token = getAccessToken();
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host; // e.g., localhost:3000

  const qs = new URLSearchParams();
  if (token) qs.set("token", token);
  qs.set("as", as);
  if (region) qs.set("region", region);

  return `${scheme}://${host}/ws/location?${qs.toString()}`;
}

/**
 * Open connection and return a cleanup function that stops reconnecting and closes WS.
 * Usage:
 *   const disconnect = connectLocationWS({ as: "web", region: "성북구", handlers: {...} });
 *   // ...
 *   disconnect();
 */
export function connectLocationWS(opts: ConnectOptions): () => void {
  const {
    as,
    region,
    onOpen,
    onError,
    onClose,
    handlers,
    reconnect = true,
    maxRetries = 5,
    retryDelayMs = 2000,
  } = opts;

  let ws: WebSocket | null = null;
  let closedByClient = false;
  let retries = 0;
  let retryTimer: number | null = null;

  const url = buildUrl(as, region);

  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (!reconnect || closedByClient) return;
    if (retries >= (maxRetries ?? 5)) return;

    const delay = (retryDelayMs ?? 2000) * Math.pow(2, retries); // expo backoff
    retries += 1;
    retryTimer = window.setTimeout(() => {
      connect();
    }, delay);
  };

  const connect = () => {
    try {
      ws = new WebSocket(url);

      ws.onopen = (ev) => {
        // console.debug("[WS] open", url);
        retries = 0; // reset on success
        onOpen?.(ev);
      };

      ws.onerror = (ev) => {
        // console.warn("[WS] error:", ev);
        onError?.(ev);
      };

      ws.onclose = (ev) => {
        // console.warn("[WS] closed:", ev.code, ev.reason || "(no-reason)");
        onClose?.(ev);
        if (!closedByClient) scheduleReconnect();
      };

      ws.onmessage = (ev) => {
        // robust parse
        let data: WSMessage;
        try {
          data = JSON.parse(ev.data);
        } catch {
          // console.warn("[WS] invalid JSON message", ev.data);
          return;
        }
        if (!data || typeof data !== "object") return;

        const type = (data as any).type;
        if (type === "location" && handlers?.onLocation) {
          handlers.onLocation(
            data as { type: "location"; payload: LocationPayload }
          );
        } else if (type === "health" && handlers?.onHealth) {
          handlers.onHealth(data as { type: "health"; payload: HealthPayload });
        } else {
          // unknown type — ignore
        }
      };
    } catch (e) {
      // console.error("[WS] construct error", e);
      scheduleReconnect();
    }
  };

  // kick off
  connect();

  // cleanup: stop reconnects and close socket politely
  return () => {
    closedByClient = true;
    clearRetryTimer();
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      try {
        ws.close(1000, "client-close");
      } catch {
        // ignore
      }
    }
    ws = null;
  };
}
