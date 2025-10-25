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
} from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";
import { BASE_URL } from "../env";

/** WS 메시지 */
type WSHealthMsg = {
  type: "health";
  payload: {
    driverId?: number;
    userId?: string | number;
    heartRate?: number;
    step?: number;
    recordedAt?: string;
    capturedAt?: string;
  };
};

type WSLocationMsg = {
  type: "location";
  payload: {
    driverId?: number;
    userId?: string | number;
    lat: number;
    lng: number;
    capturedAt?: string;
    timestamp?: number;
  };
};
type WSMessage = WSHealthMsg | WSLocationMsg;

/** 실시간 건강 */
type RealtimeHealth = {
  userId: string;
  heartRate: number;
  step: number;
  capturedAt: string;
};

// HTTP → WS URL 정규화
const toWSUrl = (httpBase: string, path: string) => {
  const u = new URL(httpBase);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = path.startsWith("/") ? path : `/${path}`;
  return u.toString();
};

// ✅ 마커 이미지 경로
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

  // 타임라인
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [productTimeline, setProductTimeline] = useState<ProductTimelineItem[]>([]);
  const [loadingProductTimeline, setLoadingProductTimeline] = useState(false);

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

  // 배송 목록 — 전체 요청 후 클라이언트 분류 (서버 404 회피)
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

  // WS 연결 (건강/위치) — 토큰/드라이버 기준 단일 연결
  useEffect(() => {
    if (!token || !driverId) return;

    // 실제 서버 라우팅에 맞게 경로 선택:
    // const wsUrl = toWSUrl(BASE_URL, "/ws/location");
    const wsUrl = toWSUrl(BASE_URL, "/api/v1/ws/location"); // <- 필요에 맞게 한 곳으로 확정
    const urlWithQuery = `${wsUrl}?token=${encodeURIComponent(String(token))}&as=web`;
    const DEBUG = localStorage.getItem("debug:ws") === "1";

    const ws = new WebSocket(urlWithQuery);

    ws.onopen = () => {
      if (DEBUG) console.log("[WS] open:", urlWithQuery);
    };
    ws.onerror = (e) => {
      if (DEBUG) console.warn("[WS] error:", e);
    };
    ws.onclose = (e) => {
      if (DEBUG) console.log("[WS] close:", e.code, e.reason, "clean:", e.wasClean);
    };

    ws.onmessage = (evt: MessageEvent<string>) => {
      try {
        const msg: WSMessage = JSON.parse(evt.data);

        if (msg.type === "health") {
          const p = msg.payload || {};
          const matchByDriver =
            typeof p.driverId === "number" && p.driverId === driverId;
          const matchByUser =
            p.userId !== undefined &&
            userIdForDriver &&
            String(p.userId) === String(userIdForDriver);
          if (!(matchByDriver || matchByUser)) return;

          const hr = Number(p.heartRate ?? 0);
          const st = Number(p.step ?? 0);
          const recordedAt = p.recordedAt || p.capturedAt || "";
          setRealtime((prev) => ({
            userId:
              (userIdForDriver ??
                prev?.userId ??
                (p.userId !== undefined ? String(p.userId) : "")) || "",
            heartRate: hr,
            step: st,
            capturedAt: recordedAt,
          }));
          if (DEBUG) console.log("[WS health] hr:", hr, "st:", st);
        } else if (msg.type === "location") {
          const p = msg.payload || ({} as any);
          const matchByDriver =
            typeof p.driverId === "number" && p.driverId === driverId;
          const matchByUser =
            p.userId !== undefined &&
            userIdForDriver &&
            String(p.userId) === String(userIdForDriver);
          if (!(matchByDriver || matchByUser)) return;

          if (typeof p.lat === "number" && typeof p.lng === "number") {
            setRealtimeLoc({ lat: p.lat, lng: p.lng });
          }
          if (DEBUG) console.log("[WS location] setRealtimeLoc", p?.lat, p?.lng);
        }
      } catch {}
    };

    return () => {
      try { ws.close(); } catch {}
    };
  }, [token, driverId]); // 의존성 최소화로 단일 연결 유지

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

  const isDanger = useMemo(() => (profile?.conditionStatus ?? "") === "위험", [profile]);
  const currentList = activeTab === "ONGOING" ? ongoing : completed;
  const loadingCurrent = activeTab === "ONGOING" ? loadingOngoing : loadingCompleted;
  const condition = profile?.conditionStatus ?? "알수없음";
  const conditionBadgeClass =
    condition === "위험" ? "danger" : condition === "불안" ? "warn" : "good";
  const profileCardClass = `profile-card ${isDanger ? "danger" : ""}`;
  const healthCardClass = `health-card ${isDanger ? "danger" : ""}`;

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
  // 실시간 좌표가 있으면 항상 표시
  const mapCoords = realtimeLoc ? [realtimeLoc] : [];

  // 초기 진입 시 바로 보이게 주소 중심/마커 폴백
  const fallbackAddress =
    profile?.residence || (Array.isArray(profile?.regions) ? profile?.regions?.[0] : "");
  const mapCenterCoord = realtimeLoc || undefined;
  const mapCenterAddress =
    !mapCenterCoord && fallbackAddress ? String(fallbackAddress) : undefined;

  // 실시간이 없을 때 주소 마커 1개라도 표시
  const mapAddresses =
    !realtimeLoc && fallbackAddress ? [String(fallbackAddress)] : undefined;

  // ✅ 상태에 따라 마커 이미지 결정 (위험이면 빨간색)
  const markerImageSrc = isDanger ? MARKER_IMG.danger : MARKER_IMG.normal;

  // ✅ DetailMap이 단일 이미지를 전 마커에 반복 적용해주므로 한 장만 넘겨도 됨
  const markerImageUrls = markerImageSrc ? [markerImageSrc] : [];

  const mapLevel = 6;

  return (
    <div className="driver-layout">
      <Sidebar />
      <div className="driver-detail-container">
        {/* 왼쪽 프로필 */}
        <section className="left-panel">
          <div className={profileCardClass}>
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
                  {condition ?? "-"}
                </span>
              </span>
            </div>
          </div>

          <div className={healthCardClass}>
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
                addresses={mapAddresses}            // ★ 폴백 마커
                centerCoord={mapCenterCoord}
                centerAddress={mapCenterAddress}    // ★ 초기 진입 즉시 보이게
                level={mapLevel}
                markerImageUrls={markerImageUrls}   // ★ 위험 상태면 빨간 마커 전달
                markerSize={{ width: 35, height: 45 }}
              />
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
                      className={`delivery-card ${
                        selectedProductId === item.productId ? "active" : ""
                      }`}
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
