import React, { useEffect, useMemo, useState, useContext, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/Main.css";
import DetailMap from "../components/DetailMap";
import { ApiService } from "../services/apiService";
import {
  ApprovedUser,
  DeliveryItem,
  RealtimeHealthItem,
} from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";
import {
  connectLocationWS,
  LocationPayload,
  HealthPayload,
} from "../services/wsClient";

type DangerMode = "status" | "dangerOnly" | "id";
type StatusKey = "위험" | "불안" | "좋음" | "알수없음";
type LatLng = { lat: number; lng: number };

function summarizeProducts(items: DeliveryItem[]) {
  const total = Array.isArray(items) ? items.length : 0;
  const DONE_SET = new Set(["배송완료", "DELIVERED", "완료", "delivered"]);
  const delivered = Array.isArray(items)
    ? items.filter((it) => DONE_SET.has(String(it.shippingStatus).trim()))
        .length
    : 0;
  return { total, delivered };
}

interface MiniDriverCard {
  driverId: number;
  userId: string;
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

const statusClassOf = (status: StatusKey | "경고") =>
  status === "위험"
    ? "danger"
    : status === "불안" || status === "경고"
    ? "warn"
    : "good";

const PALETTE: Record<"good" | "warn" | "danger", string> = {
  good: "#61D5AB",
  warn: "#FFC069",
  danger: "#EE404C",
};

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

  const [regionOpen, setRegionOpen] = useState(false);
  const [selGu, setSelGu] = useState<string>("");

  // WS 위치
  const [wsLoc, setWsLoc] = useState<
    Record<string, { pos: LatLng; ts: number }>
  >({});

  //  건강/레벨 최신 상태(WS/REST 머지) — userId 키
  const [healthMap, setHealthMap] = useState<
    Record<
      string,
      {
        level: "좋음" | "경고" | "위험" | "알수없음";
        heartRate?: number;
        step?: number;
        capturedAt?: string;
      }
    >
  >({});

  // 상태 상승 애니메이션용 플래그
  const [pulseSet, setPulseSet] = useState<Set<number>>(new Set());
  const pulseTimer = useRef<number | null>(null);

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

  /** 지도 중심 이동용 주소 */
  const mapCenterAddress = useMemo(() => {
    if (regionDrivers.length > 0) return regionDrivers[0].residence || "";
    if (selGu) return `서울특별시 ${selGu}`;
    return "";
  }, [regionDrivers, selGu]);

  /** 확대 레벨 */
  const mapLevel = selGu ? 5 : 8;

  /** 우측 목록(출근자만) */
  const workingList = useMemo(
    () => miniList.filter((m) => (m.attendance ?? "").trim() === "출근"),
    [miniList]
  );

  const mergedWorking = useMemo(() => {
    return workingList.map((m) => {
      const live = healthMap[m.userId];
      const effectiveLevel: StatusKey | "경고" =
        (live?.level as any) || m.status || "알수없음";
      return {
        ...m,
        effectiveLevel: effectiveLevel,
        classKey: statusClassOf(effectiveLevel),
        heartRate: live?.heartRate,
        step: live?.step,
      };
    });
  }, [workingList, healthMap]);

  /** 위험 카운트 */
  const dangerCount = useMemo(
    () => mergedWorking.filter((m) => m.effectiveLevel === "위험").length,
    [mergedWorking]
  );
  const hasDanger = dangerCount > 0;

  /** 정렬 */
  const shownList = useMemo(() => {
    let base = [...mergedWorking];
    if (dangerMode === "dangerOnly") {
      base = base.filter((m) => m.effectiveLevel === "위험");
      base.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } else if (dangerMode === "id") {
      base.sort((a, b) => a.driverId - b.driverId);
    } else {
      // 위험 ▶ 경고/불안 ▶ 좋음 ▶ 알수없음
      const order = (lv: StatusKey | "경고") =>
        lv === "위험"
          ? 0
          : lv === "불안" || lv === "경고"
          ? 1
          : lv === "좋음"
          ? 2
          : 3;
      base.sort((a, b) => {
        const sa = order(a.effectiveLevel);
        const sb = order(b.effectiveLevel);
        return sa !== sb ? sa - sb : a.name.localeCompare(b.name, "ko");
      });
    }
    return base;
  }, [mergedWorking, dangerMode]);

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
          userId: String(u.userId),
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

  /** WS — 위치 & 건강 수신 */
  useEffect(() => {
    if (!token) return;

    const disconnect = connectLocationWS({
      as: "web",
      handlers: {
        onLocation: (msg: { type: "location"; payload: LocationPayload }) => {
          const p = msg.payload;
          if (typeof p?.lat !== "number" || typeof p?.lng !== "number") return;

          const key = String(p.driverId ?? "unknown");
          const lat: number = p.lat;
          const lng: number = p.lng;

          setWsLoc((prev) => ({
            ...prev,
            [key]: { pos: { lat, lng }, ts: Date.now() },
          }));
        },
        onHealth: (msg: { type: "health"; payload: HealthPayload }) => {
          const p = msg.payload as any;
          const kUser = p?.userId != null ? String(p.userId) : undefined;
          const kDriver = p?.driverId != null ? String(p.driverId) : undefined;
          let userKey = kUser;
          if (!userKey && kDriver) {
            const found = miniList.find((m) => String(m.driverId) === kDriver);
            if (found) userKey = found.userId;
          }
          if (!userKey) return;

          setHealthMap((prev) => {
            const prevRow = prev[userKey!];
            const prevTs = prevRow?.capturedAt
              ? Date.parse(prevRow.capturedAt)
              : -1;
            const newCaptured = p.recordedAt || p.capturedAt || "";
            const newTs = newCaptured ? Date.parse(newCaptured) : Date.now();

            if (prevTs !== -1 && newTs < prevTs) return prev;

            const serverLevel: string | undefined = p.level; // "좋음" | "경고" | "위험"
            const nextLevel: "좋음" | "경고" | "위험" | "알수없음" =
              serverLevel === "위험"
                ? "위험"
                : serverLevel === "경고"
                ? "경고"
                : serverLevel === "좋음"
                ? "좋음"
                : "알수없음";

            // 상태 상승 애니메이션 트리거 (좋음→경고/위험, 경고→위험)
            const rank = (lv: string) =>
              lv === "위험"
                ? 2
                : lv === "경고" || lv === "불안"
                ? 1
                : lv === "좋음"
                ? 0
                : -1;
            if (prevRow && rank(nextLevel) > rank(prevRow.level)) {
              setPulseSet((old) => {
                const ns = new Set(old);
                const found = miniList.find((m) => m.userId === userKey);
                if (found) ns.add(found.driverId);
                return ns;
              });
              if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
              pulseTimer.current = window.setTimeout(() => {
                setPulseSet((old) => new Set());
              }, 200);
            }

            return {
              ...prev,
              [userKey!]: {
                level: nextLevel,
                heartRate:
                  typeof p.heartRate === "number"
                    ? p.heartRate
                    : prevRow?.heartRate,
                step: typeof p.step === "number" ? p.step : prevRow?.step,
                capturedAt: newCaptured || prevRow?.capturedAt,
              },
            };
          });
        },
      },
      reconnect: true,
      maxRetries: 5,
      retryDelayMs: 2000,
    });

    return () => {
      disconnect();
      if (pulseTimer.current) {
        window.clearTimeout(pulseTimer.current);
        pulseTimer.current = null;
      }
    };
  }, [token, miniList]);

  useEffect(() => {
    if (!token) return;
    let alive = true;

    const tick = async () => {
      try {
        const rows: RealtimeHealthItem[] =
          await ApiService.fetchRealtimeHealth();
        if (!alive || !Array.isArray(rows)) return;

        setHealthMap((prev) => {
          const next = { ...prev };
          for (const r of rows) {
            const userKey = String(r.userId);
            const prevRow = next[userKey];
            const prevTs = prevRow?.capturedAt
              ? Date.parse(prevRow.capturedAt)
              : -1;
            const newTs = r.capturedAt ? Date.parse(r.capturedAt) : Date.now();
            if (prevTs !== -1 && newTs < prevTs) continue;

            const level =
              r.level === "위험"
                ? "위험"
                : r.level === "경고"
                ? "경고"
                : r.level === "좋음"
                ? "좋음"
                : "알수없음";

            next[userKey] = {
              level,
              heartRate: r.heartRate ?? prevRow?.heartRate,
              step: r.step ?? prevRow?.step,
              capturedAt: r.capturedAt ?? prevRow?.capturedAt,
            };
          }
          return next;
        });
      } catch (e) {}
    };

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [token]);

  /** 지도 마커 */
  const markerCoords = useMemo<LatLng[]>(() => {
    return regionDrivers
      .map((d) => wsLoc[String(d.driverId)]?.pos)
      .filter((p): p is LatLng => !!p);
  }, [regionDrivers, wsLoc]);

  const handleFooterSearch = (ff: FooterFilters, nq?: string) => {
    navigate("/manage", { state: { ff, nq } });
  };

  return (
    <div className="main-container">
      <Sidebar />
      <main className="main-content">
        {/* 상단: 지역 선택 + 통계 + 위험 배너 */}
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
            <div className="region-pill">{selGu ? selGu : "지역구 선택"}</div>
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
            className="stat-card warning"
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
                  ? `⚠️ 위험 상태인 택배기사가 ${dangerCount}명 있습니다`
                  : "⚠️ 현재는 위험 상태인 택배기사가 없습니다"}
              </div>
            </div>
          </div>
        </div>

        {/* 지도 + 우측 목록 */}
        <div className="main-body">
          <div className="map-area">
            <DetailMap
              // 지도 중심은 주소 보조로만, 마커는 WS 좌표 기반
              addresses={selGu ? [`서울특별시 ${selGu}`] : []}
              centerAddress={mapCenterAddress}
              level={mapLevel}
              // WS 좌표만큼 마커 아이콘
              coords={markerCoords}
              markerImageUrls={markerCoords.map(
                () => "/images/driverMarker.png"
              )}
              markerSize={{ width: 35, height: 45 }}
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

                const paletteKey = m.classKey as "good" | "warn" | "danger";
                const color = PALETTE[paletteKey];
                const pulse = pulseSet.has(m.driverId) ? " pulse" : "";

                return (
                  <div
                    key={m.driverId}
                    className={`driver-mini-card border-${m.classKey}${pulse}`}
                    style={{ borderColor: color }}
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
                          <span className="mini-dot" style={{ color }}>
                            ●
                          </span>{" "}
                          <span className="mini-status" style={{ color }}>
                            {m.effectiveLevel === "경고"
                              ? "불안"
                              : m.effectiveLevel}
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
                        className={`mini-bar ${m.classKey}`}
                        style={{ width: `${ratio}%`, background: color }}
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
                <option value="">지역구 선택</option>
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
