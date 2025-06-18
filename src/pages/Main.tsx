import React, { useState } from "react";
import Sidebar from "../pages/Sidebar";
import "../styles/Main.css";
import DetailMap from "../components/DetailMap";

interface DangerDriver {
  id: number;
  name: string;
  bpm: number;
  address: string;
}

const dummyDangerList: DangerDriver[] = [
  { id: 1, name: "김기사", bpm: 190, address: "서울특별시 구로구" },
  { id: 2, name: "이기사", bpm: 188, address: "서울특별시 동대문구" }, // 위험자
  { id: 3, name: "박기사", bpm: 175, address: "서울특별시 성북구" },
];

const Main: React.FC = () => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const selected = selectedIdx !== null ? dummyDangerList[selectedIdx] : null;

  const isDanger = selected?.name === "이기사";

  return (
    <div className="main-container">
      <Sidebar />

      <main className="main-content">
        <div className="stats">
          <div className="stat-card">전체 기사 수<br /><strong>100명</strong></div>
          <div className="stat-card">현재 배송 중<br /><strong>50명</strong></div>
          <div className="stat-card">오늘 누적 배송<br /><strong>224건</strong></div>
          <div className="stat-card warning">
            ⚠️ 위험 상태인 택배기사가<br/>1명 있습니다
          </div>
        </div>

        <div className="main-body">
          <div className="map-area">
            <DetailMap
              addresses={dummyDangerList.map((d) => d.address)}
              markerImageUrls={[
                "/images/driverMarker.png",
                "/images/dangerMarker.png",
                "/images/driverMarker.png",
              ]}
              markerSize={{ width: 35, height: 45 }}
              onMarkerClick={(idx: number) =>
                setSelectedIdx((prev) => (prev === idx ? null : idx))
              }
            />
          </div>

          {selected && (
            <div className="danger-side-panel">
              <ul className="danger-list">
                {dummyDangerList.map((driver, idx) => (
                  <li
                    key={driver.id}
                    className={selectedIdx === idx ? "active" : ""}
                    onClick={() =>
                      setSelectedIdx((prev) => (prev === idx ? null : idx))
                    }
                  >
                    <img src="/images/PostDeliver.png" alt="프로필" />
                    {driver.name} <span>{driver.bpm} bpm</span>
                  </li>
                ))}
              </ul>

              <div className="danger-detail">
                <div className="danger-detail-header">
                  <img
                    src="/images/PostDeliver.png"
                    alt="프로필"
                    className="profile-image"
                  />
                  <div className="info">
                    <h3>{selected.name}</h3>
                    <span>위치: {selected.address}</span>
                  </div>
                </div>

                <p><strong>근무시간:</strong> AM 09:00 ~ 근무중</p>
                <div className="section-divider" />
                <p><strong>배송 건수:</strong> 12 / 20</p>

                {isDanger && (
                  <>
                    <div className="section-divider" />
                    <p><strong>현재 상태:</strong> <span className="red">위험</span></p>
                    <img
                      src="/images/Heart_rate_Graph.png"
                      alt="심박수 그래프"
                      className="heart_rate_graph"
                    />
                    <p><strong>심박수:</strong> {selected.bpm} bpm <small>(정상: 60~100)</small></p>
                    <div className="timeline">
                      <span>
                        <strong>타임라인</strong>
                      </span>
                      <br />
                      <br />
                      <p><span className="dot yellow"></span> 10:20 심박수 상승 시작</p>
                      <p><span className="dot orange"></span> 10:50 심박수 110 bpm</p>
                      <p><span className="dot red"></span> 11:10 심박수 190 bpm</p>
                      <p><span className="dot red"></span> 11:30 위험 상태</p>
                    </div>
                    <button className="alert-btn">🚨 응급 경고 전송</button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Main;
