// src/pages/DriverDetail.tsx
import React, { useState, useEffect, useContext } from "react";
import { useParams } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/DriverDetail.css";
import DetailMap from "../components/DetailMap";
import { ApiService } from "../services/apiService";
import { ApprovedUser } from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";

const DriverDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { token } = useContext(AuthContext);

  const [driver, setDriver] = useState<ApprovedUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    ApiService.fetchApprovedUsers(token, { page: 1, size: 1000 })
      .then((resp) => {
        // resp.data.items 는 ApprovedUser[]
        const found = resp.data.find((d) => d.id === Number(id));
        setDriver(found ?? null);
      })
      .catch((err) => console.error("기사 상세 조회 실패", err))
      .finally(() => setLoading(false));
  }, [token, id]);

  if (loading) {
    return (
      <div className="driver-layout">
        <Sidebar />
        <div className="driver-detail-container">
          <p>로딩 중...</p>
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

  return (
    <div className="driver-layout">
      <Sidebar />
      <div className="driver-detail-container">
        {/* 왼쪽 프로필 카드 */}
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
              근무상태:{" "}
              <strong
                className={`status-badge ${
                  driver.attendance === "출근" ? "on" : "off"
                }`}
              >
                {driver.attendance}
              </strong>
            </p>
            <p>
              위험 지수:{" "}
              <span className={`condition-dot ${driver.conditionStatus}`}>
                ●
              </span>{" "}
              {driver.conditionStatus}
            </p>
          </div>

          {/* 아직 API가 없어서 플래이스홀더 */}
          <div className="health-card">
            <p>
              💓 심박수: <strong>88 bpm</strong>
            </p>
            <p>
              🥕 걸음수: <strong>5,240 걸음</strong>
            </p>
          </div>
        </section>

        {/* 중앙 지도 & 배송 부분 */}
        <section className="center-panel">
          <div className="delivery-wrapper">
            <div className="driver-detail-map-area">
              {/* DetailMap 컴포넌트는 address 대신 residence 사용 */}
              <DetailMap addresses={[driver.residence]} level={3} />
            </div>

            {/* 배송 목록 & 타임라인 */}
            <div className="delivery-bottom-section">
              <div className="delivery-list">
                <h4>
                  배송 목록 <span className="count">10/50</span>
                </h4>
                <div className="tabs">
                  <span className="tab">완료</span>
                  <span className="tab active">진행 중</span>
                </div>

                <div className="delivery-card">
                  <p className="address">신도림동 푸르지오 103동 902호</p>
                  <p className="summary">배송 건수: 4건</p>
                  <p className="status">배송 진행 중</p>
                  <button className="view-button">상세 보기</button>
                </div>

                <div className="delivery-card">
                  <p className="address">신도림동 푸르지오 103동 1002호</p>
                  <p className="summary">배송 건수: 1건</p>
                  <p className="status">배송 진행 중</p>
                  <button className="view-button">상세 보기</button>
                </div>
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
                    <div className="desc">
                      기사가 상품 적재를 완료하였습니다
                    </div>
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
