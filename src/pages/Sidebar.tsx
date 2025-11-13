// src/components/Sidebar.tsx (또는 현재 경로에 맞게)

import React, { useContext } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import "../styles/Sidebar.css";
import { AuthContext } from "../context/AuthContext";

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const { isLoggedIn } = useContext(AuthContext);

  const cx = ({ isActive }: { isActive: boolean }) =>
    "sidebar-link" + (isActive ? " active" : "");

  // 🔒 보호된 메뉴 클릭 시 로그인 체크
  const requireLogin =
    (path: string) =>
    (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>) => {
      if (!isLoggedIn) {
        e.preventDefault(); // 라우터 이동 막기
        alert("로그인을 진행해주세요.");
        navigate("/login"); // 로그인 페이지로 보내기 (경로는 프로젝트에 맞게)
      }
      // 로그인 되어 있으면 그냥 NavLink 기본 동작
    };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-quote">'</span>box
      </div>
      <nav>
        <ul>
          <li>
            {/* 홈은 누구나 접근 가능 */}
            <NavLink to="/" end className={cx}>
              🏠 홈
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/register"
              className={cx}
              onClick={requireLogin("/register")}
            >
              👤➕ 신규 기사
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/manage"
              className={cx}
              onClick={requireLogin("/manage")}
            >
              🔍 기사 관제
            </NavLink>
          </li>

          <li>
            <NavLink
              to="/products/unassigned"
              className={cx}
              onClick={requireLogin("/products/unassigned")}
            >
              📦 물류 배정
            </NavLink>
          </li>
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
