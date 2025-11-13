import { BASE_URL } from "../env";

export type LocationPayload = {
  driverId?: number;
  userId?: number | string;
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
  userId?: number | string;
  driverName?: string;
  region?: string;
  heartRate?: number;
  step?: number;
  recordedAt?: string;
  capturedAt?: string;
  timestamp?: number;
  level?: "좋음" | "경고" | "위험" | string;
  isFallDetected?: boolean;   // ★ 서버가 항상 포함
  fatigueScore?: number;
  score?: number;
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
  maxRetries?: number;
  retryDelayMs?: number;
}

function getAccessToken(): string {
  return sessionStorage.getItem("accessToken") || "";
}

export function sanitizeRegion(v?: string): string | undefined {
  if (!v) return undefined;
  const m = String(v).match(/([가-힣A-Za-z]+구)/);
  return m ? m[1] : undefined;
}

function buildUrl(as: "web" | "mobile", region?: string): string {
  const token = getAccessToken();
  const base = new URL(BASE_URL);
  const pageIsHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const mustSecure = pageIsHttps || base.protocol === "https:";
  const wsProtocol = mustSecure ? "wss:" : "ws:";

  const u = new URL(base.toString());
  u.protocol = wsProtocol;
  u.pathname = "/ws/location";

  const qs = new URLSearchParams();
  if (token) qs.set("token", token);
  qs.set("as", as);

  const gu = sanitizeRegion(region);
  if (gu) qs.set("region", gu);

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
  const log = (...a: any[]) => DEBUG && console.log("[WS]", ...a);
  const warn = (...a: any[]) => DEBUG && console.warn("[WS]", ...a);

  const scheduleReconnect = () => {
    if (!reconnect || closedByClient) return;
    if (retries >= maxRetries) return;
    const delay = (retryDelayMs ?? 2000) * Math.pow(2, retries++);
    retryTimer = window.setTimeout(connect, delay);
    log(`reconnect in ${delay}ms (#${retries})`);
  };

  const connect = () => {
    if (connecting) return;
    connecting = true;

    try {
      log("connecting:", url);
      ws = new WebSocket(url);

      ws.onopen = (ev) => {
        connecting = false;
        retries = 0;
        log("open");
        onOpen?.(ev);
      };

      ws.onerror = (ev) => {
        onError?.(ev);
        warn("error", ev);
      };

      ws.onclose = (ev) => {
        connecting = false;
        onClose?.(ev);
        log("close", ev.code, ev.reason);
        if (!closedByClient) scheduleReconnect();
      };

      ws.onmessage = (ev) => {
        let obj: any;
        try {
          obj = JSON.parse(ev.data);
        } catch {
          warn("invalid JSON:", ev.data);
          return;
        }

        // 표준 형태: { type, payload }
        let type = obj?.type as string | undefined;
        let payload = obj?.payload ?? obj;

        if (!type) {
          const looksLoc = payload && typeof payload.lat === "number" && typeof payload.lng === "number";
          const looksHealth =
            payload &&
            ("isFallDetected" in payload ||
             "heartRate" in payload ||
             "step" in payload ||
             "level" in payload ||
             "score" in payload ||
             "fatigueScore" in payload);

          if (looksLoc) type = "location";
          else if (looksHealth) type = "health";
        }

        // 최소 보정: driverId 없고 userId가 숫자면 변환
        if (payload && payload.driverId == null && payload.userId != null) {
          const n = Number(payload.userId);
          if (Number.isFinite(n)) payload.driverId = n;
        }

        if (type === "location") {
          log("message ← location", payload);
          handlers?.onLocation?.({ type: "location", payload });
        } else if (type === "health") {
          log("message ← health", payload);
          handlers?.onHealth?.({ type: "health", payload });
        } else {
          log("ignored", obj);
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
    if (retryTimer != null) {
      window.clearTimeout(retryTimer);
      retryTimer = null;
    }
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      try { ws.close(1000, "client-close"); } catch {}
    }
    ws = null;
  };
}
