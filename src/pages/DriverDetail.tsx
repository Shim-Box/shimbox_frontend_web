import React, { useState, useEffect, useContext } from "react";
import { useParams } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/DriverDetail.css";
import DetailMap from "../components/DetailMap";
import { ApiService } from "../services/apiService";
import {
  ApprovedUser,
  DriverHealthData,
  DeliveryItem,
} from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";

const DriverDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token } = useContext(AuthContext);

  const [driver, setDriver] = useState<ApprovedUser | null>(null);
  const [health, setHealth] = useState<DriverHealthData | null>(null);
  const [ongoing, setOngoing] = useState<DeliveryItem[]>([]);
  const [completed, setCompleted] = useState<DeliveryItem[]>([]);
  const [activeTab, setActiveTab] = useState<"ONGOING" | "COMPLETED">("ONGOING");
  const [loadingDriver, setLoadingDriver] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingOngoing, setLoadingOngoing] = useState(false);
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoadingDriver(true);
    ApiService.fetchApprovedUsers(token, { page: 1, size: 1000 })
      .then((resp) => {
        const found = resp.data.find((d) => d.driverId === Number(id));
        setDriver(found ?? null);
      })
      .catch(() => setDriver(null))
      .finally(() => setLoadingDriver(false));
  }, [token, id]);

  useEffect(() => {
    if (!token || !driver || driver.attendance !== "퇴근") return;
    setLoadingHealth(true);
    ApiService.fetchDriverHealth(driver.driverId, token)
      .then((data) => setHealth(data))
      .catch(() => setHealth(null))
      .finally(() => setLoadingHealth(false));
  }, [token, driver]);

  useEffect(() => {
    if (!token || !driver) return;
    setLoadingOngoing(true);
    ApiService.fetchDriverOngoingProducts(driver.driverId, token)
      .then((list) => setOngoing(list))
      .catch(() => setOngoing([]))
      .finally(() => setLoadingOngoing(false));
  }, [token, driver]);

  useEffect(() => {
    if (!token || !driver) return;
    setLoadingCompleted(true);
    ApiService.fetchDriverCompletedProducts(driver.driverId, token)
      .then((list) => setCompleted(list))
      .catch(() => setCompleted([]))
      .finally(() => setLoadingCompleted(false));
  }, [token, driver]);

  if (loadingDriver) {
    return (
      <div className="driver-layout">
        <Sidebar />
        <div className="driver-detail-container">
          <p>기사 정보를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="driver-layout">
        <Sidebar />
        <div className="driver-detail-container">
          <p>해당 기사를 찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  const currentList = activeTab === "ONGOING" ? ongoing : completed;
  const loadingCurrent = activeTab === "ONGOING" ? loadingOngoing : loadingCompleted;
  const conditionStatus = health?.conditionStatus || driver.conditionStatus || "정보 없음";

  const formatKoreanTime = (dateString?: string) =>
    dateString ? new Date(dateString).toLocaleString("ko-KR") : "-";

  return (
    <div className="driver-layout">
      <Sidebar />
      <div className="driver-detail-container">
        <section className="left-panel">
          <div className="profile-card">
            <img
              src={driver.profileImageUrl || "/images/PostDeliver.png"}
              alt="기사 프로필"
              className="profile-image"
            />
            <h3>{driver.name}</h3>
            <p className="position">택배기사</p>

            <div className="info-row"><span className="info-label">거주지</span><span className="info-value">{driver.residence}</span></div>
            <div className="info-row"><span className="info-label">담당지</span><span className="info-value">{driver.residence}</span></div>
            <div className="info-row"><span className="info-label">근무상태</span><span className="info-value"><strong className={`status-badge ${driver.attendance === "출근" ? "on" : "off"}`}>{driver.attendance}</strong></span></div>
            {health && (
              <>
                <div className="info-row"><span className="info-label">출근</span><span className="info-value">{formatKoreanTime(health.workTime)}</span></div>
                <div className="info-row"><span className="info-label">퇴근</span><span className="info-value">{formatKoreanTime(health.leaveWorkTime)}</span></div>
              </>
            )}
            <div className="info-row"><span className="info-label">위험 지수</span><span className="info-value"><span className={`condition-dot ${conditionStatus}`}></span> {conditionStatus}</span></div>
          </div>

          {driver.attendance === "퇴근" && (
            <div className="health-card">
              {loadingHealth ? (
                <p>건강 데이터를 불러오는 중...</p>
              ) : health ? (
                <>
                  <div className="info-row"><span>💓 심박수:</span><strong>{health.heartRate} bpm</strong></div>
                  <div className="info-row"><span>🥕 걸음수:</span><strong>{health.step.toLocaleString()} 걸음</strong></div>
                  <div className="info-row"><span>상태:</span><span className="info-value"><span className={`condition-dot ${conditionStatus}`}></span> {conditionStatus}</span></div>
                </>
              ) : (
                <p>건강 데이터를 가져올 수 없습니다.</p>
              )}
            </div>
          )}
        </section>

        <section className="center-panel">
          <div className="delivery-wrapper">
            <div className="driver-detail-map-area">
              <DetailMap addresses={[driver.residence]} level={3} />
            </div>
            <div className="delivery-bottom-section">
              <div className="delivery-list">
                <h4>배송 목록&nbsp;<span className="count">{currentList.length}</span></h4>
                <div className="tabs">
                  <span className={`tab ${activeTab === "ONGOING" ? "active" : ""}`} onClick={() => setActiveTab("ONGOING")}>진행 중</span>
                  <span className={`tab ${activeTab === "COMPLETED" ? "active" : ""}`} onClick={() => setActiveTab("COMPLETED")}>완료</span>
                </div>
                {loadingCurrent ? (
                  <p>목록을 불러오는 중...</p>
                ) : currentList.length === 0 ? (
                  <p>{activeTab === "ONGOING" ? "진행 중인 배송이 없습니다." : "완료된 배송이 없습니다."}</p>
                ) : (
                  currentList.map((item) => (
                    <div key={item.productId} className="delivery-card">
                      <p className="address">{item.address} {item.detailAddress}<br /><small>({item.postalCode})</small></p>
                      <p className="summary">상품명: {item.productName}<br />수취인: {item.recipientName} ({item.recipientPhoneNumber})</p>
                      <p className="status">{item.shippingStatus}</p>
                    </div>
                  ))
                )}
              </div>
              <div className="right-panel">
                <h4>배송 타임라인</h4>
                <ul className="timeline">
                  {[{ time: '09:45', title: '상품 인수', desc: '동명미래대학교' },
                    { time: '10:45', title: '상품 이동 중', desc: '물류터미널 → 배송지역' },
                    { time: '11:30', title: '상품 이동 중', desc: '배송지역으로 이동중' },
                    { time: '11:50', title: '배송지 도착', desc: '상품 적재 완료' },
                    { time: '대기', title: '배송 대기', desc: '14시~15시 출발 예정' }].map((item, idx) => (
                    <li key={idx} className="timeline-item">
                      <div className="timeline-icon">✔</div>
                      <div className="timeline-content">
                        <div className="timeline-title">{item.title}</div>
                        <div className="timeline-desc">{item.desc}</div>
                      </div>
                      <div className="timeline-time">{item.time}</div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default DriverDetail;
