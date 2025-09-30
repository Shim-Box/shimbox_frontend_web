import React, { useEffect, useMemo, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/Main.css";
import DetailMap from "../components/DetailMap";
import { ApiService } from "../services/apiService";
import { ApprovedUser } from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";

/** 승인된 기사 목록 더미 */
type MiniStatus = "좋음" | "경고" | "위험";
type AttendanceMini = "출근" | "퇴근" | "출근전";
interface MiniDriverCard {
  driverId: number;
  name: string;
  residence: string;
  status: MiniStatus;
  attendance: AttendanceMini;
  worktimeLabel: string;
  delivered: number;
  total: number;
  profileImageUrl?: string;
}

const dummyApprovedMini: MiniDriverCard[] = [
  {
    driverId: 101,
    name: "홍길동",
    residence: "서울특별시 구로구 경인로 445",
    status: "좋음",
    attendance: "출근",
    worktimeLabel: "AM 09:00 ~ 근무중",
    delivered: 12,
    total: 20,
    profileImageUrl: "/images/PostDeliver.png",
  },
  {
    driverId: 102,
    name: "김민수",
    residence: "서울특별시 성북구 종암로 25",
    status: "위험",
    attendance: "출근",
    worktimeLabel: "AM 08:30 ~ 근무중",
    delivered: 5,
    total: 22,
    profileImageUrl: "/images/PostDeliver.png",
  },
  {
    driverId: 103,
    name: "오아영",
    residence: "서울특별시 동대문구 장한로 10",
    status: "경고",
    attendance: "출근",
    worktimeLabel: "AM 09:00 ~ 근무중",
    delivered: 9,
    total: 18,
    profileImageUrl: "/images/PostDeliver.png",
  },
  {
    driverId: 104,
    name: "이준호",
    residence: "서울특별시 강남구 테헤란로 152",
    status: "좋음",
    attendance: "출근전",
    worktimeLabel: "AM 10:00 ~ 예정",
    delivered: 0,
    total: 0,
    profileImageUrl: "/images/PostDeliver.png",
  },
  {
    driverId: 105,
    name: "박지수",
    residence: "서울특별시 마포구 월드컵북로 400",
    status: "위험",
    attendance: "출근",
    worktimeLabel: "AM 07:50 ~ 근무중",
    delivered: 14,
    total: 25,
    profileImageUrl: "/images/PostDeliver.png",
  },
  {
    driverId: 106,
    name: "최유리",
    residence: "서울특별시 용산구 청파로 74",
    status: "경고",
    attendance: "출근",
    worktimeLabel: "AM 09:10 ~ 근무중",
    delivered: 11,
    total: 19,
    profileImageUrl: "/images/PostDeliver.png",
  },
  {
    driverId: 107,
    name: "정해인",
    residence: "서울특별시 종로구 세종대로 175",
    status: "좋음",
    attendance: "출근",
    worktimeLabel: "AM 09:00 ~ 근무중",
    delivered: 7,
    total: 16,
    profileImageUrl: "/images/PostDeliver.png",
  },
  {
    driverId: 108,
    name: "한지민",
    residence: "서울특별시 은평구 연서로 365",
    status: "경고",
    attendance: "퇴근",
    worktimeLabel: "AM 06:00 ~ PM 02:00",
    delivered: 20,
    total: 20,
    profileImageUrl: "/images/PostDeliver.png",
  },
  {
    driverId: 109,
    name: "서강준",
    residence: "서울특별시 노원구 동일로 1414",
    status: "좋음",
    attendance: "출근",
    worktimeLabel: "AM 09:20 ~ 근무중",
    delivered: 6,
    total: 14,
    profileImageUrl: "/images/PostDeliver.png",
  },
  {
    driverId: 110,
    name: "아이유",
    residence: "서울특별시 송파구 올림픽로 300",
    status: "위험",
    attendance: "출근",
    worktimeLabel: "AM 08:10 ~ 근무중",
    delivered: 10,
    total: 24,
    profileImageUrl: "/images/PostDeliver.png",
  },
];

/** 정렬/필터 모드: 상태우선 vs 위험만 vs ID순 */
type DangerMode = "status" | "dangerOnly" | "id";

const Main: React.FC = () => {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  // 상단 통계(백엔드 연결 시 사용)
  const [totalApproved, setTotalApproved] = useState<number>(0);
  const [onDutyCount, setOnDutyCount] = useState<number>(0);
  const [totalCompleted, setTotalCompleted] = useState<number>(0);
  const [loadingStats, setLoadingStats] = useState<boolean>(false);

  const [miniList] = useState<MiniDriverCard[]>(dummyApprovedMini);

  const dangerCount = useMemo(
    () => miniList.filter((m) => m.status === "위험").length,
    [miniList]
  );
  const hasDanger = dangerCount > 0;

  const [dangerMode, setDangerMode] = useState<DangerMode>("status");

  const shownList = useMemo(() => {
    const order: Record<MiniStatus, number> = { 위험: 0, 경고: 1, 좋음: 2 };
    let base = [...miniList];

    if (dangerMode === "dangerOnly") {
      base = base.filter((m) => m.status === "위험");
      base.sort((a, b) => {
        const ra = a.total ? a.delivered / a.total : 0;
        const rb = b.total ? b.delivered / b.total : 0;
        return rb - ra;
      });
    } else if (dangerMode === "id") {
      base.sort((a, b) => a.driverId - b.driverId);
    } else {
      base.sort((a, b) => {
        const d = order[a.status] - order[b.status];
        if (d !== 0) return d;
        return a.name.localeCompare(b.name, "ko");
      });
    }
    return base;
  }, [miniList, dangerMode]);

  const mapAddresses = useMemo(
    () => shownList.map((m) => m.residence),
    [shownList]
  );

  const cycleMode = () => {
    if (hasDanger) {
      setDangerMode((prev) =>
        prev === "status"
          ? "dangerOnly"
          : prev === "dangerOnly"
          ? "id"
          : "status"
      );
    } else {
      setDangerMode((prev) => (prev === "status" ? "id" : "status"));
    }
  };

  useEffect(() => {
    if (!token) return;

    let mounted = true;
    (async () => {
      try {
        setLoadingStats(true);

        const approved = await ApiService.fetchApprovedUsers(token, {
          page: 1,
          size: 1000,
        });
        const list: ApprovedUser[] = approved.data ?? [];

        const approvedCount =
          typeof (approved as any).totalElements === "number"
            ? (approved as any).totalElements
            : list.length;

        const onDuty = list.filter((d) => d.attendance === "출근").length;

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

  // Footer 검색 → Manage 이동
  const handleFooterSearch = (ff: FooterFilters, nq?: string) => {
    navigate("/manage", { state: { ff, nq } });
  };

  return (
    <div className="main-container">
      <Sidebar />

      <main className="main-content">
        {/* 통계 카드 + 위험 패널 */}
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

          {/* 위험 패널 */}
          <div
            className="stat-card warning clickable"
            role="button"
            tabIndex={0}
            onClick={cycleMode}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                cycleMode();
              }
            }}
            aria-pressed={dangerMode !== "status"}
          >
            <div className="danger-panel-content">
              <div className="danger-headline">
                {hasDanger
                  ? `⚠️ 현재 위험한 기사 ${dangerCount}명 있습니다`
                  : `⚠️ 현재 위험한 택배기사가 없습니다`}
              </div>
            </div>
          </div>
        </div>

        {/* 지도 + 오른쪽 승인 기사 목록 */}
        <div className="main-body">
          <div className="map-area">
            <DetailMap
              addresses={mapAddresses}
              level={7} /* 약 2km 스케일 */
              markerImageUrls={shownList.map(() => "/images/driverMarker.png")}
              markerSize={{ width: 35, height: 45 }}
              onMarkerClick={() => {}}
            />
          </div>

          <aside className="right-side">
            {shownList.map((m) => {
              const ratio =
                m.total > 0
                  ? Math.min(100, Math.round((m.delivered / m.total) * 100))
                  : 0;
              const statusClass =
                m.status === "좋음"
                  ? "good"
                  : m.status === "경고"
                  ? "warn"
                  : "danger";

              return (
                <div
                  key={m.driverId}
                  className={`driver-mini-card border-${statusClass}`}
                  onClick={() => navigate(`/driver/${m.driverId}`)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/driver/${m.driverId}`);
                    }
                  }}
                >
                  <div className="mini-header">
                    <img
                      src={m.profileImageUrl || "/images/PostDeliver.png"}
                      alt="프로필"
                      className="mini-avatar"
                    />
                    <div className="mini-meta">
                      <div className="mini-name">
                        {m.name}{" "}
                        <span className={`mini-pill ${statusClass}`}>
                          {m.status}
                        </span>
                      </div>
                      <div className="mini-sub">{m.residence}</div>
                    </div>
                  </div>

                  <div className="mini-row">
                    <span className="mini-label">근무시간</span>
                    <span className="mini-value">{m.worktimeLabel}</span>
                  </div>

                  <div className="mini-row">
                    <span className="mini-label">배송 건수</span>
                    <span className="mini-value">
                      {m.delivered} / {m.total}
                    </span>
                  </div>

                  <div className="mini-progress">
                    <div
                      className={`mini-bar ${statusClass}`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </aside>
        </div>
      </main>

      <Footer onSearch={handleFooterSearch} />
    </div>
  );
};

export default Main;
