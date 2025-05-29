// src/components/Sidebar.tsx
import React from "react";
import { NavLink } from "react-router-dom";
import "../styles/Sidebar.css";

const Sidebar: React.FC = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-quote">'</span>box
      </div>
      <nav>
        <ul>
          <li>
            <NavLink to="/main" className="sidebar-link">
              🏠 홈
            </NavLink>
          </li>
          <li>
            <NavLink to="/register" className="sidebar-link">
              👤➕ 신규 기사
            </NavLink>
          </li>
          <li>
            <NavLink to="/manage" className="sidebar-link">
              🔍 기사 관제
            </NavLink>
          </li>
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;
