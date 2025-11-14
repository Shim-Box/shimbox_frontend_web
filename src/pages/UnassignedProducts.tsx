import React, { useEffect, useMemo, useState, useContext } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../pages/Sidebar";
import "../styles/UnassignedProducts.css";
import { ApiService } from "../services/apiService";
import { AuthContext } from "../context/AuthContext";
import Footer, { FooterFilters } from "../pages/Footer";

type UnassignedItem = {
  productId: number;
  productName: string;
  recipientName: string;
  recipientPhoneNumber: string;
  address: string;
  detailAddress: string;
  postalCode: string;
  deliveryImageUrl?: string | null;
};

type FieldKey = "ALL" | "productName" | "recipientName" | "address" | "postalCode";

const PAGE_SIZE = 15;

const UnassignedProduct: React.FC = () => {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();
  const [items, setItems] = useState<UnassignedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [assigning, setAssigning] = useState(false); // 🔥 AI 배정 실행 중 여부

  // 검색 상태
  const [query, setQuery] = useState("");
  const [field, setField] = useState<FieldKey>("ALL");

  // 페이지네이션 상태
  const [page, setPage] = useState(1);

  // ─────────────── 데이터 로딩 ───────────────
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    ApiService.fetchUnassignedProducts()
      .then((list) => {
        const validList = Array.isArray(list) ? list : [];
        setItems(validList);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token]);

  // ─────────────── 검색 필터링 ───────────────
  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return items;

    const lower = q.toLowerCase();
    const match = (it: UnassignedItem) => {
      const addrFull = `${it.address ?? ""} ${it.detailAddress ?? ""}`.trim();
      if (field === "productName") return (it.productName ?? "").toLowerCase().includes(lower);
      if (field === "recipientName") return (it.recipientName ?? "").toLowerCase().includes(lower);
      if (field === "address") return addrFull.toLowerCase().includes(lower);
      if (field === "postalCode") return (it.postalCode ?? "").toLowerCase().includes(lower);

      return (
        (it.productName ?? "").toLowerCase().includes(lower) ||
        (it.recipientName ?? "").toLowerCase().includes(lower) ||
        addrFull.toLowerCase().includes(lower) ||
        (it.postalCode ?? "").toLowerCase().includes(lower)
      );
    };
    return items.filter(match);
  }, [items, query, field]);

  // 검색어/필드 변경 시 1페이지로 이동
  useEffect(() => {
    setPage(1);
  }, [query, field]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // 현재 페이지 데이터
  const pageData = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, page]);

  // 페이지네이션 버튼
  const pageButtons = useMemo(() => {
    const maxButtons = 7;
    let start = Math.max(1, page - Math.floor(maxButtons / 2));
    let end = Math.min(totalPages, start + maxButtons - 1);
    if (end - start + 1 < maxButtons) start = Math.max(1, end - maxButtons + 1);
    const arr: number[] = [];
    for (let i = start; i <= end; i++) arr.push(i);
    return arr;
  }, [page, totalPages]);

  const go = (p: number) => setPage(Math.min(totalPages, Math.max(1, p)));

  // ─────────────── 전체 배정 버튼 ───────────────
  const handleAssignAll = async () => {
    if (assigning) return;
    if (filtered.length === 0) return;

    const ok = window.confirm("AI 자동 배정을 실행할까요?");
    if (!ok) return;

    try {
      setAssigning(true);

      // ***Flask AI 서버 호출 (python -m scripts.assign_tomorrow 실행)
      const res: any = await ApiService.runAiAssignTomorrow();

      alert(res?.message || "AI 물류 배정을 완료했습니다.");

      // 배정 후, 미할당 상품 목록 다시 로딩
      const list = await ApiService.fetchUnassignedProducts();
      const validList = Array.isArray(list) ? list : [];
      setItems(validList);
      setPage(1);
    } catch (e) {
      console.error(e);
      alert("AI 물류 배정 실행 중 오류가 발생했습니다.");
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="unassigned-container">
      <Sidebar />

      <div className="unassigned-page">
        <div className="unassigned-header">
          <div>
            <h2>물류 배정</h2>
            <p className="subtitle">할당되지 않은 상품 목록</p>
          </div>

          {/* 검색 바 + 버튼들 */}
          <div className="toolbar">
            <select
              className="field-select"
              value={field}
              onChange={(e) => setField(e.target.value as FieldKey)}
              aria-label="검색 대상 선택"
            >
              <option value="ALL">전체</option>
              <option value="productName">상품명</option>
              <option value="recipientName">수취인</option>
              <option value="address">주소</option>
              <option value="postalCode">우편번호</option>
            </select>

            <input
              className="search-input"
              type="text"
              placeholder="검색어를 입력하세요"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setQuery("");
              }}
            />

            {query && (
              <button className="clear-btn" onClick={() => setQuery("")}>
                지우기
              </button>
            )}

            <div className="assign-group">
              <button
                className="assign-secondary"
                disabled={filtered.length === 0 || assigning}
                onClick={handleAssignAll}
                title="필터 결과 전체 배정"
              >
                {assigning ? "배정 중..." : "전체 물류 배정"}
              </button>
            </div>
          </div>
        </div>

        <div className="result-summary">
          총 {filtered.length.toLocaleString()}건
          {query ? ` (검색어: “${query}”)` : ""}
        </div>

        {loading ? (
          <p>로딩 중...</p>
        ) : filtered.length === 0 ? (
          <div className="empty">할당 대기 중인 상품이 없습니다.</div>
        ) : (
          <>
            <table className="unassigned-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>상품명</th>
                  <th>수취인</th>
                  <th>연락처</th>
                  <th>주소</th>
                  <th>우편번호</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((it) => (
                  <tr key={it.productId}>
                    <td>{it.productId}</td>
                    <td>{it.productName}</td>
                    <td>{it.recipientName}</td>
                    <td>{it.recipientPhoneNumber}</td>
                    <td>
                      {it.address} {it.detailAddress}
                    </td>
                    <td>{it.postalCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="pagination">
              <button onClick={() => go(1)} disabled={page === 1} aria-label="첫 페이지">
                «
              </button>
              <button
                onClick={() => go(page - 1)}
                disabled={page === 1}
                aria-label="이전 페이지"
              >
                ‹
              </button>

              {pageButtons.map((p) => (
                <button
                  key={p}
                  className={p === page ? "active" : ""}
                  onClick={() => go(p)}
                  aria-current={p === page ? "page" : undefined}
                >
                  {p}
                </button>
              ))}

              <button
                onClick={() => go(page + 1)}
                disabled={page === totalPages}
                aria-label="다음 페이지"
              >
                ›
              </button>
              <button
                onClick={() => go(totalPages)}
                disabled={page === totalPages}
                aria-label="마지막 페이지"
              >
                »
              </button>
            </div>
          </>
        )}
      </div>

      <Footer
        onSearch={(ff: FooterFilters, nq?: string) =>
          navigate("/manage", { state: { ff, nq } })
        }
      />
    </div>
  );
};

export default UnassignedProduct;
