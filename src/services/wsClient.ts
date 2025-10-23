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
  capturedAt?: string;
  timestamp?: number;
  userId?: number | string;
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
  return (
    localStorage.getItem("accessToken") ||
    sessionStorage.getItem("accessToken") ||
    ""
  );
}

function buildUrl(as: "web" | "mobile", region?: string): string {
  const token = getAccessToken();
  const scheme = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;

  const qs = new URLSearchParams();
  if (token) qs.set("token", token);
  qs.set("as", as);
  if (region) qs.set("region", region);

  return `${scheme}://${host}/ws/location?${qs.toString()}`;
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

    const delay = (retryDelayMs ?? 2000) * Math.pow(2, retries);
    retries += 1;
    retryTimer = window.setTimeout(() => {
      connect();
    }, delay);
  };

  const connect = () => {
    try {
      ws = new WebSocket(url);

      ws.onopen = (ev) => {
        retries = 0;
        onOpen?.(ev);
      };

      ws.onerror = (ev) => {
        onError?.(ev);
      };

      ws.onclose = (ev) => {
        onClose?.(ev);
        if (!closedByClient) scheduleReconnect();
      };

      ws.onmessage = (ev) => {
        let data: WSMessage;
        try {
          data = JSON.parse(ev.data);
        } catch {
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
        }
      };
    } catch (e) {
      scheduleReconnect();
    }
  };

  connect();

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
      } catch {}
    }
    ws = null;
  };
}
