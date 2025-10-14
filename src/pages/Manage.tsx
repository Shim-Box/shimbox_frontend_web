// src/pages/Manage.tsx
import React, { useState, useEffect, useContext, useMemo } from "react";
import Sidebar from "../pages/Sidebar";
import { useNavigate } from "react-router-dom";
import "../styles/Manage.css";

import { ApiService } from "../services/apiService";
import { ApprovedUser } from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";

// ✅ 좁은 리터럴 타입
type Attendance = "출근전" | "출근" | "퇴근";
type Condition = "위험" | "불안" | "좋음";

interface Filters {
  attendance?: Attendance;
  residence?: string;
  conditionStatus?: Condition;
  page?: number;
  size?: number;
}

/** ─────────────────────────
 * 테스트용 DEMO 상태 주입 유틸
 *  - 출근 중 6명: [좋음,좋음,불안,불안,위험,위험]
 *  - 실제 데이터는 변경하지 않고, 화면에 표시될 리스트만 가공
 *  - 로컬스토리지 플래그로 온오프
 * ───────────────────────── */
const DEMO_FLAG_KEY = "demo:forceState"; // "1"이면 켜짐
const DEMO_COUNT_KEY = "demo:forceCount"; // 기본 6

function applyDemoForces(list: ApprovedUser[]): ApprovedUser[] {
  if (typeof window === "undefined") return list;

  const on = localStorage.getItem(DEMO_FLAG_KEY) === "1";
  if (!on) return list;

  const want = Number(localStorage.getItem(DEMO_COUNT_KEY) || 6);
  if (!Array.isArray(list) || list.length === 0) return list;

  // 원하는 분포
  const desired: Condition[] = ["좋음", "좋음", "불안", "불안", "위험", "위험"];
  const take = Math.min(want, desired.length, list.length);

  const cloned = list.map((u) => ({ ...u })); // 얕은 복사로 표시만 조정

  // 앞쪽에서부터 take명을 출근 + 목표 상태로 세팅
  for (let i = 0; i < take; i++) {
    cloned[i].attendance = "출근";
    cloned[i].conditionStatus = desired[i];
    // 화면 보조용 더미 값(있으면 UI가 더 자연스러움)
    cloned[i].workTime = cloned[i].workTime || "금일 4시간";
    cloned[i].deliveryStats = cloned[i].deliveryStats || "42건";
  }
  return cloned;
}

const Manage: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useContext(AuthContext);

  const [filters, setFilters] = useState<Filters>({ page: 1, size: 1000 });
  const [nameQuery, setNameQuery] = useState<string>("");
  const [driversRaw, setDriversRaw] = useState<ApprovedUser[]>([]);
  const [loading, setLoading] = useState(false);

  // 실제 API 호출
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
      setDriversRaw(list);
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

  // 화면에 표시할 리스트 (DEMO 주입 적용)
  const drivers = useMemo(() => applyDemoForces(driversRaw), [driversRaw]);

  // 필터 핸들러
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

  const handleFooterSearch = (ff: FooterFilters, nq?: string) => {
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
    setNameQuery(nq || "");
  };

  /** DEMO 토글 (테스트용 버튼) */
  const demoOn =
    (typeof window !== "undefined" &&
      localStorage.getItem(DEMO_FLAG_KEY) === "1") ||
    false;
  const toggleDemo = () => {
    if (typeof window === "undefined") return;
    if (demoOn) {
      localStorage.removeItem(DEMO_FLAG_KEY);
      localStorage.removeItem(DEMO_COUNT_KEY);
    } else {
      localStorage.setItem(DEMO_FLAG_KEY, "1");
      localStorage.setItem(DEMO_COUNT_KEY, "6"); // 출근 6명 강제
    }
    // 데이터 새로고침
    loadApproved();
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

          {/* 필터 + DEMO 토글 */}
          <div className="filter-bar" style={{ gap: 8 }}>
            <select
              value={filters.attendance || ""}
              onChange={(e) => onAttendanceChange(e.target.value)}
              title="근무상태"
            >
              <option value="">근무상태</option>
              <option value="출근전">출근전</option>
              <option value="출근">출근</option>
              <option value="퇴근">퇴근</option>
            </select>

            <select
              value={filters.residence || ""}
              onChange={(e) => onResidenceChange(e.target.value)}
              title="근무지"
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
              title="상태"
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

            {/* DEMO 토글 버튼: 개발/테스트용 */}
            <button
              type="button"
              onClick={toggleDemo}
              className="search-btn"
              style={{ background: demoOn ? "#2563eb" : "#9ca3af" }}
              title="테스트용: 출근 6명(좋음2/불안2/위험2) 강제"
            >
              {demoOn ? "DEMO 주입 ON" : "DEMO 주입 OFF"}
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
                  <td>{d.workTime || "-"}</td>
                  <td>{d.deliveryStats || "-"}</td>
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
