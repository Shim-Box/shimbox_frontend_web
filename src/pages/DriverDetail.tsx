// src/pages/DriverDetail.tsx
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
  const [activeTab, setActiveTab] = useState<"ONGOING" | "COMPLETED">(
    "ONGOING"
  );
  const [loadingDriver, setLoadingDriver] = useState(true);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [loadingOngoing, setLoadingOngoing] = useState(false);
  const [loadingCompleted, setLoadingCompleted] = useState(false);

  // 1) 기사 기본 정보 조회
  useEffect(() => {
    if (!token) return;
    setLoadingDriver(true);
    ApiService.fetchApprovedUsers(token, { page: 1, size: 1000 })
      .then((resp) => {
        const found = resp.data.find((d) => d.driverId === Number(id));
        setDriver(found ?? null);
      })
      .catch((err) => {
        console.error("기사 상세 조회 실패", err);
        setDriver(null);
      })
      .finally(() => setLoadingDriver(false));
  }, [token, id]);

  // 2) 건강 데이터 조회 (퇴근 시에만)
  useEffect(() => {
    if (!token || !driver || driver.attendance !== "퇴근") return;
    setLoadingHealth(true);
    ApiService.fetchDriverHealth(driver.driverId, token)
      .then((data) => setHealth(data))
      .catch((err) => {
        console.error("건강 데이터 조회 실패", err);
        setHealth(null);
      })
      .finally(() => setLoadingHealth(false));
  }, [token, driver]);

  // 3) 배송중 상품 조회
  useEffect(() => {
    if (!token || !driver) return;
    setLoadingOngoing(true);
    ApiService.fetchDriverOngoingProducts(driver.driverId, token)
      .then((list) => setOngoing(list))
      .catch((err) => {
        console.error("배송중 상품 조회 실패", err);
        setOngoing([]);
      })
      .finally(() => setLoadingOngoing(false));
  }, [token, driver]);

  // 4) 배송완료 상품 조회
  useEffect(() => {
    if (!token || !driver) return;
    setLoadingCompleted(true);
    ApiService.fetchDriverCompletedProducts(driver.driverId, token)
      .then((list) => setCompleted(list))
      .catch((err) => {
        console.error("배송완료 상품 조회 실패", err);
        setCompleted([]);
      })
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
  const loadingCurrent =
    activeTab === "ONGOING" ? loadingOngoing : loadingCompleted;

  return (
    <div className="driver-layout">
      <Sidebar />
      <div className="driver-detail-container">
        {/* 왼쪽 패널: 프로필 + 건강 */}
        <section className="left-panel">
          <div className="profile-card">
            <img
              src={driver.profileImageUrl || "/images/PostDeliver.png"}
              alt="기사 프로필"
              className="profile-image"
            />
            <h3>{driver.name}</h3>
            <p className="position">택배기사</p>
            <p>거주지: {driver.residence}</p>
            <p>담당지: {driver.residence}</p>
            <p>
              근무상태:&nbsp;
              <strong
                className={`status-badge ${
                  driver.attendance === "출근" ? "on" : "off"
                }`}
              >
                {driver.attendance}
              </strong>
            </p>
            {health && (
              <>
                <p>
                  출근:{" "}
                  <strong>{new Date(health.workTime).toLocaleString()}</strong>
                </p>
                <p>
                  퇴근:{" "}
                  <strong>
                    {new Date(health.leaveWorkTime).toLocaleString()}
                  </strong>
                </p>
              </>
            )}
            <p>
              위험 지수:&nbsp;
              <span className={`condition-dot ${driver.conditionStatus}`}>
                ●
              </span>
              &nbsp;
              {driver.conditionStatus}
            </p>
          </div>

          {driver.attendance === "퇴근" && (
            <div className="health-card">
              {loadingHealth ? (
                <p>건강 데이터를 불러오는 중...</p>
              ) : health ? (
                <>
                  <p>
                    💓 심박수: <strong>{health.heartRate} bpm</strong>
                  </p>
                  <p>
                    🥕 걸음수:{" "}
                    <strong>{health.step.toLocaleString()} 걸음</strong>
                  </p>
                  <p>
                    상태:&nbsp;
                    <span className={`condition-dot ${health.conditionStatus}`}>
                      ●
                    </span>
                    &nbsp;
                    {health.conditionStatus}
                  </p>
                </>
              ) : (
                <p>건강 데이터를 가져올 수 없습니다.</p>
              )}
            </div>
          )}
        </section>

        {/* 중앙 패널: 지도 및 배송 목록 */}
        <section className="center-panel">
          <div className="delivery-wrapper">
            <div className="driver-detail-map-area">
              <DetailMap addresses={[driver.residence]} level={3} />
            </div>

            <div className="delivery-bottom-section">
              <div className="delivery-list">
                <h4>
                  배송 목록&nbsp;
                  <span className="count">
                    {activeTab === "ONGOING"
                      ? ongoing.length
                      : completed.length}
                  </span>
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
                    <div key={item.productId} className="delivery-card">
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

              <div className="right-panel">
                <h4>배송 타임라인</h4>
                <ul className="timeline">
                  <li>
                    <span className="check">✔</span> 09:45 상품 인수
                    <div className="desc">동명미래대학교</div>
                  </li>
                  <li>
                    <span className="check">✔</span> 10:45 상품 이동 중
                    <div className="desc">물류터미널 → 배송지역</div>
                  </li>
                  <li>
                    <span className="check">✔</span> 11:30 상품 이동 중
                    <div className="desc">배송지역으로 이동중</div>
                  </li>
                  <li>
                    <span className="check">✔</span> 11:50 배송지 도착
                    <div className="desc">상품 적재 완료</div>
                  </li>
                  <li>
                    <span className="check">✔</span> 배송 대기
                    <div className="desc">14시~15시 출발 예정</div>
                  </li>
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
