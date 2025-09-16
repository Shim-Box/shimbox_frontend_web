import React, { useEffect, useMemo, useState, useContext } from "react";
import Sidebar from "../pages/Sidebar";
import "../styles/Main.css";
import DetailMap from "../components/DetailMap";
import { ApiService } from "../services/apiService";
import { ApprovedUser } from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";

interface DangerDriver {
  id: number;
  name: string;
  bpm: number;
  address: string;
}

// 임시 위험 기사 목록(지도/우측 상세용)
const dummyDangerList: DangerDriver[] = [
  { id: 1, name: "홍길동", bpm: 190, address: "서울특별시 구로구 경인로 445" },
  { id: 2, name: "오아영", bpm: 188, address: "서울특별시 동대문구 장한로 10" },
  { id: 3, name: "김민수", bpm: 175, address: "서울특별시 성북구 종암로 25" },
];

const Main: React.FC = () => {
  const { token } = useContext(AuthContext);

  // 통계 상태
  const [totalApproved, setTotalApproved] = useState<number>(0);
  const [onDutyCount, setOnDutyCount] = useState<number>(0);
  const [totalCompleted, setTotalCompleted] = useState<number>(0);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);

  // 위험 기사 상세(오른쪽 패널)
  const [dangerList] = useState<DangerDriver[]>(dummyDangerList);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const hasDanger = dangerList.length > 0;
  const selectedDriver = useMemo(
    () => (selectedIdx !== null ? dangerList[selectedIdx] : null),
    [selectedIdx, dangerList]
  );

  // 경고 카드 클릭/키보드 토글
  const toggleDangerDetailFromStatCard = () => {
    if (!hasDanger) return;
    setSelectedIdx((prev) => (prev === null ? 0 : null));
  };
  const handleStatCardKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (
    e
  ) => {
    if (!hasDanger) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelectedIdx((prev) => (prev === null ? 0 : null));
    }
  };

  // 통계 로딩
  useEffect(() => {
    if (!token) return;

    let mounted = true;
    (async () => {
      try {
        setLoadingStats(true);

        //승인된 기사 목록 가져오기
        const approved = await ApiService.fetchApprovedUsers(token, {
          page: 1,
          size: 1000,
        });

        const list: ApprovedUser[] = approved.data ?? [];
        const approvedCount =
          typeof approved.totalElements === "number"
            ? approved.totalElements
            : list.length;

        const onDuty = list.filter((d) => d.attendance === "출근").length;

        //기사별 완료 목록 합산
        const completedCounts = await Promise.all(
          list.map(async (d) => {
            try {
              const items = await ApiService.fetchDriverCompleted(
                d.driverId,
                token
              );
              return Array.isArray(items) ? items.length : 0;
            } catch {
              return 0;
            }
          })
        );

        const completedSum = completedCounts.reduce((acc, n) => acc + n, 0);

        if (!mounted) return;
        setTotalApproved(approvedCount);
        setOnDutyCount(onDuty);
        setTotalCompleted(completedSum);
      } catch (e) {
        if (!mounted) return;
        setTotalApproved(0);
        setOnDutyCount(0);
        setTotalCompleted(0);

        console.error("메인 통계 로딩 실패:", e);
      } finally {
        if (mounted) setLoadingStats(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  return (
    <div className="main-container">
      <Sidebar />

      <main className="main-content">
        {/* 통계 카드 */}
        <div className="stats">
          <div className="stat-card" aria-busy={loadingStats}>
            전체 기사 수
            <br />
            <strong>
              {loadingStats ? "…" : totalApproved.toLocaleString()}명
            </strong>
          </div>

          <div className="stat-card" aria-busy={loadingStats}>
            현재 배송 중
            <br />
            <strong>
              {loadingStats ? "…" : onDutyCount.toLocaleString()}명
            </strong>
          </div>

          <div className="stat-card" aria-busy={loadingStats}>
            오늘 누적 배송
            <br />
            <strong>
              {loadingStats ? "…" : totalCompleted.toLocaleString()}건
            </strong>
          </div>

          {/* 경고 카드: 클릭/키보드로 상세 토글 */}
          <div
            className="stat-card warning"
            role="button"
            tabIndex={0}
            onClick={toggleDangerDetailFromStatCard}
            onKeyDown={handleStatCardKeyDown}
            style={{ cursor: hasDanger ? "pointer" : "default" }}
            aria-pressed={selectedIdx !== null}
            aria-label={
              hasDanger
                ? `위험 상태 기사 ${dangerList.length}명. 클릭하면 상세가 ${
                    selectedIdx !== null ? "닫힙니다" : "열립니다"
                  }.`
                : "현재 위험한 택배기사가 없습니다."
            }
            title={hasDanger ? "클릭하여 위험 기사 상세 열기/닫기" : undefined}
          >
            {hasDanger ? (
              <>⚠️ 위험 상태인 택배기사가 {dangerList.length}명 있습니다</>
            ) : (
              <>⚠️ 현재 위험한 택배기사가 없습니다</>
            )}
          </div>
        </div>

        {/* 지도 + 위험 상세 */}
        <div className="main-body">
          <div className="map-area">
            <DetailMap
              addresses={dangerList.map((d) => d.address)}
              level={7} // 약 2km 스케일
              markerImageUrls={[
                "/images/driverMarker.png",
                "/images/dangerMarker.png",
                "/images/driverMarker.png",
              ]}
              markerSize={{ width: 35, height: 45 }}
              onMarkerClick={(idx: number) => setSelectedIdx(idx)}
            />
          </div>

          {/* 오른쪽 상세 패널 */}
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
                  <span>위치: {selectedDriver.address}</span>
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
                <strong>현재 상태:</strong> <span className="red">위험</span>
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
                  <span className="dot yellow"></span> 10:20 심박수 상승 시작
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
      </main>
    </div>
  );
};

export default Main;
