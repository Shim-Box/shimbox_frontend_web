// src/pages/DriverDetail.tsx
import React, { useState, useEffect, useContext, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/DriverDetail.css";
import DetailMap from "../components/DetailMap";
import { ApiService } from "../services/apiService";
import {
  DeliveryItem,
  RealtimeHealthItem,
  ProductTimelineItem,
  HeartRateTimelineItem as HeartRatePoint,
  ApprovedUser,
  DriverProfile,
} from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";
import { BASE_URL } from "../env"; // wss 호스트 구성에 사용

// WebSocket 수신 메시지 타입(백엔드 가이드 기준)
type WSHealthMsg = {
  type: "health";
  payload: {
    driverId: number;
    driverName?: string;
    region?: string;
    heartRate?: number;
    step?: number;
    recordedAt?: string; // 서버가 보내는 키
    capturedAt?: string; // 혹시 다른 키로 올 수도 있어 대비
    userId?: string | number;
    timestamp?: number;
  };
};

type WSLocationMsg = {
  type: "location";
  payload: {
    driverId: number;
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

const DriverDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  const driverId = Number(id);

  // 프로필(단일 기사) — 기사 프로필 조회 API
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);

  // driverId -> userId 매핑(실시간 건강 필터용)
  const [userIdForDriver, setUserIdForDriver] = useState<string | null>(null);

  // 배송 목록
  const [ongoing, setOngoing] = useState<DeliveryItem[]>([]);
  const [completed, setCompleted] = useState<DeliveryItem[]>([]);
  const [loadingOngoing, setLoadingOngoing] = useState(false);
  const [loadingCompleted, setLoadingCompleted] = useState(false);
  const [activeTab, setActiveTab] = useState<"ONGOING" | "COMPLETED">(
    "ONGOING"
  );

  // 실시간 건강(심박/걸음) — 없으면 0으로 표시
  const [realtime, setRealtime] = useState<RealtimeHealthItem | null>(null);
  const [loadingRealtime, setLoadingRealtime] = useState(false);

  // 심박수 타임라인 — "위험"일 때만 노출
  const [hrTimeline, setHrTimeline] = useState<HeartRatePoint[]>([]);
  const [loadingHrTimeline, setLoadingHrTimeline] = useState(false);

  // 상품 타임라인 (우측 패널)
  const [selectedProductId, setSelectedProductId] = useState<number | null>(
    null
  );
  const [productTimeline, setProductTimeline] = useState<ProductTimelineItem[]>(
    []
  );
  const [loadingProductTimeline, setLoadingProductTimeline] = useState(false);

  /* 1) 프로필 불러오기 */
  useEffect(() => {
    if (!token || !driverId) return;
    setLoadingProfile(true);
    ApiService.fetchDriverProfile(driverId)
      .then((p) => setProfile(p ?? null))
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [token, driverId]);

  /* 2) 승인 목록에서 해당 driverId의 userId 찾아서 보관 (실시간 건강 필터용) */
  useEffect(() => {
    if (!token || !driverId) return;
    ApiService.fetchApprovedUsers({ page: 1, size: 1000 })
      .then((resp) => {
        const list: ApprovedUser[] = resp.data ?? [];
        const found = list.find((d) => d.driverId === driverId);
        setUserIdForDriver(found?.userId ? String(found.userId) : null);
      })
      .catch(() => setUserIdForDriver(null));
  }, [token, driverId]);

  /* 3) 배송중/완료 목록 — 배정 상품 API */
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

  /* 4) 실시간 건강(심박/걸음) — 초기 로딩(REST) */
  useEffect(() => {
    if (!token || !userIdForDriver) return;
    setLoadingRealtime(true);
    ApiService.fetchRealtimeHealth()
      .then((list) => {
        const mine = (list || []).find(
          (it) => String(it.userId) === String(userIdForDriver)
        );
        setRealtime(mine ?? null);
      })
      .catch(() => setRealtime(null))
      .finally(() => setLoadingRealtime(false));
  }, [token, userIdForDriver]);

  /* 4-1) WebSocket 구독 (관리자 웹, 성북구) — wsClient 대신 직접 연결 */
  useEffect(() => {
    if (!token || !profile) return;

    // BASE_URL 예: http://116.39.208.72:26443
    const host = BASE_URL.replace(/^http/, "ws"); // ws(s)로 변경
    const region = encodeURIComponent("성북구");
    const wsUrl = `${host}/ws/location?token=${encodeURIComponent(
      token as string
    )}&as=web&region=${region}`;

    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      // console.debug("WS open");
    };

    ws.onerror = () => {
      // console.warn("WS error");
    };

    ws.onclose = () => {
      // console.debug("WS closed");
    };

    ws.onmessage = (evt: MessageEvent<string>) => {
      try {
        const msg: WSMessage = JSON.parse(evt.data);

        if (msg.type === "health") {
          const p = msg.payload;
          if (p?.driverId === profile.driverId) {
            const hr = Number(p.heartRate ?? 0);
            const st = Number(p.step ?? 0);
            const recordedAt = p.recordedAt || p.capturedAt || null;

            // ✅ 타입(RealtimeHealthItem) 필드만 업데이트
            setRealtime((prev): RealtimeHealthItem => {
              return {
                userId:
                  (userIdForDriver ??
                    prev?.userId ??
                    (p.userId !== undefined ? String(p.userId) : "")) ||
                  "",
                heartRate: hr,
                step: st,
                capturedAt: recordedAt ?? prev?.capturedAt ?? "",
              };
            });
          }
        } else {
          // msg.type === "location" 인 케이스는 여기서 필요 시 처리
        }
      } catch {
        // 메시지 파싱 실패 무시
      }
    };

    return () => {
      try {
        ws.close();
      } catch {}
    };
  }, [token, profile, userIdForDriver]);

  /* 5) 심박수 타임라인 — 위험일 때만 호출 */
  const isDanger = useMemo(
    () => (profile?.conditionStatus ?? "") === "위험",
    [profile]
  );

  useEffect(() => {
    if (!token || !driverId || !isDanger) return;
    setLoadingHrTimeline(true);
    ApiService.fetchDriverHeartRateTimeline(driverId, { days: 1 })
      .then((pts) => setHrTimeline(Array.isArray(pts) ? pts : []))
      .catch(() => setHrTimeline([]))
      .finally(() => setLoadingHrTimeline(false));
  }, [token, driverId, isDanger]);

  /* 상품 카드 클릭 시 타임라인 */
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

  // 현재 탭 데이터/로딩
  const currentList = activeTab === "ONGOING" ? ongoing : completed;
  const loadingCurrent =
    activeTab === "ONGOING" ? loadingOngoing : loadingCompleted;

  // 라벨/테마
  const condition = profile?.conditionStatus ?? "알수없음";
  const conditionBadgeClass =
    condition === "위험" ? "danger" : condition === "불안" ? "warn" : "good";
  const profileCardClass = `profile-card ${isDanger ? "danger" : ""}`;
  const healthCardClass = `health-card ${isDanger ? "danger" : ""}`;

  // 특이사항(좋음/불안일 때만 심박 기반 표시)
  const liveHeartRate = Number(realtime?.heartRate ?? 0);
  const riskNote = useMemo(() => {
    if (isDanger) return null; // 위험은 별도 처리(타임라인 노출)
    if (liveHeartRate >= 150) return "고심박";
    if (liveHeartRate > 0 && liveHeartRate <= 45) return "저심박";
    return null;
  }, [isDanger, liveHeartRate]);

  // 포맷터
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

          {/* 건강 패널 — 실시간 건강 데이터 */}
          <div className={healthCardClass}>
            <h4>건강 상태</h4>
            {loadingRealtime ? (
              <p>실시간 건강 데이터를 불러오는 중...</p>
            ) : (
              <>
                <div className="info-row">
                  <span>💚 심박수</span>
                  <strong>{fmtNum(realtime?.heartRate ?? 0)} bpm</strong>
                </div>
                <div className="info-row">
                  <span>🟡 걸음수</span>
                  <strong>{fmtNum(realtime?.step ?? 0)} 걸음</strong>
                </div>

                {/* 작은 글씨 + 오른쪽 정렬 업데이트 시간 */}
                <div className="info-row info-row--update">
                  <span className="update-time">
                    업데이트 {fmtTime(realtime?.capturedAt ?? null)}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* 위험일 때만 심박수 타임라인 표시 */}
          {isDanger && (
            <div className="health-card danger">
              <h4>심박수 타임라인(최근)</h4>
              {loadingHrTimeline ? (
                <p>불러오는 중...</p>
              ) : hrTimeline.length === 0 ? (
                <p>기록이 없습니다.</p>
              ) : (
                <ul className="small-list">
                  {hrTimeline
                    .slice(-10)
                    .reverse()
                    .map((p, idx) => (
                      <li key={idx} className="small-row">
                        <span>{fmtTime(p.recordedAt)}</span>
                        <strong>{fmtNum(p.heartRate)} bpm</strong>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}
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

      {/* 하단 고정 Footer (검색 → /manage 이동) */}
      <Footer
        onSearch={(ff: FooterFilters, nq?: string) =>
          navigate("/manage", { state: { ff, nq } })
        }
      />
    </div>
  );
};

export default DriverDetail;
