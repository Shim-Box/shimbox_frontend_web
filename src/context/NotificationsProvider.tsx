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

/* ───── DEMO 인식 (Main과 동일 키) ───── */
const DEMO_FLAG_KEY = "demo:forceState";
const DEMO_COUNT_KEY = "demo:forceCount";
const DEMO_DESIRED: Array<"좋음" | "불안" | "위험"> = [
  "좋음",
  "좋음",
  "불안",
  "불안",
  "위험",
  "위험",
];

function isDemoOn() {
  return (
    typeof window !== "undefined" && localStorage.getItem(DEMO_FLAG_KEY) === "1"
  );
}
function applyDemoToApproved(list: ApprovedUser[]): ApprovedUser[] {
  if (!isDemoOn() || !Array.isArray(list) || list.length === 0) return list;
  const want = Number(localStorage.getItem(DEMO_COUNT_KEY) || 6);
  const take = Math.min(want, DEMO_DESIRED.length, list.length);
  const cloned = list.map((u) => ({ ...u }));
  for (let i = 0; i < take; i++) {
    cloned[i].attendance = "출근";
    cloned[i].conditionStatus = DEMO_DESIRED[i] as any;
    cloned[i].workTime = cloned[i].workTime || "금일 4시간";
    cloned[i].deliveryStats = cloned[i].deliveryStats || "42건";
  }
  return cloned;
}

/* ───── 알림 로직 ───── */
const POLL_MS = 15000; // 15초
const DEFAULT_REPEAT_MS = 300000; // 5

export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const { token } = useContext(AuthContext);

  const [notices, setNotices] = useState<Notice[]>([]);
  const prevStatusRef = useRef<Map<number, string>>(new Map());
  const dangerSinceRef = useRef<Map<number, number>>(new Map());
  const lastDangerNotifiedAtRef = useRef<Map<number, number>>(new Map());

  const push = (n: Notice) => setNotices((prev) => [...prev, n]);
  const remove = (id: string) =>
    setNotices((prev) => prev.filter((x) => x.id !== id));

  // 콘솔 수동 테스트용
  useEffect(() => {
    (window as any).testNotice = (type: NoticeType = "danger") => {
      const now = Date.now();
      push({
        id: `manual-${now}`,
        type,
        title:
          type === "danger"
            ? "위험 알림(테스트)"
            : type === "warning"
            ? "경고(테스트)"
            : "정보(테스트)",
        message: new Date(now).toLocaleString("ko-KR"),
      });
    };
    return () => {
      delete (window as any).testNotice;
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;

    const tick = async () => {
      try {
        const resp = await ApiService.fetchApprovedUsers({
          page: 1,
          size: 1000,
        });
        let list: ApprovedUser[] = applyDemoToApproved(resp.data ?? []);
        if (!alive) return;

        const now = Date.now();
        const prevStatus = prevStatusRef.current;
        const dangerSince = dangerSinceRef.current;
        const lastDangerNotifiedAt = lastDangerNotifiedAtRef.current;

        // 설정값
        const firstDangerFlag =
          localStorage.getItem("notify:firstDanger") === "1";
        const repeatMs = (() => {
          const raw = localStorage.getItem("notify:intervalMs");
          const n = raw ? parseInt(raw, 10) : NaN;
          return Number.isFinite(n) && n > 0 ? n : DEFAULT_REPEAT_MS;
        })();

        list.forEach((d) => {
          const current = d.conditionStatus; // "좋음" | "불안" | "위험"
          const prev = prevStatus.get(d.driverId);

          // 1) 상태 변화 알림 (여기서만 전이 알림 수행)
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

          // 2) 위험 유지/초기 진입 처리
          if (current === "위험") {
            if (prev === "위험") {
              // 유지 중 → 재알림 주기 체크
              if (!dangerSince.has(d.driverId))
                dangerSince.set(d.driverId, now);
              const lastAt = lastDangerNotifiedAt.get(d.driverId) || 0;
              if (now - lastAt >= repeatMs) {
                push({
                  id: `danger-repeat-${d.driverId}-${now}`,
                  type: "danger",
                  title: `위험 지속: ${d.name}`,
                  message: `상태 '위험' 지속 중. (근무지: ${d.residence})`,
                });
                lastDangerNotifiedAt.set(d.driverId, now);
              }
            } else if (prev === "좋음" || prev === "불안") {
              // 전이 알림에서 이미 발사됐으므로 여기서는 중복 방지(아무것도 안 함)
              lastDangerNotifiedAt.set(d.driverId, now);
              dangerSince.set(d.driverId, now);
            } else if (!prev) {
              // 첫 로드에서 이전값 없음 → 옵션에 따라 한 번만
              if (firstDangerFlag) {
                push({
                  id: `danger-first-${d.driverId}-${now}`,
                  type: "danger",
                  title: `위험(처음부터): ${d.name}`,
                  message: `근무 시작부터 상태 '위험'. (근무지: ${d.residence})`,
                });
                lastDangerNotifiedAt.set(d.driverId, now);
                dangerSince.set(d.driverId, now);
              }
            }
          } else {
            // 위험 해제 → 타이머/플래그 초기화
            dangerSince.delete(d.driverId);
            lastDangerNotifiedAt.delete(d.driverId);
          }

          // 현재 상태 저장
          prevStatus.set(d.driverId, current);
        });

        // 목록에서 사라진 기사 정리
        const currentIds = new Set(list.map((d) => d.driverId));
        [...prevStatus.keys()].forEach((id) => {
          if (!currentIds.has(id)) {
            prevStatus.delete(id);
            dangerSince.delete(id);
            lastDangerNotifiedAt.delete(id);
          }
        });
      } catch {
        // 실패는 무시
      }
    };

    // 즉시 1회 + 주기
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
