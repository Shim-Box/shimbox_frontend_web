import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/Manage.css";

import { ApiService } from "../services/apiService";
import { ApprovedUser } from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";

// ✅ 좁은 리터럴 타입 정의 (API 시그니처와 일치)
type Attendance = "출근전" | "출근" | "퇴근";
type Condition = "위험" | "불안" | "좋음";

interface Filters {
  attendance?: Attendance;
  residence?: string;
  conditionStatus?: Condition;
  page?: number;
  size?: number;
}

const Manage: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);

  const [filters, setFilters] = useState<Filters>({ page: 1, size: 1000 });
  const [nameQuery, setNameQuery] = useState<string>("");
  const [drivers, setDrivers] = useState<ApprovedUser[]>([]);
  const [loading, setLoading] = useState(false);

  const loadApproved = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const resp = await ApiService.fetchApprovedUsers({
        attendance: filters.attendance,
        residence: filters.residence,
        conditionStatus: filters.conditionStatus,
        page: filters.page ?? 1,
        size: filters.size ?? 1000,
      });

      let list = resp.data ?? [];
      if (nameQuery.trim()) {
        const q = nameQuery.trim();
        list = list.filter((d) => d.name?.includes(q));
      }
      setDrivers(list);
    } catch (err) {
      console.error("승인된 회원 목록 조회 실패", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApproved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    token,
    filters.attendance,
    filters.residence,
    filters.conditionStatus,
    nameQuery,
  ]);

  const onAttendanceChange = (v: string) =>
    setFilters((prev) => ({
      ...prev,
      attendance: (v || undefined) as Attendance | undefined,
    }));

  const onConditionChange = (v: string) =>
    setFilters((prev) => ({
      ...prev,
      conditionStatus: (v || undefined) as Condition | undefined,
    }));

  const onResidenceChange = (v: string) =>
    setFilters((prev) => ({ ...prev, residence: v || undefined }));

  const handleFooterSearch = (ff: FooterFilters, nameQuery?: string) => {
    setFilters((prev) => ({
      ...prev,
      attendance: (ff.attendance || undefined) as Attendance | undefined,
      residence: ff.residence || undefined,
      conditionStatus: (ff.conditionStatus || undefined) as
        | Condition
        | undefined,
      page: 1,
      size: prev.size ?? 1000,
    }));
    setNameQuery(nameQuery || "");
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
              value={filters.attendance || ""}
              onChange={(e) => onAttendanceChange(e.target.value)}
            >
              <option value="">근무상태</option>
              <option value="출근전">출근전</option>
              <option value="출근">출근</option>
              <option value="퇴근">퇴근</option>
            </select>

            <select
              value={filters.residence || ""}
              onChange={(e) => onResidenceChange(e.target.value)}
            >
              <option value="">근무지</option>
              <option value="강남구">강남구</option>
              <option value="구로구">구로구</option>
              <option value="동대문구">동대문구</option>
              <option value="성북구">성북구</option>
              <option value="종로구">종로구</option>
            </select>

            <select
              value={filters.conditionStatus || ""}
              onChange={(e) => onConditionChange(e.target.value)}
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
                  key={d.driverId}
                  onClick={() => navigate(`/driver/${d.driverId}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td className="driver-name">
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

      <Footer onSearch={handleFooterSearch} />
    </div>
  );
};

export default Manage;
