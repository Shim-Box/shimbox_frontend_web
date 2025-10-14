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

/** 폴링 주기 15초 */
const POLL_MS = 15000;
/** “위험 유지 재알림 5분. */
const DEFAULT_REPEAT_MS = 300000;

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { token } = useContext(AuthContext);

  const [notices, setNotices] = useState<Notice[]>([]);

  // 이전 상태 저장: driverId -> "좋음/불안/위험/..."
  const prevStatusRef = useRef<Map<number, string>>(new Map());
  // “위험으로 마지막으로 알린 시각” 저장
  const lastDangerNotifiedAtRef = useRef<Map<number, number>>(new Map());

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
        const lastDangerNotifiedAt = lastDangerNotifiedAtRef.current;

        const repeatMs = DEFAULT_REPEAT_MS;

        list.forEach((d) => {
          const current = d.conditionStatus;
          const prev = prevStatus.get(d.driverId);

          // 1) 상태 변화 알림 (좋음→불안 / 불안→위험 / 좋음→위험)
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

          // 2) 위험 진입/유지 로직: 처음 발견/변경 즉시 알림 + 주기적 재알림
          if (current === "위험") {
            const lastAt = lastDangerNotifiedAt.get(d.driverId) || 0;

            // (A) 새로 위험이 되었거나, (B) 위험 유지 중 재알림 간격 초과
            if (!prev || prev !== "위험" || now - lastAt >= repeatMs) {
              push({
                id: `${
                  !prev || prev !== "위험" ? "danger-enter" : "danger-repeat"
                }-${d.driverId}-${now}`,
                type: "danger",
                title:
                  !prev || prev !== "위험"
                    ? `위험 진입: ${d.name}`
                    : `위험 지속: ${d.name}`,
                message:
                  !prev || prev !== "위험"
                    ? `현재 상태 '위험'. (근무지: ${d.residence})`
                    : `상태 '위험' 지속 중. (근무지: ${d.residence})`,
              });
              lastDangerNotifiedAt.set(d.driverId, now);
            }
          } else {
            // 위험이 아니면 타이머 초기화
            lastDangerNotifiedAt.delete(d.driverId);
          }

          // 현재 상태 기억
          prevStatus.set(d.driverId, current);
        });

        // 사라진 기사 정리
        const currentIds = new Set(list.map((d) => d.driverId));
        [...prevStatus.keys()].forEach((id) => {
          if (!currentIds.has(id)) {
            prevStatus.delete(id);
            lastDangerNotifiedAt.delete(id);
          }
        });
      } catch {
        // 실패는 무시(다음 주기 재시도)
      }
    };

    // 즉시 1회 + 주기 폴링
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
