import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/Register.css";
import { ApiService } from "../services/apiService";
import { PendingUser } from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";

const Register: React.FC = () => {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  const [drivers, setDrivers] = useState<PendingUser[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  const loadPending = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const page = 1,
        size = 10;
      const resp = await ApiService.fetchPendingUsers(token, page, size);
      setDrivers(resp.data ?? []);
    } catch (err) {
      console.error("대기자 목록 조회 실패", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPending();
  }, [token]);

  const toggleCheckbox = (id: number) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleApprove = async () => {
    if (!token || checkedIds.length === 0) return;
    try {
      await ApiService.approveUsers(checkedIds, token);
      setCheckedIds([]);
      setExpandedId(null);
      await loadPending();
    } catch (err) {
      console.error("기사 승인 실패", err);
    }
  };

  const handleFooterSearch = (filters: FooterFilters, nameQuery?: string) => {
    navigate("/manage", { state: { ff: filters, nq: nameQuery } });
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
          <button
            className="approve-button"
            onClick={handleApprove}
            disabled={checkedIds.length === 0 || loading}
          >
            ✅ {checkedIds.length}명 승인
          </button>
        </div>

        {loading ? (
          <p>로딩 중...</p>
        ) : (
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
              {drivers.map((driver) => (
                <React.Fragment key={driver.id}>
                  <tr
                    className="driver-row"
                    onClick={() =>
                      setExpandedId((prev) =>
                        prev === driver.id ? null : driver.id
                      )
                    }
                  >
                    <td>{driver.name}</td>
                    <td>{driver.career}</td>
                    <td>
                      {driver.licenseImage ? (
                        <>
                          ✅ 인증 완료
                          <br />
                          <a
                            href={driver.licenseImage}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            면허 이미지 보기
                          </a>
                        </>
                      ) : (
                        "❌ 인증 실패"
                      )}
                    </td>
                    <td>{driver.residence}</td>
                    <td>{driver.phoneNumber}</td>
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

                  {expandedId === driver.id && (
                    <tr className="detail-row">
                      <td colSpan={6}>
                        <div
                          className={`detail-box ${
                            driver.career === "초보자" ? "hide-average" : ""
                          }`}
                        >
                          <div>
                            <strong>생년월일</strong>
                            <br />
                            {driver.birth}
                          </div>
                          <div>
                            <strong>담당 근무지</strong>
                            <br />
                            {driver.residence}
                          </div>
                          <div>
                            <strong>평균 근무 시간</strong>
                            <br />
                            {driver.averageWorking}
                          </div>
                          <div>
                            <strong>평균 배송 건수</strong>
                            <br />
                            {driver.averageDelivery}
                          </div>
                          <div>
                            <strong>건강 정보</strong>
                            <br />
                            {driver.bloodPressure}
                          </div>
                          <div>
                            <strong>승인 상태</strong>
                            <br />
                            {driver.approvalStatus ? "승인됨" : "대기중"}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Footer onSearch={handleFooterSearch} />
    </div>
  );
};

export default Register;
