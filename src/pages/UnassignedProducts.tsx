import React, { useEffect, useMemo, useState, useContext, useRef } from "react";
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

const PAGE_SIZE = 20;
const ANIM_MS = 450; // CSS와 동일(0.85s)
const GAP_MS = 80;  // 다음 줄로 넘어가기 전 약간의 텀

const UnassignedProduct: React.FC = () => {
  const { token } = useContext(AuthContext);
  const navigate = useNavigate();
  const [items, setItems] = useState<UnassignedItem[]>([]);
  const [loading, setLoading] = useState(false);

  // 검색 상태
  const [query, setQuery] = useState("");
  const [field, setField] = useState<FieldKey>("ALL");

  // 페이지네이션 상태
  const [page, setPage] = useState(1);

  // 선택 상태(상품 ID 집합) — 페이지 이동/검색 변화에도 유지
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // 애니메이션 중인 행(사라질 예정)
  const [leaving, setLeaving] = useState<Set<number>>(new Set());

  // 헤더 전체선택 체크박스 ref(일부 선택 시 indeterminate)
  const headerCheckRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    ApiService.fetchUnassignedProducts()
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [token]);

  // 검색 필터링
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

  // (수정) 필터 결과 전체 기준 전체선택 여부
  const allCheckedFiltered = useMemo(() => {
    if (filtered.length === 0) return false;
    return filtered.every((it) => selected.has(it.productId));
  }, [filtered, selected]);

  // (선택 일부인 경우) 헤더 체크박스 indeterminate 반영
  useEffect(() => {
    if (!headerCheckRef.current) return;
    const someChecked = filtered.some((it) => selected.has(it.productId));
    headerCheckRef.current.indeterminate = someChecked && !allCheckedFiltered;
  }, [filtered, selected, allCheckedFiltered]);

  const toggleOne = (id: number, checked: boolean) => {
    setSelected((prev) => {
      const ns = new Set(prev);
      if (checked) ns.add(id);
      else ns.delete(id);
      return ns;
    });
  };

  // (수정) 헤더 전체선택: 필터 결과 전체(모든 페이지) 토글
  const toggleFilteredAll = (checked: boolean) => {
    setSelected((prev) => {
      if (checked) {
        return new Set(filtered.map((it) => it.productId));
      }
      // 해제
      const ns = new Set(prev);
      filtered.forEach((it) => ns.delete(it.productId));
      return ns;
    });
  };

  // 기존 "전체 선택" 버튼(필터 결과 전체)과 동일 동작
  const toggleAllPages = () => {
    setSelected((prev) => {
      const allIds = filtered.map((it) => it.productId);
      const allSelected = allIds.length > 0 && allIds.every((id) => prev.has(id));
      return allSelected ? new Set<number>() : new Set(allIds);
    });
  };

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

  // 순차(정말 한 줄씩) 애니메이션 + 제거
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const animateAssignAndRemove = async (ids: number[]) => {
    for (const id of ids) {
      // 1) 애니메이션 시작
      setLeaving((prev) => new Set([...prev, id]));

      // 2) 애니메이션 시간만큼 대기
      await sleep(ANIM_MS);

      // 3) 실제 제거
      setItems((prev) => prev.filter((it) => it.productId !== id));
      setSelected((prev) => {
        const ns = new Set(prev);
        ns.delete(id);
        return ns;
      });

      // 4) leaving 상태 해제
      setLeaving((prev) => {
        const ns = new Set(prev);
        ns.delete(id);
        return ns;
      });

      // 5) 다음 줄로 넘어가기 전 아주 살짝 텀
      await sleep(GAP_MS);
    }
  };

  const handleAssignSelected = async () => {
    const ids = Array.from(selected).filter((id) => filtered.some((it) => it.productId === id));
    if (ids.length === 0) return;
    await animateAssignAndRemove(ids);
  };

  const handleAssignAll = async () => {
    const allIds = filtered.map((it) => it.productId);
    if (allIds.length === 0) return;
    await animateAssignAndRemove(allIds);
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

          {/* 검색 바 + 배정 버튼들 */}
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
              {/* 필터 결과(모든 페이지) 전체 선택/해제 */}
              <button
                className="assign-tertiary"
                disabled={filtered.length === 0}
                onClick={toggleAllPages}
                title="필터 결과(모든 페이지) 전체 선택/해제"
                aria-pressed={filtered.length > 0 && filtered.every((it) => selected.has(it.productId))}
              >
                전체 선택
              </button>

              <button
                className="assign-primary"
                disabled={selected.size === 0}
                onClick={handleAssignSelected}
                title="체크된 상품만 배정"
              >
                선택 배정
              </button>
              <button
                className="assign-secondary"
                disabled={filtered.length === 0}
                onClick={handleAssignAll}
                title="필터 결과 전체 배정"
              >
                전체 물류 배정
              </button>
            </div>
          </div>
        </div>

        <div className="result-summary">
          총 {filtered.length.toLocaleString()}건
          {query ? ` (검색어: “${query}”)` : ""} · 선택 {selected.size}건
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
                  <th style={{ width: 44 }}>
                    {/* (수정) 필터 결과 전체 토글 */}
                    <input
                      ref={headerCheckRef}
                      type="checkbox"
                      checked={allCheckedFiltered}
                      onChange={(e) => toggleFilteredAll(e.target.checked)}
                      aria-label="필터 결과 전체 선택"
                    />
                  </th>
                  <th>ID</th>
                  <th>상품명</th>
                  <th>수취인</th>
                  <th>연락처</th>
                  <th>주소</th>
                  <th>우편번호</th>
                </tr>
              </thead>
              <tbody>
                {pageData.map((it) => {
                  const checked = selected.has(it.productId);
                  return (
                    <tr
                      key={it.productId}
                      className={leaving.has(it.productId) ? "leaving" : ""}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => toggleOne(it.productId, e.target.checked)}
                          aria-label={`${it.productId} 선택`}
                          disabled={leaving.has(it.productId)}
                        />
                      </td>
                      <td>{it.productId}</td>
                      <td>{it.productName}</td>
                      <td>{it.recipientName}</td>
                      <td>{it.recipientPhoneNumber}</td>
                      <td>
                        {it.address} {it.detailAddress}
                      </td>
                      <td>{it.postalCode}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <div className="pagination">
              <button onClick={() => go(1)} disabled={page === 1} aria-label="첫 페이지">
                «
              </button>
              <button onClick={() => go(page - 1)} disabled={page === 1} aria-label="이전 페이지">
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
        onSearch={(ff: FooterFilters, nq?: string) => navigate("/manage", { state: { ff, nq } })}
      />
    </div>
  );
};

export default UnassignedProduct;
