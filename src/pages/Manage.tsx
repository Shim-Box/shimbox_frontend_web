import React, { useState, useEffect, useContext } from "react";
import Sidebar from "../pages/Sidebar";
import { useNavigate } from "react-router-dom";
import "../styles/Manage.css";
import { ApiService } from "../services/apiService";
import { ApprovedUser } from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";

interface Filters {
  attendance: string;
  residence: string;
  conditionStatus: string;
}

const Manage: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);

  const [filters, setFilters] = useState<Filters>({
    attendance: "",
    residence: "",
    conditionStatus: "",
  });
  const [drivers, setDrivers] = useState<ApprovedUser[]>([]);
  const [loading, setLoading] = useState(false);

  const loadApproved = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const resp = await ApiService.fetchApprovedUsers(token, filters);
      setDrivers(resp.data);
    } catch (err) {
      console.error("승인된 회원 목록 조회 실패", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApproved();
  }, [token]);

  const handleFilterChange = (key: keyof Filters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="manage-container">
      <Sidebar />

      <div className="manage-page">
        <div className="manage-header">
          <div>
            <h2>기사 관제</h2>
            <p className="subtitle">승인된 회원 목록</p>
          </div>

          <div className="filter-bar">
            <select
              value={filters.attendance}
              onChange={(e) => handleFilterChange("attendance", e.target.value)}
            >
              <option value="">근무상태</option>
              <option value="출근">출근</option>
              <option value="퇴근">퇴근</option>
            </select>
            <select
              value={filters.residence}
              onChange={(e) => handleFilterChange("residence", e.target.value)}
            >
              <option value="">근무지</option>
              <option value="구로구">구로구</option>
              <option value="성북구">성북구</option>
            </select>
            <select
              value={filters.conditionStatus}
              onChange={(e) =>
                handleFilterChange("conditionStatus", e.target.value)
              }
            >
              <option value="">상태</option>
              <option value="위험">위험</option>
              <option value="불안">불안</option>
              <option value="좋음">좋음</option>
            </select>
            <button
              className="search-btn"
              onClick={loadApproved}
              disabled={loading}
            >
              검색
            </button>
          </div>
        </div>

        {loading ? (
          <p>로딩 중...</p>
        ) : (
          <table className="manage-table">
            <thead>
              <tr>
                <th>이름</th>
                <th>근무상태</th>
                <th>근무지</th>
                <th>근무시간</th>
                <th>배달건수</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/driver/${d.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <img
                      src={d.profileImageUrl || "/images/PostDeliver.png"}
                      alt="프로필"
                      className="driver-img"
                    />
                    {d.name}
                  </td>
                  <td>
                    <span
                      className={`status-badge ${
                        d.attendance === "출근" ? "on" : "off"
                      }`}
                    >
                      {d.attendance}
                    </span>
                  </td>
                  <td>{d.residence}</td>
                  <td>{d.workTime}</td>
                  <td>{d.deliveryStats}</td>
                  <td>
                    <span className={`condition-dot ${d.conditionStatus}`}>
                      ●
                    </span>{" "}
                    {d.conditionStatus}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default Manage;
