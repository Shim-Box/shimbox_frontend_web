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

const toStatusKey = (s?: string): StatusKey =>
  s === "위험" || s === "불안" || s === "좋음" ? s : "알수없음";

const statusOrder: Record<StatusKey, number> = {
  위험: 0,
  불안: 1,
  좋음: 2,
  알수없음: 3,
};

const statusClassOf = (status: StatusKey): "good" | "warn" | "danger" =>
  status === "위험" ? "danger" : status === "불안" ? "warn" : "good";

function summarizeProducts(items: DeliveryItem[]) {
  const total = Array.isArray(items) ? items.length : 0;
  const DONE_SET = new Set(["배송완료", "DELIVERED", "완료", "delivered"]);
  const delivered = Array.isArray(items)
    ? items.filter((it) => DONE_SET.has(String(it.shippingStatus).trim()))
        .length
    : 0;
  return { total, delivered };
}

const SEOUL_GU = [
  "구로구",
  "양천구",
  "강서구",
  "영등포구",
  "금천구",
  "동작구",
  "성북구",
  "강북구",
  "동대문구",
  "성동구",
  "종로구",
  "중구",
];

const Main: React.FC = () => {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  const [onDutyCount, setOnDutyCount] = useState<number>(0);
  const [totalCompleted, setTotalCompleted] = useState<number>(0);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);

  const [miniList, setMiniList] = useState<MiniDriverCard[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(false);

  const [dangerMode, setDangerMode] = useState<DangerMode>("status");

  // 지역 선택
  const [regionOpen, setRegionOpen] = useState(false);
  const [selGu, setSelGu] = useState<string>("");

  /** 지도에는 '출근'만 표시 */
  const onDutyForMap = useMemo(
    () => miniList.filter((m) => (m.attendance ?? "").trim() === "출근"),
    [miniList]
  );

  /** 선택 구 기사만 */
  const regionDrivers = useMemo(
    () =>
      !selGu
        ? onDutyForMap
        : onDutyForMap.filter((m) => (m.residence || "").includes(selGu)),
    [onDutyForMap, selGu]
  );

  /** 지도에 줄 주소(마커) */
  const mapAddresses = useMemo(
    () => regionDrivers.map((m) => m.residence || ""),
    [regionDrivers]
  );

  /** 중심 주소: 선택 구에 기사 없으면 '서울특별시 {구}'로 이동 */
  const mapCenterAddress = useMemo(() => {
    if (regionDrivers.length > 0) return regionDrivers[0].residence || "";
    if (selGu) return `서울특별시 ${selGu}`;
    return ""; // DetailMap 쪽에서 기본값 처리
  }, [regionDrivers, selGu]);

  /** 확대 레벨: 구 선택 시 1km 근처(대략 level 5), 아니면 7 */
  const mapLevel = selGu ? 5 : 8;

  /** 우측 목록(출근자만) */
  const workingList = useMemo(
    () => miniList.filter((m) => (m.attendance ?? "").trim() === "출근"),
    [miniList]
  );

  const dangerCount = useMemo(
    () => workingList.filter((m) => m.status === "위험").length,
    [workingList]
  );
  const hasDanger = dangerCount > 0;

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
        return sa !== sb ? sa - sb : a.name.localeCompare(b.name, "ko");
      });
    }
    return base;
  }, [workingList, dangerMode]);

  const cycleMode = () => {
    if (hasDanger)
      setDangerMode((p) =>
        p === "status" ? "dangerOnly" : p === "dangerOnly" ? "id" : "status"
      );
    else setDangerMode((p) => (p === "status" ? "id" : "status"));
  };

  /** 상단 통계 */
  useEffect(() => {
    if (!token) return;
    let mounted = true;
    (async () => {
      try {
        setLoadingStats(true);
        const approvedRes = await ApiService.fetchApprovedUsers({
          page: 1,
          size: 1000,
        });
        const list: ApprovedUser[] = approvedRes.data ?? [];
        const onDuty = list.filter((d) => d.attendance === "출근").length;
        const completedCounts = await Promise.all(
          list.map(async (d) => {
            try {
              const items = await ApiService.fetchDriverAssignedProducts(
                d.driverId
              );
              return summarizeProducts(items).delivered;
            } catch {
              return 0;
            }
          })
        );
        const completedSum = completedCounts.reduce((a, n) => a + n, 0);
        if (!mounted) return;
        setOnDutyCount(onDuty);
        setTotalCompleted(completedSum);
      } catch (e) {
        if (!mounted) return;
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

  /** 승인 목록 → 카드화 */
  useEffect(() => {
    if (!token) return;
    let mounted = true;
    (async () => {
      try {
        setLoadingList(true);
        const approvedRes = await ApiService.fetchApprovedUsers({
          page: 1,
          size: 1000,
        });
        const list: ApprovedUser[] = approvedRes.data ?? [];
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

  /** (옵션) WebSocket */
  useEffect(() => {
    if (!token) return;
    const disconnect = connectLocationWS({
      as: "web",
      region: "성북구",
      handlers: {
        onLocation: (_msg: {
          type: "location";
          payload: LocationPayload;
        }) => {},
        onHealth: (_msg: { type: "health"; payload: HealthPayload }) => {},
      },
      reconnect: true,
      maxRetries: 5,
      retryDelayMs: 2000,
    });
    return () => {
      disconnect();
    };
  }, [token]);

  const handleFooterSearch = (ff: FooterFilters, nq?: string) => {
    navigate("/manage", { state: { ff, nq } });
  };

  return (
    <div className="main-container">
      <Sidebar />
      <main className="main-content">
        {/* 상단: 지역 선택 카드 + 통계 + 위험 패널 */}
        <div className="stats">
          <div
            className="stat-card region-card"
            onClick={() => setRegionOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setRegionOpen(true);
              }
            }}
          >
            <div className="region-title">
              클릭해 기사분의 위치를 확인하세요
            </div>
            <div className="region-pill">{selGu ? selGu : "구 선택"}</div>
          </div>

          <div className="stat-card" aria-busy={loadingStats}>
            현재 배송 중 기사 수
            <br />
            <strong>
              {loadingStats ? "…" : onDutyCount.toLocaleString()}명
            </strong>
          </div>

          <div className="stat-card" aria-busy={loadingStats}>
            오늘 누적 배송 건수
            <br />
            <strong>
              {loadingStats ? "…" : totalCompleted.toLocaleString()}건
            </strong>
          </div>

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

        {/* 지도 + 오른쪽 승인 기사 목록 */}
        <div className="main-body">
          <div className="map-area">
            <DetailMap
              addresses={mapAddresses}
              centerAddress={mapCenterAddress}
              level={mapLevel}
              markerImageUrls={regionDrivers.map(
                () => "/images/driverMarker.png"
              )}
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

      {/* 지역 선택 모달 */}
      {regionOpen && (
        <div className="rf-backdrop" role="dialog" aria-modal="true">
          <div className="rf-modal">
            <button
              className="rf-close"
              aria-label="닫기"
              onClick={() => setRegionOpen(false)}
            >
              ×
            </button>
            <div className="rf-title">
              지역을 선택해 원하는 위치의 기사분을 확인하세요.
            </div>
            <div className="rf-row">
              <select className="rf-select" value="서울특별시" disabled>
                <option>서울특별시</option>
              </select>
              <select
                className="rf-select"
                value={selGu}
                onChange={(e) => setSelGu(e.target.value)}
              >
                <option value="">구 선택</option>
                {SEOUL_GU.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
            <button className="rf-primary" onClick={() => setRegionOpen(false)}>
              완료
            </button>
          </div>
        </div>
      )}

      <Footer onSearch={handleFooterSearch} />
    </div>
  );
};

export default Main;
