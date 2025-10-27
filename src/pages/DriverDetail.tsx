// src/pages/DriverDetail.tsx
import React, { useState, useEffect, useContext, useMemo, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/DriverDetail.css";
import DetailMap, { LatLng } from "../components/DetailMap";
import { ApiService } from "../services/apiService";
import {
  DeliveryItem,
  ProductTimelineItem,
  ApprovedUser,
  DriverProfile,
  RealtimeHealthItem,
} from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";
import { connectLocationWS, LocationPayload, HealthPayload } from "../services/wsClient";

/** 상태 타입 & 유틸 (메인과 동일 규칙) */
type StatusKey = "위험" | "불안" | "좋음" | "알수없음";
const toStatusKey = (s?: string): StatusKey =>
  s === "위험" || s === "불안" || s === "좋음" ? s : "알수없음";

const normalizeServerLevel = (lv?: string): "좋음" | "경고" | "위험" | "알수없음" =>
  lv === "위험" ? "위험" : lv === "경고" ? "경고" : lv === "좋음" ? "좋음" : "알수없음";

/** 실시간 건강(단일 드라이버) */
type RealtimeHealth = {
  userId: string;
  heartRate: number;
  step: number;
  level: "좋음" | "경고" | "위험" | "알수없음";
  capturedAt: string;
};

const MARKER_IMG = {
  normal: "/images/driverMarker.png",
  danger: "/images/dangerMarker.png",
} as const;

/** 주기(ms) */
const POLL_MS = 4000;

/** 메인→상세 지도 시드 */
type MapSeed = { address?: string; coord?: LatLng } | undefined;

const DriverDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const driverId = Number(id);

  // ✅ 메인에서 넘겨준 초기 위치 시드
  const mapSeed: MapSeed = (location.state as any)?.mapSeed;

  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  const [userIdForDriver, setUserIdForDriver] = useState<string | null>(null);
  const [isOnDuty, setIsOnDuty] = useState<boolean>(false);

  // 목록
  const [ongoing, setOngoing] = useState<DeliveryItem[]>([]);
  const [completed, setCompleted] = useState<DeliveryItem[]>([]);
  const [loadingOngoing, setLoadingOngoing] = useState(false);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<"ONGOING" | "COMPLETED">("ONGOING");

  // 실시간
  const [realtime, setRealtime] = useState<RealtimeHealth | null>(null);
  const [realtimeLoc, setRealtimeLoc] = useState<LatLng | null>(null);

  // 최초 위치 지연(fallback 허용)
  const [gracePassed, setGracePassed] = useState(false);
  const GRACE_MS = 1200;

  // 타임라인
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [productTimeline, setProductTimeline] = useState<ProductTimelineItem[]>([]);
  const [loadingProductTimeline, setLoadingProductTimeline] = useState(false);

  // 최신 식별자/타임스탬프 유지
  const userIdRef = useRef<string | null>(null);
  const driverIdRef = useRef<number>(driverId);
  const selectedPidRef = useRef<number | null>(null);
  const lastLocTsRef = useRef<number>(0);           // 위치 타임스탬프
  const hasLiveWSLocRef = useRef<boolean>(false);   // WS 라이브 좌표 수신 여부

  // WS 이벤트에 반응해 목록을 즉시 갱신하기 위한 디바운스/스로틀 타이머
  const wsKickTimerRef = useRef<number | null>(null);
  const lastKickAtRef = useRef<number>(0);
  const KICK_DEBOUNCE_MS = 250;
  const KICK_THROTTLE_MS = 1500;

  // ✅ 완료 목록 정렬용: 타임라인 최신 ts 캐시
  const timelineLatestTsRef = useRef<Map<number, number>>(new Map());

  useEffect(() => { userIdRef.current = userIdForDriver; }, [userIdForDriver]);
  useEffect(() => { driverIdRef.current = driverId; }, [driverId]);
  useEffect(() => { selectedPidRef.current = selectedProductId; }, [selectedProductId]);

  // 🚩 목록 변경 검출용 시그니처(타임라인 재조회 판단용)
  const prevSigRef = useRef<string>("");

  const buildStatusSig = useCallback((items: DeliveryItem[]) => {
    return items
      .map((it) => `${it.productId}:${String(it.shippingStatus || "").trim()}`)
      .sort()
      .join("|");
  }, []);

  // ────────────────────────────────────────────────
  // 배송 목록 로더 + 자동 새로고침
  // ────────────────────────────────────────────────
  const classifyDeliveries = useCallback((items: DeliveryItem[]) => {
    const DONE_SET  = new Set(["배송완료", "DELIVERED", "완료", "delivered"]);
    const START_SET = new Set(["배송시작", "배송중", "IN_PROGRESS", "started"]);
    const WAIT_SET  = new Set(["배송대기", "PENDING", "waiting"]);

    const completed = items.filter((it) => DONE_SET.has(String(it.shippingStatus).trim()));
    const ongoing = items
      .filter((it) => !DONE_SET.has(String(it.shippingStatus).trim()))
      .filter((it) =>
        START_SET.has(String(it.shippingStatus).trim()) ||
        WAIT_SET.has(String(it.shippingStatus).trim())
      );
    return { ongoing, completed };
  }, []);

  // 공통 ts 파서 & 임시(fallback) ts
  const parseTs = (raw?: string | null) => {
    const ts = raw ? Date.parse(raw) : NaN;
    return Number.isNaN(ts) ? 0 : ts;
  };
  const getFallbackTs = (it: DeliveryItem) => {
    const raw =
      (it as any).deliveredAt ??
      (it as any).statusChangedAt ??
      (it as any).updatedAt ??
      (it as any).createdAt ??
      null;
    return parseTs(raw);
  };

  // 캐시 기반 최신 ts 반환(없으면 fallback)
  const getLatestKnownTs = useCallback((it: DeliveryItem) => {
    const cached = timelineLatestTsRef.current.get(it.productId);
    return typeof cached === "number" ? cached : getFallbackTs(it);
  }, []);

  // 완료 항목들의 타임라인 최신 ts 선-가져오기(동시 fetch)
  const prefetchLatestTimelineTs = useCallback(async (completedItems: DeliveryItem[]) => {
    const missing = completedItems.filter((it) => !timelineLatestTsRef.current.has(it.productId));
    if (missing.length === 0) return;

    // 과도한 호출 방지: 한 번에 최대 30건 정도
    const batch = missing.slice(0, 30);

    const results = await Promise.allSettled(
      batch.map(async (it) => {
        const tl = await ApiService.fetchProductTimeline(it.productId);
        const list = Array.isArray(tl) ? (tl as ProductTimelineItem[]) : [];
        // 타임라인의 가장 최신 이벤트 시간
        const latest = list.reduce((acc, ev) => Math.max(acc, parseTs(ev.statusChangedAt)), 0);
        // 타임라인이 없으면 fallback
        const finalTs = latest > 0 ? latest : getFallbackTs(it);
        timelineLatestTsRef.current.set(it.productId, finalTs);
      })
    );

    // (옵션) 실패 항목은 남겨두고 다음 주기에서 재시도됨
    return results;
  }, []);

  const sortCompletedByTimeline = useCallback((items: DeliveryItem[]) => {
    // 가장 최근(큰 ts)이 위로
    return [...items].sort((a, b) => getLatestKnownTs(b) - getLatestKnownTs(a));
  }, [getLatestKnownTs]);

  const loadDeliveriesOnce = useCallback(async () => {
    if (!token || !driverIdRef.current) return;

    try {
      setLoadingOngoing(true);
      setLoadingCompleted(true);

      const all = await ApiService.fetchDriverAssignedProducts(driverIdRef.current);
      const items = Array.isArray(all) ? all : [];

      const { ongoing, completed } = classifyDeliveries(items);

      // 1차: 캐시/임시 ts로 정렬
      const completedSorted1 = sortCompletedByTimeline(completed);
      setOngoing(ongoing);
      setCompleted(completedSorted1);

      // 타임라인 최신 ts 선-fetch 후 재정렬
      await prefetchLatestTimelineTs(completed);
      const completedSorted2 = sortCompletedByTimeline(completed);
      // 캐시가 갱신되어 순서가 달라졌다면 다시 반영
      setCompleted((prev) => {
        const prevIds = prev.map((x) => x.productId).join(",");
        const nextIds = completedSorted2.map((x) => x.productId).join(",");
        return prevIds === nextIds ? prev : completedSorted2;
      });

      // 상태 시그니처 변동 시 선택된 타임라인만 재조회
      const newSig = buildStatusSig(items);
      if (newSig !== prevSigRef.current) {
        const sel = selectedPidRef.current;
        prevSigRef.current = newSig;

        if (sel && items.some((it) => it.productId === sel)) {
          try {
            const tl = await ApiService.fetchProductTimeline(sel);
            setProductTimeline(Array.isArray(tl) ? tl : []);
            // 선택된 항목의 최신 ts도 캐시에 반영
            const latest = (Array.isArray(tl) ? tl : []).reduce((acc, ev) => Math.max(acc, parseTs(ev.statusChangedAt)), 0);
            if (latest > 0) timelineLatestTsRef.current.set(sel, latest);
          } catch { /* ignore */ }
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingOngoing(false);
      setLoadingCompleted(false);
    }
  }, [
    token,
    classifyDeliveries,
    buildStatusSig,
    prefetchLatestTimelineTs,
    sortCompletedByTimeline,
  ]);

  // WS 이벤트에 의해 “즉시 새로고침” 예약
  const scheduleImmediateRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastKickAtRef.current < KICK_THROTTLE_MS) return; // 스로틀
    if (wsKickTimerRef.current) window.clearTimeout(wsKickTimerRef.current);
    wsKickTimerRef.current = window.setTimeout(async () => {
      lastKickAtRef.current = Date.now();
      await loadDeliveriesOnce(); // 실제 갱신
    }, KICK_DEBOUNCE_MS) as unknown as number;
  }, [loadDeliveriesOnce]);

  // 프로필
  useEffect(() => {
    if (!token || !driverId) return;
    setLoadingProfile(true);
    ApiService.fetchDriverProfile(driverId)
      .then((p) => setProfile(p ?? null))
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [token, driverId]);

  // 승인 목록에서 userId / attendance 매핑
  useEffect(() => {
    if (!token || !driverId) return;
    ApiService.fetchApprovedUsers({ page: 1, size: 1000 })
      .then((resp) => {
        const list: ApprovedUser[] =
          (resp as any)?.data ?? (resp as any)?.items ?? (resp as any) ?? [];
        const found = list.find((d: any) => d.driverId === driverId);
        const uid = (found as any)?.userId ?? driverId;
        setUserIdForDriver(String(uid));
        setIsOnDuty(((found as any)?.attendance ?? "").trim() === "출근");
      })
      .catch(() => {
        setUserIdForDriver(null);
        setIsOnDuty(false);
      });
  }, [token, driverId]);

  // 초기 1회 + 폴링/가시성/포커스 복귀 시
  useEffect(() => { loadDeliveriesOnce(); }, [loadDeliveriesOnce]);

  useEffect(() => {
    if (!token) return;
    let alive = true;

    const poll = async () => {
      if (!alive) return;
      await loadDeliveriesOnce();
    };

    poll();
    const id = window.setInterval(poll, POLL_MS);

    const onVis = () => { if (document.visibilityState === "visible") poll(); };
    const onFocus = () => { poll(); };

    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);

    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
    };
  }, [token, loadDeliveriesOnce]);

  // ────────────────────────────────────────────────
  // 실시간: WS + REST(초기 1회) / 위치 안정화
  // ────────────────────────────────────────────────

  // 짧은 그레이스 (seed 없을 때만 적용)
  useEffect(() => {
    if (mapSeed?.address || mapSeed?.coord) {
      setGracePassed(true);
      return;
    }
    const t = window.setTimeout(() => setGracePassed(true), GRACE_MS);
    return () => window.clearTimeout(t);
  }, [mapSeed?.address, mapSeed?.coord]);

  // (선택) 초기 REST 위치 스냅샷 1회 — 해당 드라이버 것만
  useEffect(() => {
    if (!token || !driverId) return;
    let alive = true;

    (async () => {
      try {
        const region =
          (profile?.regions && profile.regions.length > 0 && profile.regions[0]) ||
          profile?.residence ||
          undefined;

        const rows: any = await (ApiService as any).fetchRealtimeLocations?.(region);
        if (!alive || !Array.isArray(rows)) return;

        const mine = rows.find((r: any) => Number(r?.driverId) === driverId);
        if (mine && typeof mine.lat === "number" && typeof mine.lng === "number" && !hasLiveWSLocRef.current) {
          setRealtimeLoc({ lat: mine.lat, lng: mine.lng });
          lastLocTsRef.current = Date.now();
        }
      } catch {/* ignore */}
    })();

    return () => { alive = false; };
  }, [token, driverId, profile?.regions, profile?.residence]);

  // ✅ 직접 진입 즉시 위험 레벨도 잡히도록
  useEffect(() => {
    if (!token || !userIdForDriver) return;
    let alive = true;

    (async () => {
      try {
        const rows: RealtimeHealthItem[] = await ApiService.fetchRealtimeHealth(undefined);
        if (!alive || !Array.isArray(rows)) return;
        const mine = rows.find((r) => String(r.userId) === String(userIdForDriver));
        if (!mine) return;

        const level = normalizeServerLevel((mine as any).level);
        setRealtime({
          userId: String(mine.userId),
          heartRate: Number(mine.heartRate ?? 0),
          step: Number(mine.step ?? 0),
          level,
          capturedAt: mine.capturedAt || new Date().toISOString(),
        });
      } catch {
        /* ignore */
      }
    })();

    return () => { alive = false; };
  }, [token, userIdForDriver]);

  // WS 연결 (위치 & 건강)
  useEffect(() => {
    if (!token) return;

    const disconnect = connectLocationWS({
      as: "web",
      handlers: {
        onLocation: (msg: { type: "location"; payload: LocationPayload }) => {
          const p = msg.payload as any;
          const didNow = driverIdRef.current;
          const uidNow = userIdRef.current;

          const byDriver = typeof p?.driverId === "number" && p.driverId === didNow;
          const byUser   = p?.userId !== undefined && uidNow && String(p.userId) === String(uidNow);
          if (!(byDriver || byUser)) return;

          if (typeof p.lat === "number" && typeof p.lng === "number") {
            const ts = p.recordedAt ? Date.parse(p.recordedAt) :
                       p.capturedAt ? Date.parse(p.capturedAt) :
                       Date.now();
            if (ts < lastLocTsRef.current) return;

            lastLocTsRef.current = ts;
            hasLiveWSLocRef.current = true;
            setRealtimeLoc({ lat: p.lat, lng: p.lng });

            scheduleImmediateRefresh(); // 위치 이벤트 → 목록 즉시 갱신 예약
          }
        },
        onHealth: (msg: { type: "health"; payload: HealthPayload }) => {
          const p = msg.payload as any;
          const didNow = driverIdRef.current;
          const uidNow = userIdRef.current;

          const byDriver = typeof p?.driverId === "number" && p.driverId === didNow;
          const byUser   = p?.userId !== undefined && uidNow && String(p.userId) === String(uidNow);
          if (!(byDriver || byUser)) return;

          const hr = Number(p.heartRate ?? 0);
          const st = Number(p.step ?? 0);
          const captured = p.recordedAt || p.capturedAt || new Date().toISOString();
          const level = normalizeServerLevel(p.level);

          setRealtime((prev) => ({
            userId: uidNow ?? prev?.userId ?? (p.userId !== undefined ? String(p.userId) : "") ?? "",
            heartRate: hr,
            step: st,
            level,
            capturedAt: captured,
          }));

          scheduleImmediateRefresh(); // 건강 이벤트 → 목록 즉시 갱신 예약
        },
      },
      reconnect: true,
      maxRetries: 3,
      retryDelayMs: 2000,
    });

    return () => {
      disconnect();
      if (wsKickTimerRef.current) {
        window.clearTimeout(wsKickTimerRef.current);
        wsKickTimerRef.current = null;
      }
    };
  }, [token, scheduleImmediateRefresh]);

  // 건강 스냅샷 폴링 (지역 기반)
  useEffect(() => {
    if (!token) return;
    let alive = true;

    const tick = async () => {
      try {
        const region =
          (profile?.regions && profile.regions.length > 0 && profile.regions[0]) ||
          profile?.residence ||
          undefined;

        const rows: RealtimeHealthItem[] = await ApiService.fetchRealtimeHealth(region);
        if (!alive || !Array.isArray(rows)) return;

        const uidNow = userIdRef.current;
        const mine = rows.find((r) => uidNow && String(r.userId) === String(uidNow));
        if (!mine) return;

        setRealtime((prev) => {
          const prevTs = prev?.capturedAt ? Date.parse(prev.capturedAt) : -1;
          const newTs = mine.capturedAt ? Date.parse(mine.capturedAt) : Date.now();
          if (prevTs !== -1 && newTs < prevTs) return prev;

          return {
            userId: String(mine.userId ?? prev?.userId ?? uidNow ?? ""),
            heartRate: Number(mine.heartRate ?? prev?.heartRate ?? 0),
            step: Number(mine.step ?? prev?.step ?? 0),
            level: normalizeServerLevel((mine as any).level) ?? prev?.level ?? "알수없음",
            capturedAt: mine.capturedAt ?? prev?.capturedAt ?? new Date().toISOString(),
          };
        });
      } catch {/* ignore */}
    };

    tick();
    const id = window.setInterval(tick, 2500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [token, profile?.regions, profile?.residence]);

  // ✅ 상품 타임라인 로드(선택 시) + 캐시 갱신
  const loadProductTimeline = useCallback(async (pid: number) => {
    setSelectedProductId(pid);
    setLoadingProductTimeline(true);
    try {
      const tl = await ApiService.fetchProductTimeline(pid);
      const list = Array.isArray(tl) ? (tl as ProductTimelineItem[]) : [];
      setProductTimeline(list);

      // 이 상품의 최신 타임라인 ts를 캐시에 반영(정렬 일관성)
      const latest = list.reduce((acc, ev) => Math.max(acc, parseTs(ev.statusChangedAt)), 0);
      if (latest > 0) {
        timelineLatestTsRef.current.set(pid, latest);
        // 완료 목록이 보이는 중이라면 재정렬 반영
        setCompleted((prev) => prev.length ? [...prev].sort((a,b) => {
          const ta = a.productId === pid ? latest : getLatestKnownTs(a);
          const tb = b.productId === pid ? latest : getLatestKnownTs(b);
          return tb - ta; // 최근 → 과거
        }) : prev);
      }
    } catch {
      setProductTimeline([]);
    } finally {
      setLoadingProductTimeline(false);
    }
  }, [getLatestKnownTs]);

  // ===== 표시 로직 =====
  const effectiveLevel: "좋음" | "경고" | "위험" | "알수없음" | StatusKey =
    realtime?.level ?? toStatusKey(profile?.conditionStatus);

  const conditionBadgeClass =
    effectiveLevel === "위험" ? "danger" : (effectiveLevel === "불안" || effectiveLevel === "경고") ? "warn" : "good";

  const liveHeartRate = Number(realtime?.heartRate ?? 0);
  const riskNote = useMemo(() => {
    if (effectiveLevel === "위험") return null;
    if (liveHeartRate >= 150) return "고심박";
    if (liveHeartRate > 0 && liveHeartRate <= 45) return "저심박";
    return null;
  }, [effectiveLevel, liveHeartRate]);

  const fmtNum = (n?: number | null) => Number(n ?? 0).toLocaleString();
  const fmtTime = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleString("ko-KR") : "-";

  if (loadingProfile) {
    return (
      <div className="driver-layout">
        <Sidebar />
        <div className="driver-detail-container">
          <p>기사 정보를 불러오는 중...</p>
        </div>
        <Footer onSearch={(ff, nq) => navigate("/manage", { state: { ff, nq } })} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="driver-layout">
        <Sidebar />
        <div className="driver-detail-container">
          <p>해당 기사를 찾을 수 없습니다.</p>
        </div>
        <Footer onSearch={(ff, nq) => navigate("/manage", { state: { ff, nq } })} />
      </div>
    );
  }

  // ===== 지도 관련 계산 =====
  const seedCoord = mapSeed?.coord || null;
  const seedAddress = mapSeed?.address || "";

  // seed 좌표가 있으면 즉시 마커 표시
  const mapCoords = realtimeLoc ? [realtimeLoc] : seedCoord ? [seedCoord] : [];

  const fallbackAddress =
    seedAddress || profile?.residence || (Array.isArray(profile.regions) ? profile.regions[0] : "");

  const allowFallback =
    (!!seedAddress || !!seedCoord)
      ? !realtimeLoc
      : (gracePassed && !realtimeLoc && !hasLiveWSLocRef.current);

  const mapCenterCoord = realtimeLoc || seedCoord || undefined;
  const mapCenterAddress = !mapCenterCoord && allowFallback && fallbackAddress
    ? String(fallbackAddress)
    : undefined;

  const mapAddresses = !realtimeLoc && !seedCoord && allowFallback && fallbackAddress
    ? [String(fallbackAddress)]
    : undefined;

  const markerImageSrc = (effectiveLevel === "위험") ? MARKER_IMG.danger : MARKER_IMG.normal;
  const markerImageUrls = markerImageSrc ? [markerImageSrc] : [];

  const mapLevel = 6;

  const currentList = activeTab === "ONGOING" ? ongoing : completed;
  const loadingCurrent = activeTab === "ONGOING" ? loadingOngoing : loadingCompleted;

  return (
    <div className="driver-layout">
      <Sidebar />
      <div className="driver-detail-container">
        {/* 왼쪽 프로필 */}
        <section className={`left-panel`}>
          <div className={`profile-card ${effectiveLevel === "위험" ? "danger" : ""}`}>
            <img src={"/images/PostDeliver.png"} alt="기사 프로필" className="profile-image" />
            <h3>{profile.name}</h3>
            <p className="position">택배기사</p>

            <div className="info-row">
              <span className="info-label">전화번호</span>
              <span className="info-value">{profile.phoneNumber}</span>
            </div>
            <div className="info-row">
              <span className="info-label">거주지</span>
              <span className="info-value">{profile.residence}</span>
            </div>
            <div className="info-row">
              <span className="info-label">담당지</span>
              <span className="info-value">
                {Array.isArray(profile.regions) && profile.regions.length > 0 ? profile.regions.join(", ") : "-"}
              </span>
            </div>

            {riskNote && (
              <div className="info-row">
                <span className="info-label">위험 특이사항</span>
                <span className="info-value" style={{ color: "#e23d3d", fontWeight: 600 }}>
                  {riskNote}
                </span>
              </div>
            )}

            <div className="info-row" style={{ marginTop: 6 }}>
              <span className="info-label">위험 지수</span>
              <span className="info-value">
                <span className={`condition-badge ${conditionBadgeClass}`}>
                  {effectiveLevel === "경고" ? "불안" : effectiveLevel}
                </span>
              </span>
            </div>
          </div>

          <div className={`health-card ${effectiveLevel === "위험" ? "danger" : ""}`}>
            <h4>건강 상태</h4>
            <>
              <div className="info-row">
                <span>💚 심박수</span>
                <strong>{fmtNum(realtime?.heartRate ?? 0)} bpm</strong>
              </div>
              <div className="info-row">
                <span>🟡 걸음수</span>
                <strong>{fmtNum(realtime?.step ?? 0)} 걸음</strong>
              </div>

              <div className="info-row info-row--update">
                <span className="update-time">업데이트 {fmtTime(realtime?.capturedAt ?? null)}</span>
              </div>
            </>
          </div>
        </section>

        {/* 중앙 패널 */}
        <section className="center-panel">
          <div className="delivery-wrapper">
            <div className="driver-detail-map-area">
              <DetailMap
                coords={mapCoords}
                addresses={mapAddresses}
                centerCoord={mapCenterCoord}
                centerAddress={mapCenterAddress}
                level={mapLevel}
                markerImageUrls={markerImageUrls}
                markerSize={{ width: 35, height: 45 }}
              />
              {!realtimeLoc && !mapCenterCoord && !mapAddresses && (
                <div className="map-overlay-hint">실시간 위치 수신 중입니다…</div>
              )}
            </div>

            <div className="delivery-bottom-section">
              <div className="delivery-list">
                <h4>
                  배송 목록 <span className="count">{currentList.length}</span>
                </h4>
                <div className="tabs">
                  <span className={`tab ${activeTab === "ONGOING" ? "active" : ""}`} onClick={() => setActiveTab("ONGOING")}>
                    진행 중
                  </span>
                  <span className={`tab ${activeTab === "COMPLETED" ? "active" : ""}`} onClick={() => setActiveTab("COMPLETED")}>
                    완료
                  </span>
                </div>

                {loadingCurrent ? (
                  <p>목록을 불러오는 중...</p>
                ) : currentList.length === 0 ? (
                  <p>{activeTab === "ONGOING" ? "진행 중인 배송이 없습니다." : "완료된 배송이 없습니다."}</p>
                ) : (
                  currentList.map((item) => (
                    <div
                      key={item.productId}
                      className={`delivery-card ${selectedProductId === item.productId ? "active" : ""}`}
                      onClick={() => loadProductTimeline(item.productId)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          loadProductTimeline(item.productId);
                        }
                      }}
                    >
                      <p className="address">
                        {item.address} {item.detailAddress}
                        <br />
                        <small>({item.postalCode})</small>
                      </p>
                      <p className="summary">
                        상품명: {item.productName}
                        <br />
                        수취인: {item.recipientName} ({item.recipientPhoneNumber})
                      </p>
                      <p className="status">{item.shippingStatus}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="right-panel">
                <h4>상품 타임라인</h4>
                {!selectedProductId ? (
                  <p>왼쪽에서 상품을 선택하세요.</p>
                ) : loadingProductTimeline ? (
                  <p>타임라인을 불러오는 중...</p>
                ) : productTimeline.length === 0 ? (
                  <p>타임라인 기록이 없습니다.</p>
                ) : (
                  <ul className="timeline">
                    {productTimeline.map((ev) => (
                      <li key={ev.timelineId} className="timeline-item">
                        <div className="timeline-icon">✔</div>
                        <div className="timeline-content">
                          <div className="timeline-title">{ev.status}</div>
                          <div className="timeline-desc">
                            {ev.addressShort || "-"}
                            {ev.driverName ? ` · 담당: ${ev.driverName}` : ""}
                          </div>
                        </div>
                        <div className="timeline-time">{fmtTime(ev.statusChangedAt)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <Footer onSearch={(ff: FooterFilters, nq?: string) => navigate("/manage", { state: { ff, nq } })} />
    </div>
  );
};

export default DriverDetail;
