import React from "react";
import { useParams } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/DriverDetail.css";

const allDrivers = [
  {
    id: 1,
    name: "홍길동",
    phone: "010-1234-1234",
    address: "서울시 구로구",
    area: "서울시 구로구",
    status: "출근",
    condition: "위험",
  },
  {
    id: 2,
    name: "오아영",
    phone: "010-5678-1234",
    address: "서울시 구로구",
    area: "서울시 구로구",
    status: "출근",
    condition: "불안",
  },
  {
    id: 3,
    name: "김민수",
    phone: "010-1111-2222",
    address: "서울시 성북구",
    area: "서울시 성북구",
    status: "퇴근",
    condition: "불안",
  },
  {
    id: 4,
    name: "이수진",
    status: "퇴근",
    area: "구로구",
    time: "AM 11:00 - PM 08:00",
    deliveries: "150 / 250",
    condition: "좋음",
  },
  {
    id: 5,
    name: "박지현",
    status: "출근",
    area: "성북구",
    time: "AM 11:00 - PM 08:00",
    deliveries: "150 / 250",
    condition: "좋음",
  },
  {
    id: 6,
    name: "최영수",
    status: "퇴근",
    area: "성북구",
    time: "AM 11:00 - PM 08:00",
    deliveries: "150 / 250",
    condition: "좋음",
  },
];

const DriverDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const driver = allDrivers.find((d) => d.id === Number(id));

  if (!driver) {
    return <div style={{ padding: 30 }}>해당 기사를 찾을 수 없습니다.</div>;
  }

  return (
    <div className="driver-layout">
      <Sidebar />
      <div className="driver-detail-container">
        <section className="left-panel">
          <div className="profile-card">
            <img
              src="/images/PostDeliver.png"
              alt="기사 프로필"
              className="profile-image"
            />
            <h3>{driver.name}</h3>
            <p className="position">택배기사</p>
            <p>전화번호: {driver.phone}</p>
            <p>거주지: {driver.address}</p>
            <p>담당지: {driver.area}</p>
            <p className="danger-note">
              위험 특이사항:{" "}
              <span className="red">
                {driver.condition === "위험" ? "고혈압" : "-"}
              </span>
            </p>
            <p className="risk-score">
              위험 지수:{" "}
              <span className={driver.condition === "좋음" ? "good" : "red"}>
                {driver.condition}
              </span>
            </p>
          </div>

          <div className="health-card">
            <p>
              💓 심박수: <strong>88 bpm</strong>
            </p>
            <p>
              🥕 걸음수: <strong>5,240 걸음</strong>
            </p>
          </div>
        </section>

        <section className="center-panel">
          <div className="delivery-wrapper">
            <div className="map-area">[지도 영역 - 퍼블리싱용]</div>

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
