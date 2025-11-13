import React, { useEffect, useMemo, useState, useContext, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/Main.css";
import DetailMap from "../components/DetailMap";
import { ApiService, RealtimeLocationItem } from "../services/apiService";
import { ApprovedUser, DeliveryItem, RealtimeHealthItem } from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";
import { connectLocationWS, LocationPayload, HealthPayload, sanitizeRegion } from "../services/wsClient";

type DangerMode = "status" | "dangerOnly" | "id";
type StatusKey = "위험" | "좋음" | "알수없음";
type LatLng = { lat: number; lng: number };

function summarizeProducts(items: DeliveryItem[]) {
  const total = Array.isArray(items) ? items.length : 0;
  const DONE_SET = new Set(["배송완료", "DELIVERED", "완료", "delivered"]);
  const delivered = Array.isArray(items)
    ? items.filter((it) => DONE_SET.has(String(it.shippingStatus).trim())).length
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

type WorkingCard = MiniDriverCard & {
  effectiveLevel: StatusKey;
  classKey: "good" | "danger";
  heartRate?: number;
  step?: number;
  _flags?: { isFatigue?: boolean; isFall?: boolean };
};

const toStatusKey = (s?: string): StatusKey =>
  s === "위험" || s === "좋음" ? s : "알수없음";

const statusClassOf = (status: StatusKey) => (status === "위험" ? "danger" : "good");

const PALETTE: Record<"good" | "danger", string> = {
  good: "#61D5AB",
  danger: "#EE404C",
};

const MARKER_IMG: Record<"good" | "danger", string> = {
  good: "/images/driverMarker.png",
  danger: "/images/dangerMarker.png",
};

const SEOUL_GU = [
  "구로구","양천구","강서구","영등포구","금천구","동작구",
  "성북구","강북구","동대문구","성동구","종로구","중구",
];

const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

  // 위험 팝업
  const [dangerModalOpen, setDangerModalOpen] = useState(false);
  const lastDangerCountRef = useRef(0);

  // 애니메이션 동기화 epoch
  const dangerEpochRef = useRef<number | null>(null);

  // 지도 위치 캐시
  const [wsLoc, setWsLoc] = useState<Record<string, { pos: LatLng; ts: number; driverId?: number; userId?: string }>>({});

  // 건강 상태 + 플래그(피로/낙상)
  const [healthMap, setHealthMap] = useState<
    Record<string, {
      level: "위험" | "좋음" | "알수없음";
      heartRate?: number;
      step?: number;
      capturedAt?: string;
      isFallDetected?: boolean;
      isFatigueDanger?: boolean;
    }>
  >({});

  const [pulseSet, setPulseSet] = useState<Set<number>>(new Set());
  const pulseTimer = useRef<number | null>(null);

  // 시연용 토스트
  type EventToast = {
    id: string;
    kind: "fatigue" | "fall";
    userId: string;
    driverId?: number;
    name?: string;
    at: number;
  };
  const [toasts, setToasts] = useState<EventToast[]>([]);
  const toastTimerRef = useRef<number | null>(null);
  const TOAST_MS = 1800;

  const pushToast = useCallback((t: EventToast) => setToasts((q) => [...q, t]), []);

  useEffect(() => {
    if (toasts.length === 0 || toastTimerRef.current) return;
    toastTimerRef.current = window.setTimeout(() => {
      setToasts((q) => q.slice(1));
      toastTimerRef.current = null;
    }, TOAST_MS) as unknown as number;
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
        toastTimerRef.current = null;
      }
    };
  }, [toasts]);

  const mapLevel = selGu ? 5 : 7;

  const workingList = useMemo(
    () => miniList.filter((m) => (m.attendance ?? "").trim() === "출근"),
    [miniList]
  );

  // healthMap 기반 병합
  const mergedWorking = useMemo<WorkingCard[]>(() => {
    return workingList.map((m) => {
      const live = healthMap[m.userId];
      const isFall = !!live?.isFallDetected;
      const isFatigue = !!live?.isFatigueDanger;
      const forcedDanger = isFall || isFatigue;

      const baseLevel: StatusKey =
        forcedDanger ? "위험" : (live?.level ?? m.status ?? "알수없음");

      return {
        ...m,
        effectiveLevel: baseLevel,
        classKey: statusClassOf(baseLevel),
        heartRate: live?.heartRate,
        step: live?.step,
        _flags: { isFall, isFatigue },
      };
    });
  }, [workingList, healthMap]);

  const dangerCards = useMemo(() => mergedWorking.filter((m) => m.effectiveLevel === "위험"), [mergedWorking]);
  const dangerCount = dangerCards.length;
  const hasDanger = dangerCount > 0;

  const fallCount = useMemo(() => mergedWorking.filter(m => m._flags?.isFall).length, [mergedWorking]);
  const hasFall = fallCount > 0;

  const shownList = useMemo(() => {
    let base = [...mergedWorking];
    if (dangerMode === "dangerOnly") {
      base = base.filter((m) => m.effectiveLevel === "위험");
      base.sort((a, b) => a.name.localeCompare(b.name, "ko"));
    } else if (dangerMode === "id") {
      base.sort((a, b) => a.driverId - b.driverId);
    } else {
      const order = (lv: StatusKey) => (lv === "위험" ? 0 : lv === "좋음" ? 1 : 2);
      base.sort((a, b) => {
        const sa = order(a.effectiveLevel); const sb = order(b.effectiveLevel);
        return sa !== sb ? sa - sb : a.name.localeCompare(b.name, "ko");
      });
    }
    return base;
  }, [mergedWorking, dangerMode]);

  const cycleMode = () => {
    if (hasDanger) setDangerMode((p) => (p === "status" ? "dangerOnly" : p === "dangerOnly" ? "id" : "status"));
    else setDangerMode((p) => (p === "status" ? "id" : "status"));
  };

  // 위험 팝업 트리거
  useEffect(() => {
    if (dangerCount > 0 && lastDangerCountRef.current === 0) setDangerModalOpen(true);
    lastDangerCountRef.current = dangerCount;
  }, [dangerCount]);

  // 애니메이션 동기화 epoch
  useEffect(() => {
    if (hasDanger && !dangerEpochRef.current) dangerEpochRef.current = Date.now();
    if (!hasDanger) dangerEpochRef.current = null;
  }, [hasDanger]);

  // 승인목록 + 통계
  useEffect(() => {
    if (!token) return;
    let alive = true;

    (async () => {
      try {
        setLoadingStats(true);
        setLoadingList(true);
        const approvedRes = await ApiService.fetchApprovedUsers({ page: 1, size: 1000 });
        const list: ApprovedUser[] = approvedRes.data ?? [];
        const onDuty = list.filter((d) => d.attendance === "출근").length;

        const cards: MiniDriverCard[] = await Promise.all(
          list.map(async (u) => {
            let delivered = 0; let total = 0;
            try {
              const items = await ApiService.fetchDriverAssignedProducts(u.driverId);
              const s = summarizeProducts(items);
              delivered = s.delivered; total = s.total;
            } catch {}
            return {
              driverId: u.driverId,
              userId: String(u.userId),
              name: u.name,
              residence: u.residence,
              attendance: u.attendance,
              status: toStatusKey(u.conditionStatus),
              profileImageUrl: u.profileImageUrl || null,
              delivered, total,
            };
          })
        );

        if (!alive) return;
        setOnDutyCount(onDuty);
        setTotalCompleted(cards.reduce((acc, c) => acc + c.delivered, 0));
        setMiniList(cards);
      } catch {
        if (!alive) return;
        setOnDutyCount(0); setTotalCompleted(0); setMiniList([]);
      } finally {
        if (!alive) return;
        setLoadingStats(false); setLoadingList(false);
      }
    })();

    return () => { alive = false; };
  }, [token]);

  // userId -> driverId 매핑
  const userToDriverId = useMemo(
    () => Object.fromEntries(miniList.map((m) => [m.userId, m.driverId] as const)),
    [miniList]
  );

  // 위치 스냅샷 시드
  useEffect(() => {
    if (!token) return;
    let alive = true;

    (async () => {
      try {
        const regionGu = sanitizeRegion(selGu || undefined);
        const rows: RealtimeLocationItem[] = await ApiService.fetchRealtimeLocations(regionGu);
        if (!alive || !Array.isArray(rows)) return;

        const now = Date.now();
        const seeded: Record<string, { pos: LatLng; ts: number; driverId?: number; userId?: string }> = {};
        for (const r of rows) {
          const did = Number((r as any)?.driverId);
          if (!Number.isFinite(did)) continue;
          if (typeof r?.lat !== "number" || typeof r?.lng !== "number") continue;

          const ts =
            (r as any)?.updatedAt ? Date.parse((r as any).updatedAt) :
            (r as any)?.capturedAt ? Date.parse((r as any).capturedAt) : now;

          seeded[String(did)] = {
            pos: { lat: r.lat, lng: r.lng },
            ts,
            driverId: did,
            userId: (r as any)?.userId != null ? String((r as any).userId) : undefined,
          };
        }

        setWsLoc((prev) => {
          const next = { ...prev };
          for (const [k, v] of Object.entries(seeded)) {
            if (!next[k] || v.ts >= next[k].ts) next[k] = v;
          }
          return next;
        });
      } catch {}
    })();

    return () => { alive = false; };
  }, [token, selGu]);

  // WS — 위치 & 건강
  useEffect(() => {
    if (!token) return;

    const disconnect = connectLocationWS({
      as: "web",
      region: selGu || undefined,
      handlers: {
        onLocation: ({ payload: p }: { type: "location"; payload: LocationPayload }) => {
          if (typeof p?.lat !== "number" || typeof p?.lng !== "number") return;

          // 서버 신뢰 + 최소 보정(userId 숫자 → driverId)
          let did: number | undefined =
            typeof p?.driverId === "number" ? p.driverId
            : (p?.userId != null ? Number(p.userId) : undefined);

          // miniList 매핑이 있으면 우선
          if (p?.userId != null) {
            const mapped = userToDriverId[String(p.userId)];
            if (mapped != null) did = mapped;
          }

          const key = did != null ? String(did) : (p?.userId != null ? `u:${String(p.userId)}` : `${p.lat},${p.lng}`);

          setWsLoc((prev) => ({
            ...prev,
            [key]: {
              pos: { lat: p.lat!, lng: p.lng! },
              ts: Date.now(),
              driverId: did,
              userId: p?.userId ? String(p.userId) : undefined,
            },
          }));
        },
        onHealth: ({ payload: p }: { type: "health"; payload: HealthPayload }) => {
          // 서버 신뢰 + 최소 보정(userId 숫자 → driverId)
          let userKey = p?.userId != null ? String(p.userId) : undefined;
          if (!userKey) return;

          let drvId: number | undefined =
            typeof p?.driverId === "number" ? p.driverId
            : (Number.isFinite(Number(userKey)) ? Number(userKey) : undefined);

          // 매핑 우선
          if (!drvId) {
            const mapped = userToDriverId[userKey];
            if (mapped != null) drvId = mapped;
          }

          setHealthMap((prev) => {
            const prevRow = prev[userKey!];
            const prevTs = prevRow?.capturedAt ? Date.parse(prevRow.capturedAt) : -1;
            const newCaptured = p.recordedAt || p.capturedAt || "";
            const newTs = newCaptured ? Date.parse(newCaptured) : Date.now();
            if (prevTs !== -1 && newTs < prevTs) return prev;

            // 플래그
            const nextFall = typeof p.isFallDetected === "boolean" ? p.isFallDetected : (prevRow?.isFallDetected ?? false);
            const rawScore: number | undefined =
              typeof p.fatigueScore === "number" ? p.fatigueScore
              : (typeof p.score === "number" ? p.score : undefined);
            const nextFatigue = rawScore != null ? rawScore >= 0.7 : (prevRow?.isFatigueDanger ?? false);

            const serverLevel: string | undefined = p.level;
            const nextLevel: StatusKey =
              (nextFall || nextFatigue) ? "위험"
              : serverLevel === "위험" ? "위험"
              : serverLevel === "좋음" ? "좋음"
              : "알수없음";

            // 승격 펄스
            if (prevRow) {
              const rank = (lv: StatusKey) => (lv === "위험" ? 2 : lv === "좋음" ? 1 : 0);
              if (rank(nextLevel) > rank(prevRow.level) && drvId !== undefined) {
                setPulseSet((old) => new Set(old).add(drvId!));
                if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
                pulseTimer.current = window.setTimeout(() => setPulseSet(new Set()), 200);
              }
            }

            // 토스트 (상태 상승 시)
            if (!prevRow?.isFatigueDanger && nextFatigue) {
              const drv = miniList.find((x) => x.userId === userKey!);
              const name = drv?.name;
              const at = newTs;
              pushToast({ id: `fatigue-${userKey}-${at}-${genId()}`, kind: "fatigue", userId: userKey!, driverId: drv?.driverId ?? drvId, name, at });
            }
            if (!prevRow?.isFallDetected && nextFall) {
              const drv = miniList.find((x) => x.userId === userKey!);
              const name = drv?.name;
              const at = newTs;
              pushToast({ id: `fall-${userKey}-${at}-${genId()}`, kind: "fall", userId: userKey!, driverId: drv?.driverId ?? drvId, name, at });
            }

            return {
              ...prev,
              [userKey!]: {
                level: nextLevel,
                heartRate: typeof p.heartRate === "number" ? p.heartRate : prevRow?.heartRate,
                step: typeof p.step === "number" ? p.step : prevRow?.step,
                capturedAt: newCaptured || prevRow?.capturedAt,
                isFallDetected: nextFall,
                isFatigueDanger: nextFatigue,
              },
            };
          });
        },
      },
      reconnect: true,
      maxRetries: 3,
      retryDelayMs: 2000,
    });

    return () => {
      disconnect();
      if (pulseTimer.current) {
        window.clearTimeout(pulseTimer.current);
        pulseTimer.current = null;
      }
    };
  }, [token, miniList, selGu, userToDriverId, pushToast]);

  // 오래된 WS 좌표 정리
  useEffect(() => {
    const TTL = 90_000;
    const id = window.setInterval(() => {
      setWsLoc((prev) => {
        const now = Date.now();
        const next: typeof prev = {};
        for (const [k, v] of Object.entries(prev)) {
          if (now - v.ts <= TTL) next[k] = v;
        }
        return next;
      });
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  // 건강 스냅샷 폴링 (스냅샷은 낙상 플래그가 없을 수 있으니 기존값 유지)
  useEffect(() => {
    if (!token) return;
    let alive = true;

    const tick = async () => {
      try {
        const regionGu = sanitizeRegion(selGu || undefined);
        const rows: RealtimeHealthItem[] = await ApiService.fetchRealtimeHealth(regionGu);
        if (!alive || !Array.isArray(rows)) return;
        setHealthMap((prev) => {
          const next = { ...prev };
          for (const r of rows) {
            const userKey = String(r.userId);
            const prevRow = next[userKey];
            const prevTs = prevRow?.capturedAt ? Date.parse(prevRow.capturedAt) : -1;
            const newTs = r.capturedAt ? Date.parse(r.capturedAt) : Date.now();
            if (prevTs !== -1 && newTs < prevTs) continue;

            let level: StatusKey =
              r.level === "위험" ? "위험" : r.level === "좋음" ? "좋음" : "알수없음";

            next[userKey] = {
              level,
              heartRate: r.heartRate ?? prevRow?.heartRate,
              step: r.step ?? prevRow?.step,
              capturedAt: r.capturedAt ?? prevRow?.capturedAt,
              isFallDetected: prevRow?.isFallDetected,
              isFatigueDanger: prevRow?.isFatigueDanger,
            };
          }
          return next;
        });
      } catch {}
    };

    tick();
    const id = window.setInterval(tick, 30_000);
    return () => { alive = false; window.clearInterval(id); };
  }, [token, selGu]);

  // 지도 마커
  type Marker = { pos: LatLng; color: "good" | "danger" };
  const markers: Marker[] = useMemo(() => {
    const list: Marker[] = [];
    for (const v of Object.values(wsLoc)) {
      let did = v.driverId;
      if (did == null && v.userId) {
        const n = Number(v.userId);
        if (Number.isFinite(n)) did = n;
      }
      if (did == null && v.userId) {
        const mapped = userToDriverId[v.userId];
        if (mapped != null) did = mapped;
      }

      let color: "good" | "danger" = "good";
      if (did != null) {
        const card = mergedWorking.find((m) => m.driverId === did);
        if (card?.effectiveLevel === "위험") color = "danger";
      }
      list.push({ pos: v.pos, color });
    }
    return list;
  }, [wsLoc, mergedWorking, userToDriverId]);

  const markerCoords = useMemo<LatLng[]>(() => markers.map((m) => m.pos), [markers]);
  const markerImages = useMemo<string[]>(() => markers.map((m) => MARKER_IMG[m.color]), [markers]);

  const handleFooterSearch = (ff: FooterFilters, nq?: string) => {
    navigate("/manage", { state: { ff, nq } });
  };

  const dangerSyncDelay = useMemo(() => {
    const D = 1600;
    if (!dangerEpochRef.current) return "0s";
    const phase = (Date.now() - dangerEpochRef.current) % D;
    return `-${(phase / 1000).toFixed(3)}s`;
  }, [hasDanger]);

  return (
    <div className="main-container" style={{ ["--danger-sync" as any]: dangerSyncDelay }}>
      <Sidebar />
      <main className="main-content">
        {/* 상단: 지역 선택 + 통계 + 위험 배너 */}
        <div className="stats">
          <div
            className="stat-card region-card"
            onClick={() => setRegionOpen(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setRegionOpen(true);} }}
          >
            <div className="region-title">클릭해 기사의 위치를 확인하세요</div>
            <div className="region-pill">{selGu ? selGu : "지역구 선택"}</div>
          </div>

          <div className="stat-card" aria-busy={loadingStats}>
            현재 배송 중 기사 수
            <br /><strong>{loadingStats ? "…" : onDutyCount.toLocaleString()}명</strong>
          </div>

          <div className="stat-card" aria-busy={loadingStats}>
            오늘 누적 배송 건수
            <br /><strong>{loadingStats ? "…" : totalCompleted.toLocaleString()}건</strong>
          </div>

          {/* 배너: 기본은 빨강. 낙상 감지 시 파랑 */}
          <div
            className={`stat-card warning ${hasFall ? "is-blue-blink" : hasDanger ? "is-blinking" : ""}`}
            role={hasDanger ? "alert" : "button"}
            aria-live={hasDanger ? "assertive" : undefined}
            tabIndex={0}
            onClick={cycleMode}
            aria-pressed={dangerMode !== "status"}
          >
            <div className="danger-panel-content">
              <div className={`danger-headline ${hasFall ? "blue" : ""}`}>
                {hasFall
                  ? `💙 낙상 위험 감지: ${fallCount}명`
                  : hasDanger
                  ? `⚠️ 위험 상태인 택배기사가 ${dangerCount}명 있습니다`
                  : "⚠️ 현재는 위험 상태인 택배기사가 없습니다"}
              </div>
              {hasFall && (
                <div className="danger-subline">
                  ⚠️ 위험 상태(피로/기타) 기사 수: {dangerCount}명
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 본문: 지도 + 우측 목록 */}
        <div className="main-body">
          <div className={`map-area ${hasDanger ? (hasFall ? "blue-boost" : "danger-boost") : ""}`}>
            <DetailMap
              addresses={[]}
              centerAddress=""
              level={mapLevel}
              coords={markerCoords}
              markerImageUrls={markerImages}
              markerSize={{ width: 35, height: 45 }}
              fitBiasAfterBounds={-3}
            />
          </div>

          <aside className="right-side">
            {loadingList && <div className="driver-mini-card">목록을 불러오는 중…</div>}
            {!loadingList &&
              shownList.map((m) => {
                const ratio = m.total > 0 ? Math.min(100, Math.round((m.delivered / m.total) * 100)) : 0;
                const color = PALETTE[m.classKey];
                const pulse = pulseSet.has(m.driverId) ? " pulse" : "";
                const dangerBoost = m.effectiveLevel === "위험" ? (m._flags?.isFall ? " blue-boost" : " danger-boost") : "";
                return (
                  <div
                    key={m.driverId}
                    className={`driver-mini-card border-${m.classKey}${pulse}${dangerBoost}`}
                    style={{ borderColor: color, animationDelay: "var(--danger-sync,0s)" }}
                    onClick={() =>
                      navigate(`/driver/${m.driverId}`, {
                        state: {
                          mapSeed: {
                            address: "",
                            coord: wsLoc[String(m.driverId)]?.pos ?? undefined,
                          },
                        },
                      })
                    }
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        navigate(`/driver/${m.driverId}`, {
                          state: {
                            mapSeed: {
                              address: "",
                              coord: wsLoc[String(m.driverId)]?.pos ?? undefined,
                            },
                          },
                        });
                      }
                    }}
                  >
                    <div className="mini-header">
                      <img src={m.profileImageUrl || "/images/PostDeliver.png"} alt="프로필" className="mini-avatar" />
                      <div className="mini-meta">
                        <div className="mini-name">
                          {m.name} <span className="mini-dot" style={{ color }}>●</span>{" "}
                          <span className="mini-status" style={{ color }}>
                            {m.effectiveLevel}
                          </span>
                          {m._flags?.isFall && <span className="mini-badge-fall">낙상</span>}
                          {m._flags?.isFatigue && <span className="mini-badge-fatigue">피로</span>}
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
                      <span className="mini-value">{m.delivered} / {m.total}</span>
                    </div>

                    <div className="mini-progress">
                      <div className={`mini-bar ${m.classKey}`} style={{ width: `${ratio}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
          </aside>
        </div>
      </main>

      {/* 시연용 이벤트 토스트 */}
      <div className="event-toast-wrap">
        {toasts.slice(0, 1).map((t) => {
          const drv = miniList.find((m) => m.userId === t.userId);
          const name = t.name ?? drv?.name ?? "";
          const label = t.kind === "fall" ? `💙 낙상 위험 감지` : `🚨 피로도 위험`;
          return (
            <div key={t.id} className={`event-toast ${t.kind}`}>
              <strong>{name}</strong>
              <span>{label}</span>
            </div>
          );
        })}
      </div>

      {/* 지역 선택 모달 */}
      {regionOpen && (
        <div className="rf-backdrop" role="dialog" aria-modal="true">
          <div className="rf-modal">
            <button className="rf-close" aria-label="닫기" onClick={() => setRegionOpen(false)}>×</button>
            <div className="rf-title">지역을 선택해 원하는 위치의 기사분을 확인하세요.</div>
            <div className="rf-row">
              <select className="rf-select" value="서울특별시" disabled><option>서울특별시</option></select>
              <select className="rf-select" value={selGu} onChange={(e) => setSelGu(e.target.value)}>
                <option value="">지역구 선택</option>
                {SEOUL_GU.map((g) => (<option key={g} value={g}>{g}</option>))}
              </select>
            </div>
            <button className="rf-primary" onClick={() => setRegionOpen(false)}>완료</button>
          </div>
        </div>
      )}

      {/* 위험 알림 모달 */}
      {dangerModalOpen && (
        <div className="rf-backdrop danger-modal" role="alertdialog" aria-modal="true" aria-labelledby="danger-title">
          <div className="rf-modal" style={{ borderTop: "3px solid #EE404C" }}>
            <button className="rf-close" aria-label="닫기" onClick={() => setDangerModalOpen(false)}>×</button>
            <div id="danger-title" className="rf-title">⚠️ 위험한 기사가 발생했습니다</div>
            <div className="rf-row" style={{ marginTop: 18, justifyContent: "center" }}>
              <button className="rf-primary danger" onClick={() => setDangerModalOpen(false)} aria-label="확인" autoFocus>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer onSearch={handleFooterSearch} />
    </div>
  );
};

export default Main;
