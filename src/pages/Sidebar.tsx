import React from "react";
import { NavLink } from "react-router-dom";
import "../styles/Sidebar.css";

const Sidebar: React.FC = () => {
  const cx = ({ isActive }: { isActive: boolean }) =>
    "sidebar-link" + (isActive ? " active" : "");

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-quote">'</span>box
      </div>
      <nav>
        <ul>
          <li>
            <NavLink to="/main" className={cx}>
              🏠 홈
            </NavLink>
          </li>
          <li>
            <NavLink to="/register" className={cx}>
              👤➕ 신규 기사
            </NavLink>
          </li>
          <li>
            <NavLink to="/manage" className={cx}>
              🔍 기사 관제
            </NavLink>
          </li>
          <li>
            <NavLink to="/products/unassigned" className={cx}>
              📦 물류 배정
            </NavLink>
          </li>
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
