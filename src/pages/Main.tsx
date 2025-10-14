import React, { useEffect, useMemo, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/Main.css";
import DetailMap from "../components/DetailMap";
import { ApiService } from "../services/apiService";
import { ApprovedUser, DeliveryItem } from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";
import {
  connectLocationWS,
  LocationPayload,
  HealthPayload,
} from "../services/wsClient";

type DangerMode = "status" | "dangerOnly" | "id";
type StatusKey = "위험" | "불안" | "좋음" | "알수없음";

/** ─────────────────────────────
 * DEMO 토글: Manage와 동일 키 사용
 *  - "demo:forceState" === "1" 이면 주입 ON
 *  - 분포: [좋음,좋음,불안,불안,위험,위험] 을 앞 6명에 적용
 * ───────────────────────────── */
const DEMO_FLAG_KEY = "demo:forceState";
const DEMO_COUNT_KEY = "demo:forceCount";
const DEMO_DESIRED: StatusKey[] = [
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

/** 승인 목록(ApprovedUser[])에 DEMO 강제 상태 적용 */
function applyDemoToApproved(list: ApprovedUser[]): ApprovedUser[] {
  if (!isDemoOn()) return list;
  if (!Array.isArray(list) || list.length === 0) return list;

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

/** 우측 미니 카드용 타입 */
interface MiniDriverCard {
  driverId: number;
  name: string;
  residence: string;
  attendance?: string;
  status: StatusKey;
  profileImageUrl?: string | null;
  delivered: number;
  total: number;
}

/** 상태 정규화/순서/클래스 */
const toStatusKey = (s?: string): StatusKey => {
  if (s === "위험" || s === "불안" || s === "좋음") return s;
  return "알수없음";
};
const statusOrder: Record<StatusKey, number> = {
  위험: 0,
  불안: 1,
  좋음: 2,
  알수없음: 3,
};
const statusClassOf = (status: StatusKey): "good" | "warn" | "danger" => {
  switch (status) {
    case "위험":
      return "danger";
    case "불안":
      return "warn";
    case "좋음":
    default:
      return "good";
  }
};

/** products 응답에서 배송완료/전체 개수 계산 */
function summarizeProducts(items: DeliveryItem[]) {
  const total = Array.isArray(items) ? items.length : 0;
  const DONE_SET = new Set(["배송완료", "DELIVERED", "완료", "delivered"]);
  const delivered = Array.isArray(items)
    ? items.filter((it) => DONE_SET.has(String(it.shippingStatus).trim()))
        .length
    : 0;
  return { total, delivered };
}

const Main: React.FC = () => {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  // 상단 통계
  const [totalApproved, setTotalApproved] = useState<number>(0);
  const [onDutyCount, setOnDutyCount] = useState<number>(0);
  const [totalCompleted, setTotalCompleted] = useState<number>(0);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);

  // 우측 미니 카드 목록
  const [miniList, setMiniList] = useState<MiniDriverCard[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(false);

  // 정렬/필터 모드
  const [dangerMode, setDangerMode] = useState<DangerMode>("status");

  // 출근 중만 필터
  const workingList = useMemo(
    () => miniList.filter((m) => (m.attendance ?? "").trim() === "출근"),
    [miniList]
  );

  // 위험 기사 수
  const dangerCount = useMemo(
    () => workingList.filter((m) => m.status === "위험").length,
    [workingList]
  );
  const hasDanger = dangerCount > 0;

  // 화면에 노출되는 목록(출근 중 필터 → 모드별 정렬/필터)
  const shownList = useMemo(() => {
    let base = [...workingList];

    if (dangerMode === "dangerOnly") {
      base = base.filter((m) => m.status === "위험");
      base.sort((a, b) => {
        const ra = a.total ? a.delivered / a.total : 0;
        const rb = b.total ? b.delivered / b.total : 0;
        return rb - ra;
      });
    } else if (dangerMode === "id") {
      base.sort((a, b) => a.driverId - b.driverId);
    } else {
      base.sort((a, b) => {
        const sa = statusOrder[a.status] ?? 3;
        const sb = statusOrder[b.status] ?? 3;
        if (sa !== sb) return sa - sb;
        return a.name.localeCompare(b.name, "ko");
      });
    }
    return base;
  }, [workingList, dangerMode]);

  // 지도 마커 주소(현재 보여지는 카드 기준)
  const mapAddresses = useMemo(
    () => shownList.map((m) => m.residence || ""),
    [shownList]
  );

  // 패널 클릭 시 정렬/필터 모드 순환
  const cycleMode = () => {
    if (hasDanger) {
      setDangerMode((prev) =>
        prev === "status"
          ? "dangerOnly"
          : prev === "dangerOnly"
          ? "id"
          : "status"
      );
    } else {
      setDangerMode((prev) => (prev === "status" ? "id" : "status"));
    }
  };

  /** 상단 통계 로딩 (DEMO 적용) */
  useEffect(() => {
    if (!token) return;
    let mounted = true;

    (async () => {
      try {
        setLoadingStats(true);

        // 승인 목록
        const approvedRes = await ApiService.fetchApprovedUsers({
          page: 1,
          size: 1000,
        });
        let list: ApprovedUser[] = approvedRes.data ?? [];

        // 🔹 DEMO 강제 적용
        list = applyDemoToApproved(list);

        // 전체 기사 수
        const approvedCount = approvedRes.totalElements ?? list.length;

        // 출근자 수 (DEMO 반영된 값 기준)
        const onDuty = list.filter((d) => d.attendance === "출근").length;

        // 오늘 누적 배송(완료 합계)
        const completedCounts = await Promise.all(
          list.map(async (d) => {
            try {
              const items = await ApiService.fetchDriverAssignedProducts(
                d.driverId
              );
              const { delivered } = summarizeProducts(items);
              return delivered;
            } catch {
              return 0;
            }
          })
        );
        const completedSum = completedCounts.reduce((acc, n) => acc + n, 0);

        if (!mounted) return;
        setTotalApproved(approvedCount);
        setOnDutyCount(onDuty);
        setTotalCompleted(completedSum);
      } catch (e) {
        if (!mounted) return;
        setTotalApproved(0);
        setOnDutyCount(0);
        setTotalCompleted(0);
        console.error("메인 통계 로딩 실패:", e);
      } finally {
        if (mounted) setLoadingStats(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  /** 우측 미니 카드 목록 로딩 (DEMO 적용) */
  useEffect(() => {
    if (!token) return;
    let mounted = true;

    (async () => {
      try {
        setLoadingList(true);

        // 1) 승인된 기사들
        const approvedRes = await ApiService.fetchApprovedUsers({
          page: 1,
          size: 1000,
        });
        let list: ApprovedUser[] = approvedRes.data ?? [];

        // 🔹 DEMO 강제 적용
        list = applyDemoToApproved(list);

        // 2) 카드 모델로 기본 매핑
        const baseCards: MiniDriverCard[] = list.map((u) => ({
          driverId: u.driverId,
          name: u.name,
          residence: u.residence,
          attendance: u.attendance,
          status: toStatusKey(u.conditionStatus),
          profileImageUrl: u.profileImageUrl || null,
          delivered: 0,
          total: 0,
        }));

        // 3) 각 기사별 배정 상품 조회 → 배송건수 반영
        const enriched = await Promise.all(
          baseCards.map(async (card) => {
            try {
              const items = await ApiService.fetchDriverAssignedProducts(
                card.driverId
              );
              const { delivered, total } = summarizeProducts(items);
              return { ...card, delivered, total };
            } catch {
              return card;
            }
          })
        );

        if (!mounted) return;
        setMiniList(enriched);
      } catch (e) {
        if (!mounted) return;
        console.error("승인 목록/배송건수 로딩 실패:", e);
        setMiniList([]);
      } finally {
        if (mounted) setLoadingList(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  /** WebSocket (옵션) */
  useEffect(() => {
    if (!token) return;

    const disconnect = connectLocationWS({
      as: "web",
      region: "성북구",
      handlers: {
        onLocation: (_msg: { type: "location"; payload: LocationPayload }) => {
          // 필요시 지도/카드 갱신
        },
        onHealth: (_msg: { type: "health"; payload: HealthPayload }) => {
          // 필요시 상태 갱신
        },
      },
      reconnect: true,
      maxRetries: 5,
      retryDelayMs: 2000,
    });

    return () => {
      disconnect();
    };
  }, [token]);

  // Footer 검색 → Manage 이동
  const handleFooterSearch = (ff: FooterFilters, nq?: string) => {
    navigate("/manage", { state: { ff, nq } });
  };

  return (
    <div className="main-container">
      <Sidebar />

      <main className="main-content">
        {/* 통계 카드 + 위험 패널 */}
        <div className="stats">
          <div className="stat-card" aria-busy={loadingStats}>
            전체 기사 수
            <br />
            <strong>
              {loadingStats ? "…" : totalApproved.toLocaleString()}명
            </strong>
          </div>

          <div className="stat-card" aria-busy={loadingStats}>
            현재 배송 중
            <br />
            <strong>
              {loadingStats ? "…" : onDutyCount.toLocaleString()}명
            </strong>
          </div>

          <div className="stat-card" aria-busy={loadingStats}>
            오늘 누적 배송
            <br />
            <strong>
              {loadingStats ? "…" : totalCompleted.toLocaleString()}건
            </strong>
          </div>

          {/* 위험 패널 (정렬/필터 모드 전환용) */}
          <div
            className="stat-card warning clickable"
            role="button"
            tabIndex={0}
            onClick={cycleMode}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                cycleMode();
              }
            }}
            aria-pressed={dangerMode !== "status"}
          >
            <div className="danger-panel-content">
              <div className="danger-headline">
                {hasDanger
                  ? `⚠️ 위험한 택배기사가 ${dangerCount}명 있습니다`
                  : `⚠️ 위험한 택배기사가 없습니다`}
              </div>
            </div>
          </div>
        </div>

        {/* 지도 + 오른쪽 승인 기사 목록 (출근 중만) */}
        <div className="main-body">
          <div className="map-area">
            <DetailMap
              addresses={mapAddresses}
              level={7}
              markerImageUrls={shownList.map(() => "/images/driverMarker.png")}
              markerSize={{ width: 35, height: 45 }}
              onMarkerClick={() => {}}
            />
          </div>

          <aside className="right-side">
            {loadingList && (
              <div className="driver-mini-card">목록을 불러오는 중…</div>
            )}

            {!loadingList &&
              shownList.map((m) => {
                const ratio =
                  m.total > 0
                    ? Math.min(100, Math.round((m.delivered / m.total) * 100))
                    : 0;
                const statusClass = statusClassOf(m.status);

                return (
                  <div
                    key={m.driverId}
                    className={`driver-mini-card border-${statusClass}`}
                    onClick={() => navigate(`/driver/${m.driverId}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/driver/${m.driverId}`);
                      }
                    }}
                  >
                    <div className="mini-header">
                      <img
                        src={m.profileImageUrl || "/images/PostDeliver.png"}
                        alt="프로필"
                        className="mini-avatar"
                      />
                      <div className="mini-meta">
                        <div className="mini-name">
                          {m.name}{" "}
                          <span className={`mini-pill ${statusClass}`}>
                            {m.status}
                          </span>
                        </div>
                        <div className="mini-sub">{m.residence}</div>
                      </div>
                    </div>

                    <div className="mini-row">
                      <span className="mini-label">근무상태</span>
                      <span className="mini-value">{m.attendance ?? "-"}</span>
                    </div>

                    <div className="mini-row">
                      <span className="mini-label">배송 건수</span>
                      <span className="mini-value">
                        {m.delivered} / {m.total}
                      </span>
                    </div>

                    <div className="mini-progress">
                      <div
                        className={`mini-bar ${statusClass}`}
                        style={{ width: `${ratio}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </aside>
        </div>
      </main>

      <Footer onSearch={handleFooterSearch} />
    </div>
  );
};

export default Main;
