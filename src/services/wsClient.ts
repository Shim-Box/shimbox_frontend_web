// src/services/wsClient.ts
import { BASE_URL } from "../env";

export type LocationPayload = {
  driverId?: number;
  userId?: number | string;      // ✅ 추가: 위치 메시지에도 userId 허용
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
  capturedAt?: string;
  timestamp?: number;
  userId?: number | string;
  level?: "좋음" | "경고" | "위험" | string;
};

export type WSMessage =
  | { type: "location"; payload: LocationPayload }
  | { type: "health"; payload: HealthPayload }
  | { type?: string; payload?: unknown };

export interface ConnectHandlers {
  onLocation?: (msg: { type: "location"; payload: LocationPayload }) => void;
  onHealth?: (msg: { type: "health"; payload: HealthPayload }) => void;
}

export interface ConnectOptions {
  as: "web" | "mobile";
  region?: string;
  onOpen?: (ev: Event) => void;
  onError?: (ev: Event) => void;
  onClose?: (ev: CloseEvent) => void;
  handlers?: ConnectHandlers;
  reconnect?: boolean;
  maxRetries?: number;       // 기본 3
  retryDelayMs?: number;     // 기본 2000ms
}

/** Token */
function getAccessToken(): string {
  return (
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("accessToken") ||
    ""
  );
}

/** BASE_URL → ws(s) URL */
function buildUrl(as: "web" | "mobile", region?: string): string {
  const token = getAccessToken();
  const u = new URL(BASE_URL);
  u.protocol = u.protocol.replace("http", "ws");
  u.pathname = "/ws/location";

  const qs = new URLSearchParams();
  if (token) qs.set("token", token);
  qs.set("as", as);
  if (region) qs.set("region", region);

  u.search = qs.toString();
  return u.toString();
}

export function connectLocationWS(opts: ConnectOptions): () => void {
  const {
    as,
    region,
    onOpen,
    onError,
    onClose,
    handlers,
    reconnect = true,
    maxRetries = 3,
    retryDelayMs = 2000,
  } = opts;

  let ws: WebSocket | null = null;
  let closedByClient = false;
  let retries = 0;
  let retryTimer: number | null = null;
  let connecting = false;

  const DEBUG = localStorage.getItem("debug:ws") === "1";
  const url = buildUrl(as, region);

  const clearRetryTimer = () => {
    if (retryTimer !== null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const scheduleReconnect = () => {
    if (!reconnect || closedByClient) return;
    if (retries >= (maxRetries ?? 3)) return;
    const delay = (retryDelayMs ?? 2000) * Math.pow(2, retries);
    retries += 1;
    retryTimer = window.setTimeout(() => connect(), delay);
    if (DEBUG) console.log(`[WS] reconnect in ${delay}ms (#${retries})`);
  };

  const connect = () => {
    if (connecting) return;
    connecting = true;

    try {
      if (DEBUG) console.log("[WS] connecting:", url);
      ws = new WebSocket(url);

      ws.onopen = (ev) => {
        connecting = false;
        retries = 0;
        if (DEBUG) console.log("[WS] open");
        onOpen?.(ev);
      };

      ws.onerror = (ev) => {
        onError?.(ev);
        if (DEBUG) console.warn("[WS] error");
      };

      ws.onclose = (ev) => {
        connecting = false;
        onClose?.(ev);
        if (DEBUG) console.log("[WS] close", ev.code, ev.reason);
        if (!closedByClient) scheduleReconnect();
      };

      ws.onmessage = (ev) => {
        let data: WSMessage;
        try {
          data = JSON.parse(ev.data);
        } catch {
          if (DEBUG) console.warn("[WS] invalid JSON");
          return;
        }
        if (!data || typeof data !== "object") return;

        const type = (data as any).type;
        if (type === "location" && handlers?.onLocation) {
          handlers.onLocation(
            data as { type: "location"; payload: LocationPayload }
          );
        } else if (type === "health" && handlers?.onHealth) {
          handlers.onHealth(
            data as { type: "health"; payload: HealthPayload }
          );
        }
      };
    } catch {
      connecting = false;
      scheduleReconnect();
    }
  };

  connect();

  return () => {
    closedByClient = true;
    clearRetryTimer();
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)
    ) {
      try { ws.close(1000, "client-close"); } catch {}
    }
    ws = null;
  };
}
