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

/** 우측 미니 카드용 타입 */
interface MiniDriverCard {
  driverId: number;
  name: string;
  residence: string;
  attendance?: string; // 출근/퇴근/출근전
  status: StatusKey;
  profileImageUrl?: string | null;
  delivered: number; // 배송완료 개수
  total: number; // 전체 배정 개수
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
  const { token } = useContext(AuthContext); // 토큰 존재 여부로 로딩 제어만 사용
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

  /** 상단 통계 로딩 */
  useEffect(() => {
    if (!token) return; // 로그인 전이면 호출 안 함
    let mounted = true;

    (async () => {
      try {
        setLoadingStats(true);

        // 승인 목록 (통계용)
        const approvedRes = await ApiService.fetchApprovedUsers({
          page: 1,
          size: 1000,
        });
        const list: ApprovedUser[] = approvedRes.data ?? [];

        // 전체 기사 수
        const approvedCount = approvedRes.totalElements ?? list.length;

        // 출근자 수
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

  /** 우측 미니 카드 목록 로딩 (승인 목록 + 각 기사별 배송건수 합산) */
  useEffect(() => {
    if (!token) return;
    let mounted = true;

    (async () => {
      try {
        setLoadingList(true);

        // 1) 승인된 기사들 가져오기
        const approvedRes = await ApiService.fetchApprovedUsers({
          page: 1,
          size: 1000,
        });
        const list: ApprovedUser[] = approvedRes.data ?? [];

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

  /** ✅ WebSocket 연결 (as=web, region=성북구). 상태 업데이트는 필요 시 onLocation/onHealth 내에서 처리 */
  useEffect(() => {
    if (!token) return;

    // 토큰은 wsClient 내부에서 local/sessionStorage 를 읽어 붙이도록 구성했으므로
    // 별도로 넘길 필요 없음. (buildUrl 내부에서 token 쿼리 생성)
    const disconnect = connectLocationWS({
      as: "web",
      region: "성북구",
      handlers: {
        onLocation: (msg: { type: "location"; payload: LocationPayload }) => {
          // console.log("WS location:", msg);
          // 필요 시 지도/미니카드 상태 갱신 로직 추가
        },
        onHealth: (msg: { type: "health"; payload: HealthPayload }) => {
          // console.log("WS health:", msg);
          // 필요 시 위험 판단/배지 업데이트 등 추가
        },
      },
      // 필요시 재연결 옵션
      reconnect: true,
      maxRetries: 5,
      retryDelayMs: 2000,
    });

    // 반환된 것은 cleanup 함수이므로 그대로 호출만 해 주면 됩니다.
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
