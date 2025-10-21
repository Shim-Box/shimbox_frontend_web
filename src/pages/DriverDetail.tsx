import React, { useState, useEffect, useContext, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/DriverDetail.css";
import DetailMap from "../components/DetailMap";
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

/** ───────── WebSocket 수신 타입 ───────── */
type WSHealthMsg = {
  type: "health";
  payload: {
    driverId?: number;
    userId?: string | number;
    driverName?: string;
    region?: string;
    heartRate?: number;
    step?: number;
    recordedAt?: string;
    capturedAt?: string;
    timestamp?: number;
  };
};

type WSLocationMsg = {
  type: "location";
  payload: {
    driverId?: number;
    userId?: string | number;
    driverName?: string;
    region?: string;
    lat: number;
    lng: number;
    capturedAt?: string;
    addressShort?: string;
    timestamp?: number;
  };
};

type WSMessage = WSHealthMsg | WSLocationMsg;

/** 실시간 건강 로컬 타입 */
type RealtimeHealth = {
  userId: string;
  heartRate: number;
  step: number;
  capturedAt: string;
};

const DriverDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  const driverId = Number(id);

  // 프로필
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // 이 driverId에 대응하는 userId(WS 매칭용)
  const [userIdForDriver, setUserIdForDriver] = useState<string | null>(null);

  // 배송 목록
  const [ongoing, setOngoing] = useState<DeliveryItem[]>([]);
  const [completed, setCompleted] = useState<DeliveryItem[]>([]);
  const [loadingOngoing, setLoadingOngoing] = useState(false);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<"ONGOING" | "COMPLETED">(
    "ONGOING"
  );

  // 실시간 건강(WS)
  const [realtime, setRealtime] = useState<RealtimeHealth | null>(null);

  // 상품 타임라인
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null
  );
  const [productTimeline, setProductTimeline] = useState<ProductTimelineItem[]>(
    []
  );
  const [loadingProductTimeline, setLoadingProductTimeline] = useState(false);

  /* 1) 기사 프로필 */
  useEffect(() => {
    if (!token || !driverId) return;
    setLoadingProfile(true);
    ApiService.fetchDriverProfile(driverId)
      .then((p) => setProfile(p ?? null))
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [token, driverId]);

  /* 2) 승인목록에서 해당 driverId → userId 매핑 */
  useEffect(() => {
    if (!token || !driverId) return;
    ApiService.fetchApprovedUsers({ page: 1, size: 1000 })
      .then((resp) => {
        const list: ApprovedUser[] =
          (resp as any)?.data ?? (resp as any)?.items ?? (resp as any) ?? [];
        const found = list.find((d: any) => d.driverId === driverId);
        const uid = (found as any)?.userId ?? driverId;
        setUserIdForDriver(String(uid));
      })
      .catch(() => setUserIdForDriver(null));
  }, [token, driverId]);

  /* 3) 배송목록 */
  useEffect(() => {
    if (!token || !driverId) return;

    setLoadingOngoing(true);
    ApiService.fetchDriverAssignedProducts(driverId)
      .then((list) =>
        setOngoing(
          Array.isArray(list)
            ? list.filter((i) => {
                const s = String(i.shippingStatus).trim().toUpperCase();
                return s !== "배송완료" && s !== "DELIVERED";
              })
            : []
        )
      )
      .catch(() => setOngoing([]))
      .finally(() => setLoadingOngoing(false));

    setLoadingCompleted(true);
    ApiService.fetchDriverAssignedProducts(driverId)
      .then((list) =>
        setCompleted(
          Array.isArray(list)
            ? list.filter((i) => {
                const s = String(i.shippingStatus).trim().toUpperCase();
                return s === "배송완료" || s === "DELIVERED";
              })
            : []
        )
      )
      .catch(() => setCompleted([]))
      .finally(() => setLoadingCompleted(false));
  }, [token, driverId]);

  /* 4) WebSocket 직접 연결 */
  useEffect(() => {
    if (!token || !profile) return;

    const DEBUG = localStorage.getItem("debug:ws") === "1";
    const host = BASE_URL.replace(/^http/, "ws");

    // 기본: region 파라미터 제거(서버가 전체 브로드캐스트 지원 시)
    // 필요하면 아래 regionQ를 만들어 붙이세요.
    // const regionQ = encodeURIComponent(
    //   (profile.regions && profile.regions[0]) || profile.residence || "성북구"
    // );
    // const wsUrl = `${host}/ws/location?token=${encodeURIComponent(token as string)}&as=web&region=${regionQ}`;

    const wsUrl = `${host}/ws/location?token=${encodeURIComponent(
      token as string
    )}&as=web`;

    if (DEBUG) console.log("[WS connect]", wsUrl);

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (DEBUG) console.log("[WS open]");
    };

    ws.onmessage = (evt: MessageEvent<string>) => {
      try {
        if (DEBUG) console.log("[WS raw]", evt.data);
        const msg: WSMessage = JSON.parse(evt.data);

        if (msg.type === "health") {
          const p = msg.payload || {};
          const matchByDriver =
            typeof p.driverId === "number" && p.driverId === profile.driverId;
          const matchByUser =
            p.userId !== undefined &&
            userIdForDriver &&
            String(p.userId) === String(userIdForDriver);

          if (!(matchByDriver || matchByUser)) {
            if (DEBUG) console.log("[WS skip] not this driver", p);
            return;
          }

          const hr = Number(p.heartRate ?? 0);
          const st = Number(p.step ?? 0);
          const recordedAt = p.recordedAt || p.capturedAt || "";

          setRealtime((prev) => ({
            userId:
              (userIdForDriver ??
                prev?.userId ??
                (p.userId !== undefined ? String(p.userId) : "")) ||
              "",
            heartRate: hr,
            step: st,
            capturedAt: recordedAt,
          }));

          if (DEBUG)
            console.log("[WS health -> setRealtime]", { hr, st, recordedAt });
        } else if (msg.type === "location") {
          // 위치 메시지를 추후 사용할 때 여기에 추가
          if (DEBUG) console.log("[WS location]", msg.payload);
        }
      } catch (e) {
        if (DEBUG) console.warn("[WS parse error]", e);
      }
    };

    ws.onerror = (e) => {
      if (DEBUG) console.warn("[WS error]", e);
    };

    ws.onclose = () => {
      if (DEBUG) console.log("[WS close]");
    };

    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [token, profile, userIdForDriver]);

  /* 타임라인 로딩 */
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

  /* 뷰 계산 */
  const isDanger = useMemo(
    () => (profile?.conditionStatus ?? "") === "위험",
    [profile]
  );

  const currentList = activeTab === "ONGOING" ? ongoing : completed;
  const loadingCurrent =
    activeTab === "ONGOING" ? loadingOngoing : loadingCompleted;

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

  /* 렌더 */
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

  return (
    <div className="driver-layout">
      <Sidebar />
      <div className="driver-detail-container">
        {/* 왼쪽 프로필 패널 */}
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

            {/* (좋음/불안)에서만 특이사항 노출 */}
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

          {/* 건강 패널 — 실시간 건강 데이터(WS) */}
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
              <DetailMap addresses={[profile.residence]} level={3} />
            </div>

            <div className="delivery-bottom-section">
              {/* 배송 목록 */}
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
                    className={`tab ${
                      activeTab === "COMPLETED" ? "active" : ""
                    }`}
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
                        수취인: {item.recipientName} (
                        {item.recipientPhoneNumber})
                      </p>
                      <p className="status">{item.shippingStatus}</p>
                    </div>
                  ))
                )}
              </div>

              {/* 우측: 선택 상품 타임라인 */}
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

      {/* 하단 고정 Footer */}
      <Footer
        onSearch={(ff: FooterFilters, nq?: string) =>
          navigate("/manage", { state: { ff, nq } })
        }
      />
    </div>
  );
};

export default DriverDetail;
