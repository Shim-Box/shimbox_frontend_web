import React, { useState } from "react";
import Sidebar from "../pages/Sidebar";
import "../styles/Main.css";

import DetailMap from "../components/DetailMap";

const dummyDangerList = [
  { id: 1, name: "홍길동", bpm: 190 },
  { id: 2, name: "오아영", bpm: 188 },
];

const Main: React.FC = () => {
  const [hasDanger, setHasDanger] = useState(true);
  const [dangerList] = useState(dummyDangerList);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selectedDriver = dangerList.find((driver) => driver.id === selectedId);

  return (
    <div className="main-container">
      <Sidebar />

      <main className="main-content">
        <div className="stats">
          <div className="stat-card">
            전체 기사 수<br />
            <strong>100명</strong>
          </div>
          <div className="stat-card">
            현재 배송 중<br />
            <strong>50명</strong>
          </div>
          <div className="stat-card">
            오늘 누적 배송
            <br />
            <strong>224건</strong>
          </div>
          <div className="stat-card warning">
            {hasDanger ? (
              <>⚠️ 위험 상태인 택배기사가 {dangerList.length}명 있습니다</>
            ) : (
              <>⚠️ 현재 위험한 택배기사가 없습니다</>
            )}
          </div>
        </div>

        <div className="main-body">
          <div className="map-area">
            <DetailMap
              address="
서울특별시 구로구 경인로 445"
            />
          </div>

          {hasDanger && (
            <div className="danger-side-panel">
              <ul className="danger-list">
                {dangerList.map((driver) => (
                  <li
                    key={driver.id}
                    className={selectedId === driver.id ? "active" : ""}
                    onClick={() =>
                      setSelectedId((prevId) =>
                        prevId === driver.id ? null : driver.id
                      )
                    }
                  >
                    <img src="/images/PostDeliver.png" alt="프로필" />
                    {driver.name} <span>{driver.bpm} bpm</span>
                  </li>
                ))}
              </ul>

              {selectedDriver && (
                <div className="danger-detail">
                  <div className="danger-detail-header">
                    <img
                      src="/images/PostDeliver.png"
                      alt="프로필"
                      className="profile-image"
                    />
                    <div className="info">
                      <h3>{selectedDriver.name}</h3>
                      <span>서울시, 구로동</span>
                    </div>
                  </div>

                  <p>
                    <strong>근무시간:</strong> AM 09:00 ~ 근무중
                  </p>

                  <div className="section-divider" />

                  <p>
                    <strong>배송 건수:</strong> 12 / 20
                  </p>

                  <div className="section-divider" />

                  <p>
                    <strong>현재 상태:</strong>{" "}
                    <span className="red">위험</span>
                  </p>

                  <img
                    src="/images/Heart_rate_Graph.png"
                    alt="심박수 그래프"
                    className="heart_rate_graph"
                  />

                  <p>
                    <strong>심박수:</strong> {selectedDriver.bpm} bpm{" "}
                    <small>(정상: 60~100)</small>
                  </p>

                  <div className="section-divider" />

                  <div className="timeline">
                    <span>
                      <strong>타임라인</strong>
                    </span>
                    <br />
                    <p>
                      <span className="dot yellow"></span> 10:20 심박수 상승
                      시작
                    </p>
                    <p>
                      <span className="dot orange"></span> 10:50 심박수 110 bpm
                    </p>
                    <p>
                      <span className="dot red"></span> 11:10 심박수 190 bpm
                    </p>
                    <p>
                      <span className="dot red"></span> 11:30 위험 상태
                    </p>
                  </div>

                  <button className="alert-btn">🚨 응급 경고 전송</button>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Main;
