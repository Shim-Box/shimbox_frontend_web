import React, { useState } from "react";
import Sidebar from "../pages/Sidebar";
import "../styles/Register.css";

const dummyDrivers = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  name: "홍길동",
  career: "주 4-5일/ 6~8시간",
  license: "인증 완료",
  area: "성북구",
  phone: "010-8524-5648",
  birth: "99.05.05",
  isExperienced: true,
  workPlace: "구로구",
  totalDeliveries: 300,
  avgWorkTime: "8시간",
  health: "고혈압",
}));

const Register: React.FC = () => {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);

  const toggleCheckbox = (id: number) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <div className="register-container">
      <Sidebar />

      <div className="register-page">
        <div className="register-header">
          <div>
            <h2>배송 기사 신청 현황</h2>
            <p>경력 / 신입</p>
          </div>
          <button className="approve-button">✅ 기사 승인</button>
        </div>

        <table className="driver-table">
          <thead>
            <tr>
              <th>이름</th>
              <th>경력</th>
              <th>운전면허</th>
              <th>거주지</th>
              <th>전화번호</th>
              <th>선택</th>
            </tr>
          </thead>
          <tbody>
            {dummyDrivers.map((driver) => (
              <React.Fragment key={driver.id}>
                <tr
                  className="driver-row"
                  onClick={() =>
                    setSelectedId((prev) =>
                      prev === driver.id ? null : driver.id
                    )
                  }
                >
                  <td>
                    <img
                      src="/images/PostDeliver.png"
                      alt="기사"
                      className="driver-img"
                    />
                    {driver.name}
                  </td>
                  <td>{driver.career}</td>
                  <td>{driver.license}</td>
                  <td>{driver.area}</td>
                  <td>{driver.phone}</td>
                  <td>
                    <input
                      type="checkbox"
                      checked={checkedIds.includes(driver.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleCheckbox(driver.id);
                      }}
                    />
                  </td>
                </tr>
                {selectedId === driver.id && (
                  <tr className="detail-row">
                    <td colSpan={6}>
                      <div className="detail-box">
                        <div>
                          <strong>생년월일</strong>
                          <br />
                          {driver.birth}
                        </div>
                        <div>
                          <strong>경력 구분</strong>
                          <br />
                          {driver.isExperienced ? "경력자" : "신입"}
                        </div>
                        <div>
                          <strong>담당 근무지</strong>
                          <br />
                          {driver.workPlace}
                        </div>
                        <div>
                          <strong>평균 배송 건수</strong>
                          <br />
                          {driver.totalDeliveries}건
                        </div>
                        <div>
                          <strong>평균 근무 시간</strong>
                          <br />
                          {driver.avgWorkTime}
                        </div>
                        <div>
                          <strong>건강 상태</strong>
                          <br />
                          <span className="danger-dot" /> {driver.health}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Register;
