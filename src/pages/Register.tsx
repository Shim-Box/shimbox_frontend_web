import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/Register.css";
import { ApiService } from "../services/apiService";
import { PendingUser, ApprovedUser } from "../models/AdminModels";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";

/** 서버 허용 구 목록 */
const ALLOWED_GU = [
  "구로구",
  "양천구",
  "강서구",
  "영등포구",
  "금천구",
  "동작구",
  "성북구",
  "강북구",
  "동대문구",
  "성동구",
  "종로구",
  "중구",
] as const;

/** 선택된 값을 서버가 기대하는 포맷으로 정규화 */
const normalizeRegion = (raw: string) => {
  if (!raw) return "";
  const s = raw.trim().replace(/^서울(?:특별시|시)?\s*/g, "");
  return s;
};

const Register: React.FC = () => {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();

  const [drivers, setDrivers] = useState<PendingUser[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);

  // 지역 배정 모달 상태
  const [showAssign, setShowAssign] = useState(false);
  const [region1, setRegion1] = useState<string>("");
  const [region2, setRegion2] = useState<string>("");

  const loadPending = async () => {
    try {
      setLoading(true);
      const resp = await ApiService.fetchPendingUsers(1, 10);
      setDrivers(resp.data ?? []);
    } catch (err) {
      console.error("대기자 목록 조회 실패", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadPending();
  }, [token]);

  const toggleCheckbox = (id: number) => {
    setCheckedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  /** 승인 버튼 → 지역선택 모달 오픈 */
  const openAssignModal = () => {
    if (checkedIds.length === 0 || loading) return;
    setRegion1("");
    setRegion2("");
    setShowAssign(true);
  };

  const closeAssignModal = () => {
    if (loading) return;
    setShowAssign(false);
  };

  const handleAssignConfirm = async () => {
    const r1 = normalizeRegion(region1);
    const r2 = normalizeRegion(region2);

    if (!r1 || !r2) {
      alert("두 개의 구를 모두 선택해주세요.");
      return;
    }
    if (r1 === r2) {
      alert("서로 다른 두 개의 구를 선택해주세요.");
      return;
    }
    if (!ALLOWED_GU.includes(r1 as any) || !ALLOWED_GU.includes(r2 as any)) {
      alert(
        `허용된 구만 선택할 수 있습니다.\n허용값: ${ALLOWED_GU.join(", ")}`
      );
      return;
    }
    if (checkedIds.length === 0) {
      setShowAssign(false);
      return;
    }

    const ok = window.confirm(
      `총 ${checkedIds.length}명을 승인하고\n지역을 [${r1}], [${r2}] 로 배정합니다. 진행할까요?`
    );
    if (!ok) return;

    try {
      setLoading(true);

      // 이름/유저ID 맵
      const byId = new Map<number, PendingUser>(drivers.map((d) => [d.id, d]));

      const success: string[] = [];
      const failed: string[] = [];

      for (const uid of checkedIds) {
        const who = byId.get(uid);
        const label = who ? `${who.name}(${uid})` : String(uid);

        try {
          await ApiService.approveUsers([uid]);

          await new Promise((r) => setTimeout(r, 250));

          const approved = await ApiService.fetchApprovedUsers({
            page: 1,
            size: 1000,
          });
          const list: ApprovedUser[] = approved.data ?? [];
          const me = list.find((u) => u.userId === uid);
          if (!me || typeof me.driverId !== "number") {
            throw new Error("driverId 매핑에 실패했습니다.");
          }

          await ApiService.assignDriverRegion({
            driverId: me.driverId,
            region1: r1,
            region2: r2,
          });

          success.push(label);
        } catch (e: any) {
          const msg =
            e?.response?.data?.message ||
            e?.message ||
            "내부 서버 오류로 배정 실패";
          console.error(`승인/배정 실패 uid=${uid}:`, msg);
          failed.push(`${label} - ${msg}`);
        }
      }

      // 처리 요약
      const lines = [];
      if (success.length) lines.push(`✅ 성공: ${success.join(", ")}`);
      if (failed.length) lines.push(`❌ 실패: \n- ${failed.join("\n- ")}`);
      if (!lines.length) lines.push("처리된 항목이 없습니다.");
      alert(lines.join("\n\n"));

      setCheckedIds([]);
      setExpandedId(null);
      setShowAssign(false);
      await loadPending();
    } catch (err: any) {
      const serverMsg =
        err?.response?.data?.message ||
        err?.message ||
        "승인/배정 중 오류가 발생했습니다.";
      console.error("승인/배정 전체 실패", err);
      alert(serverMsg);
    } finally {
      setLoading(false);
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
            onClick={openAssignModal}
            disabled={checkedIds.length === 0 || loading}
            title={
              checkedIds.length === 0
                ? "승인할 대상을 선택하세요"
                : "선택한 대상을 승인합니다"
            }
          >
            ✅ {checkedIds.length}명 승인
          </button>
        </div>

        {loading && drivers.length === 0 ? (
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
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={checkedIds.includes(driver.id)}
                        onChange={() => toggleCheckbox(driver.id)}
                        disabled={loading}
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

      {/* 지역 배정 모달 */}
      {showAssign && (
        <div className="assign-modal-backdrop">
          <div className="assign-modal">
            <div className="assign-modal-header">
              <span>기사에게 배정할 구를 선택하세요</span>
              <button
                className="assign-close"
                onClick={closeAssignModal}
                disabled={loading}
                aria-label="닫기"
              >
                ×
              </button>
            </div>

            <div className="assign-body">
              <select
                className="assign-select"
                value={region1}
                onChange={(e) => setRegion1(e.target.value)}
                disabled={loading}
              >
                <option value="" disabled>
                  첫번째 구 선택
                </option>
                {ALLOWED_GU.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              <select
                className="assign-select"
                value={region2}
                onChange={(e) => setRegion2(e.target.value)}
                disabled={loading}
              >
                <option value="" disabled>
                  두번째 구 선택
                </option>
                {ALLOWED_GU.map((r) => (
                  <option key={r} value={r} disabled={r === region1}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <button
              className="assign-submit"
              onClick={handleAssignConfirm}
              disabled={loading || !region1 || !region2}
            >
              {loading ? "처리 중…" : "완료"}
            </button>
          </div>
        </div>
      )}

      <Footer
        onSearch={(ff: FooterFilters, nq?: string) =>
          navigate("/manage", { state: { ff, nq } })
        }
      />
    </div>
  );
};

export default Register;
