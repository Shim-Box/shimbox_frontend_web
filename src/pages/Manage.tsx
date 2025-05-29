import React, { useState } from "react";
import Sidebar from "../pages/Sidebar";
import DriverDetail from "./DriverDetail";
import "../styles/Manage.css";

const allDrivers = [
  {
    id: 1,
    name: "홍길동",
    status: "출근",
    area: "구로구",
    time: "AM 11:00 - PM 08:00",
    deliveries: "150 / 250",
    condition: "위험",
  },
  {
    id: 2,
    name: "오아영",
    status: "출근",
    area: "구로구",
    time: "AM 11:00 - PM 08:00",
    deliveries: "150 / 250",
    condition: "불안",
  },
  {
    id: 3,
    name: "김민수",
    status: "퇴근",
    area: "성북구",
    time: "AM 11:00 - PM 08:00",
    deliveries: "150 / 250",
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

const Manage: React.FC = () => {
  const [filters, setFilters] = useState({
    status: "",
    area: "",
    condition: "",
  });
  const [filteredDrivers, setFilteredDrivers] = useState(allDrivers);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleSearch = () => {
    const filtered = allDrivers.filter((driver) => {
      const matchStatus =
        filters.status === "" || driver.status === filters.status;
      const matchArea = filters.area === "" || driver.area === filters.area;
      const matchCondition =
        filters.condition === "" || driver.condition === filters.condition;
      return matchStatus && matchArea && matchCondition;
    });
    setFilteredDrivers(filtered);
  };

  return (
    <div className="manage-container">
      <Sidebar />

      <div className="manage-page">
        {!selectedDriverId ? (
          <>
            <div className="manage-header">
              <div>
                <h2>기사 목록</h2>
                <p className="subtitle">위험도별</p>
              </div>

              <div className="filter-bar">
                <select
                  onChange={(e) => handleFilterChange("status", e.target.value)}
                >
                  <option value="">근무상태</option>
                  <option value="출근">출근</option>
                  <option value="퇴근">퇴근</option>
                </select>
                <select
                  onChange={(e) => handleFilterChange("area", e.target.value)}
                >
                  <option value="">근무지</option>
                  <option value="구로구">구로구</option>
                  <option value="성북구">성북구</option>
                </select>
                <select
                  onChange={(e) =>
                    handleFilterChange("condition", e.target.value)
                  }
                >
                  <option value="">상태</option>
                  <option value="위험">위험</option>
                  <option value="불안">불안</option>
                  <option value="좋음">좋음</option>
                </select>
                <button className="search-btn" onClick={handleSearch}>
                  검색
                </button>
              </div>
            </div>

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
                {filteredDrivers.map((driver) => (
                  <tr
                    key={driver.id}
                    onClick={() => setSelectedDriverId(driver.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <img
                        src="./images/PostDeliver.png"
                        alt="프로필"
                        className="driver-img"
                      />
                      {driver.name}
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          driver.status === "출근" ? "on" : "off"
                        }`}
                      >
                        {driver.status}
                      </span>
                    </td>
                    <td>{driver.area}</td>
                    <td>{driver.time}</td>
                    <td>{driver.deliveries}</td>
                    <td>
                      <span className={`condition-dot ${driver.condition}`}>
                        ●
                      </span>{" "}
                      {driver.condition}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <DriverDetail />
        )}
      </div>
    </div>
  );
};

export default Manage;
