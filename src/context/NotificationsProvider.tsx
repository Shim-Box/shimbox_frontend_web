// src/context/NotificationsProvider.tsx
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ApiService } from "../services/apiService";
import { ApprovedUser } from "../models/AdminModels";
import { AuthContext } from "./AuthContext";

type NoticeType = "info" | "warning" | "danger";

export interface Notice {
  id: string;
  type: NoticeType;
  title: string;
  message: string;
}

interface NotificationsContextValue {
  notices: Notice[];
  remove: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null
);

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx)
    throw new Error(
      "useNotifications must be used within <NotificationsProvider>"
    );
  return ctx;
};

const POLL_MS = 15000; // 15초
const DANGER_MS = 10 * 60_000; // 10분

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { token } = useContext(AuthContext);

  const [notices, setNotices] = useState<Notice[]>([]);
  const prevStatusRef = useRef<Map<number, string>>(new Map());
  const dangerSinceRef = useRef<Map<number, number>>(new Map());
  const dangerPersistNotifiedRef = useRef<Map<number, boolean>>(new Map());

  const push = (n: Notice) => {
    setNotices((prev) => [...prev, n]);
    setTimeout(() => remove(n.id), 6000);
  };

  const remove = (id: string) => {
    setNotices((prev) => prev.filter((x) => x.id !== id));
  };

  useEffect(() => {
    if (!token) return;

    let alive = true;

    const tick = async () => {
      try {
        const resp = await ApiService.fetchApprovedUsers({
          page: 1,
          size: 1000,
        });
        const list: ApprovedUser[] = resp.data ?? [];
        if (!alive) return;

        const now = Date.now();
        const prevStatus = prevStatusRef.current;
        const dangerSince = dangerSinceRef.current;
        const dangerPersistNotified = dangerPersistNotifiedRef.current;

        list.forEach((d) => {
          const current = d.conditionStatus;
          const prev = prevStatus.get(d.driverId);

          // 상태 변화 알림
          if (prev && prev !== current) {
            const key = `${prev}->${current}`;
            const important =
              key === "좋음->불안" ||
              key === "불안->위험" ||
              key === "좋음->위험";
            if (important) {
              const type: NoticeType =
                current === "위험"
                  ? "danger"
                  : current === "불안"
                  ? "warning"
                  : "info";

              push({
                id: `change-${d.driverId}-${now}`,
                type,
                title: `상태 변경: ${d.name}`,
                message: `${prev} ➜ ${current} (근무지: ${d.residence})`,
              });
            }
          }

          // 위험 지속 10분 체크
          if (current === "위험") {
            if (!dangerSince.has(d.driverId)) {
              dangerSince.set(d.driverId, now);
              dangerPersistNotified.set(d.driverId, false);
            } else {
              const enteredAt = dangerSince.get(d.driverId)!;
              const already = dangerPersistNotified.get(d.driverId) || false;
              if (!already && now - enteredAt >= DANGER_MS) {
                push({
                  id: `danger10-${d.driverId}-${now}`,
                  type: "danger",
                  title: `위험 지속: ${d.name}`,
                  message: `상태가 10분 이상 '위험'으로 유지되었습니다. (근무지: ${d.residence})`,
                });
                dangerPersistNotified.set(d.driverId, true);
              }
            }
          } else {
            dangerSince.delete(d.driverId);
            dangerPersistNotified.delete(d.driverId);
          }

          prevStatus.set(d.driverId, current);
        });

        const currentIds = new Set(list.map((d) => d.driverId));
        [...prevStatus.keys()].forEach((id) => {
          if (!currentIds.has(id)) {
            prevStatus.delete(id);
            dangerSince.delete(id);
            dangerPersistNotified.delete(id);
          }
        });
      } catch (e) {
      }
    };

    // 즉시 1회 + 인터벌
    tick();
    const iv = setInterval(tick, POLL_MS);

    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [token]);

  const value = useMemo(() => ({ notices, remove }), [notices]);

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};
