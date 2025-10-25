// src/pages/DriverDetail.tsx
import React, { useState, useEffect, useContext, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  // RealtimeLocationItem 타입이 존재한다면 아래 주석 해제
  // RealtimeLocationItem,
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

const DriverDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();
  const driverId = Number(id);

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

  // 초기 위치 그레이스 타임(추정 위치 표시 지연)
  const [gracePassed, setGracePassed] = useState(false);
  const GRACE_MS = 3000; // 3초 정도면 체감상 점프 현상 크게 줄어듦

  // 타임라인
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [productTimeline, setProductTimeline] = useState<ProductTimelineItem[]>([]);
  const [loadingProductTimeline, setLoadingProductTimeline] = useState(false);

  // 최신 식별자 유지용 ref (WS 콜백에서 최신 값 접근)
  const userIdRef = useRef<string | null>(null);
  const driverIdRef = useRef<number>(driverId);
  useEffect(() => { userIdRef.current = userIdForDriver; }, [userIdForDriver]);
  useEffect(() => { driverIdRef.current = driverId; }, [driverId]);

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

  // 배송 목록 — 전체 요청 후 클라이언트 분류
  useEffect(() => {
    if (!token || !driverId) return;

    const load = async () => {
      try {
        setLoadingOngoing(true);
        setLoadingCompleted(true);

        const all = await ApiService.fetchDriverAssignedProducts(driverId);
        const items = Array.isArray(all) ? all : [];

        const DONE_SET  = new Set(["배송완료", "DELIVERED", "완료", "delivered"]);
        const START_SET = new Set(["배송시작", "배송중", "IN_PROGRESS", "started"]);
        const WAIT_SET  = new Set(["배송대기", "PENDING", "waiting"]);

        const completed = items.filter(it =>
          DONE_SET.has(String(it.shippingStatus).trim())
        );
        const ongoing = items.filter(it => !DONE_SET.has(String(it.shippingStatus).trim()))
          .filter(it =>
            START_SET.has(String(it.shippingStatus).trim()) ||
            WAIT_SET.has(String(it.shippingStatus).trim())
          );

        setOngoing(ongoing);
        setCompleted(completed);
      } catch {
        setOngoing([]);
        setCompleted([]);
      } finally {
        setLoadingOngoing(false);
        setLoadingCompleted(false);
      }
    };

    load();
  }, [token, driverId]);

  // ────────────────────────────────────────────────
  // 실시간: WS + REST 폴링(백업). Main과 동일 전략 + 초기 위치 개선
  // ────────────────────────────────────────────────

  // 초기 그레이스 타이머: 추정 주소로 지도 점프를 3초 지연
  useEffect(() => {
    const t = window.setTimeout(() => setGracePassed(true), GRACE_MS);
    return () => window.clearTimeout(t);
  }, []);

  // (선택) 초기 REST 위치 스냅샷 1회 시도: driverId가 있는 경우 바로 반영
  useEffect(() => {
    if (!token || !driverId) return;
    let alive = true;

    (async () => {
      try {
        // 사용 가능한 API라면 region 추정으로 빠른 근접 좌표만 받아도 충분
        const region =
          (profile?.regions && profile.regions.length > 0 && profile.regions[0]) ||
          profile?.residence ||
          undefined;

        // AdminModels에 RealtimeLocationItem이 있고 ApiService에 해당 함수가 있을 때만 동작
        // 안전하게 any로 처리하여 스냅샷 좌표를 얻으면 사용
        const rows: any = await (ApiService as any).fetchRealtimeLocations?.(region);
        if (!alive || !Array.isArray(rows)) return;

        // driverId 매칭 우선, 없으면 첫 좌표라도 사용
        const mine =
          rows.find((r: any) => Number(r?.driverId) === driverId) || rows[0];
        if (mine && typeof mine.lat === "number" && typeof mine.lng === "number") {
          setRealtimeLoc({ lat: mine.lat, lng: mine.lng });
        }
      } catch {
        // ignore
      }
    })();

    return () => { alive = false; };
  }, [token, driverId, profile?.regions, profile?.residence]);

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

          // 받는 쪽에서 이 기사인지 판별 (driverId / userId 기준)
          const byDriver = typeof p?.driverId === "number" && p.driverId === didNow;
          const byUser   = p?.userId !== undefined && uidNow && String(p.userId) === String(uidNow);
          const noId     = p?.driverId === undefined && p?.userId === undefined; // 서버가 id 안줄 수도 있음
          if (!(byDriver || byUser || noId)) return;

          if (typeof p.lat === "number" && typeof p.lng === "number") {
            setRealtimeLoc({ lat: p.lat, lng: p.lng });
          }
        },
        onHealth: (msg: { type: "health"; payload: HealthPayload }) => {
          const p = msg.payload as any;
          const didNow = driverIdRef.current;
          const uidNow = userIdRef.current;

          const byDriver = typeof p?.driverId === "number" && p.driverId === didNow;
          const byUser   = p?.userId !== undefined && uidNow && String(p.userId) === String(uidNow);
          const noId     = p?.driverId === undefined && p?.userId === undefined;
          if (!(byDriver || byUser || noId)) return;

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
        },
      },
      reconnect: true,
      maxRetries: 3,
      retryDelayMs: 2000,
    });

    return () => {
      disconnect();
    };
  }, [token]); // driver/user는 ref로

  // 건강 스냅샷 폴링 (WS 실패/지연 보강) – 주기 단축(기존 5s → 2.5s)
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
        const didNow = driverIdRef.current;

        const mine =
          rows.find((r) => uidNow && String(r.userId) === String(uidNow)) ||
          rows[0];

        if (!mine) return;

        setRealtime((prev) => {
          const prevTs = prev?.capturedAt ? Date.parse(prev.capturedAt) : -1;
          const newTs = mine.capturedAt ? Date.parse(mine.capturedAt) : Date.now();
          if (prevTs !== -1 && newTs < prevTs) return prev;

          return {
            userId: String(mine.userId ?? prev?.userId ?? uidNow ?? didNow ?? ""),
            heartRate: Number(mine.heartRate ?? prev?.heartRate ?? 0),
            step: Number(mine.step ?? prev?.step ?? 0),
            level: normalizeServerLevel((mine as any).level) ?? prev?.level ?? "알수없음",
            capturedAt: mine.capturedAt ?? prev?.capturedAt ?? new Date().toISOString(),
          };
        });
      } catch {
        // ignore
      }
    };

    // 즉시 1회 + 주기
    tick();
    const id = window.setInterval(tick, 2500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [token, profile?.regions, profile?.residence]);

  // 타임라인 로드
  const loadProductTimeline = async (pid: number) => {
    setSelectedProductId(pid);
    setLoadingProductTimeline(true);
    try {
      const tl = await ApiService.fetchProductTimeline(pid);
      setProductTimeline(Array.isArray(tl) ? tl : []);
    } catch {
      setProductTimeline([]);
    } finally {
      setLoadingProductTimeline(false);
    }
  };

  // ===== 표시 로직(메인과 동일한 우선순위) =====
  const effectiveLevel: "좋음" | "경고" | "위험" | "알수없음" | StatusKey =
    realtime?.level ?? toStatusKey(profile?.conditionStatus);
  const isDanger = effectiveLevel === "위험";

  const conditionBadgeClass =
    effectiveLevel === "위험" ? "danger" : (effectiveLevel === "불안" || effectiveLevel === "경고") ? "warn" : "good";

  const liveHeartRate = Number(realtime?.heartRate ?? 0);
  const riskNote = useMemo(() => {
    if (isDanger) return null;
    if (liveHeartRate >= 150) return "고심박";
    if (liveHeartRate > 0 && liveHeartRate <= 45) return "저심박";
    return null;
  }, [isDanger, liveHeartRate]);

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
        <Footer
          onSearch={(ff, nq) => navigate("/manage", { state: { ff, nq } })}
        />
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
        <Footer
          onSearch={(ff, nq) => navigate("/manage", { state: { ff, nq } })}
        />
      </div>
    );
  }

  // ===== 지도 관련 계산 =====
  // 1) 실시간 좌표가 있으면 이를 우선 사용
  const mapCoords = realtimeLoc ? [realtimeLoc] : [];

  // 2) 초기에는 추정 주소 표시를 지연시켜 점프 방지
  const fallbackAddress =
    profile?.residence || (Array.isArray(profile?.regions) ? profile?.regions?.[0] : "");
  const allowFallback = gracePassed && !realtimeLoc;

  const mapCenterCoord = realtimeLoc || undefined;
  const mapCenterAddress = !mapCenterCoord && allowFallback && fallbackAddress
    ? String(fallbackAddress)
    : undefined;

  const mapAddresses = !realtimeLoc && allowFallback && fallbackAddress
    ? [String(fallbackAddress)]
    : undefined;

  // 상태별 마커 이미지
  const markerImageSrc = isDanger ? MARKER_IMG.danger : MARKER_IMG.normal;
  const markerImageUrls = markerImageSrc ? [markerImageSrc] : [];

  const mapLevel = 6;

  // 현재 탭 데이터
  const currentList = activeTab === "ONGOING" ? ongoing : completed;
  const loadingCurrent = activeTab === "ONGOING" ? loadingOngoing : loadingCompleted;

  return (
    <div className="driver-layout">
      <Sidebar />
      <div className="driver-detail-container">
        {/* 왼쪽 프로필 */}
        <section className={`left-panel`}>
          <div className={`profile-card ${isDanger ? "danger" : ""}`}>
            <img
              src={"/images/PostDeliver.png"}
              alt="기사 프로필"
              className="profile-image"
            />
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
                {Array.isArray(profile.regions) && profile.regions.length > 0
                  ? profile.regions.join(", ")
                  : "-"}
              </span>
            </div>

            {riskNote && (
              <div className="info-row">
                <span className="info-label">위험 특이사항</span>
                <span
                  className="info-value"
                  style={{ color: "#e23d3d", fontWeight: 600 }}
                >
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

          <div className={`health-card ${isDanger ? "danger" : ""}`}>
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
                <span className="update-time">
                  업데이트 {fmtTime(realtime?.capturedAt ?? null)}
                </span>
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
              {!realtimeLoc && !allowFallback && (
                <div className="map-overlay-hint">
                  실시간 위치 수신 중입니다…
                </div>
              )}
            </div>

            <div className="delivery-bottom-section">
              <div className="delivery-list">
                <h4>
                  배송 목록 <span className="count">{currentList.length}</span>
                </h4>
                <div className="tabs">
                  <span
                    className={`tab ${activeTab === "ONGOING" ? "active" : ""}`}
                    onClick={() => setActiveTab("ONGOING")}
                  >
                    진행 중
                  </span>
                  <span
                    className={`tab ${activeTab === "COMPLETED" ? "active" : ""}`}
                    onClick={() => setActiveTab("COMPLETED")}
                  >
                    완료
                  </span>
                </div>

                {loadingCurrent ? (
                  <p>목록을 불러오는 중...</p>
                ) : currentList.length === 0 ? (
                  <p>
                    {activeTab === "ONGOING"
                      ? "진행 중인 배송이 없습니다."
                      : "완료된 배송이 없습니다."}
                  </p>
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
                        <div className="timeline-time">
                          {fmtTime(ev.statusChangedAt)}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <Footer
        onSearch={(ff: FooterFilters, nq?: string) =>
          navigate("/manage", { state: { ff, nq } })
        }
      />
    </div>
  );
};

export default DriverDetail;
