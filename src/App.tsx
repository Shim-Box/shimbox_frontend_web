import React, { useContext } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { AuthProvider, AuthContext } from "./context/AuthContext";
import { NotificationsProvider } from "./context/NotificationsProvider";

import Main from "./pages/Main";
import Login from "./pages/Login";
import Manage from "./pages/Manage";
import DriverDetail from "./pages/DriverDetail";
import Register from "./pages/Register";
import UnassignedProducts from "./pages/UnassignedProducts";
import PopupNotice from "./components/PopupNotice";

/** 보호 라우트: 비로그인이면 메인("/")으로 */
function Protected({ children }: { children: React.ReactElement }) {
  const { isLoggedIn, loading } = useContext(AuthContext);
  if (loading) return null; // 초기 로딩 깜빡임 방지
  return isLoggedIn ? children : <Navigate to="/" replace />;
}

/** Provider 안에서만 token을 읽도록 분리 */
function AppShell() {
  const { token } = useContext(AuthContext); // ★ 이제 Provider 내부

  return (
    <BrowserRouter>
      <PopupNotice />

      {/* ★ token 변할 때 마다 라우트 트리 리마운트(잔재 초기화) */}
      <Routes key={token ? "auth" : "guest"}>
        {/* 첫 접속은 메인 페이지 */}
        <Route path="/" element={<Main />} />

        {/* 인증 불필요한 페이지 */}
        <Route path="/login" element={<Login />} />

        {/* ===== 로그인 필요(가드) 페이지들 ===== */}
        <Route
          path="/manage"
          element={
            <Protected>
              <Manage />
            </Protected>
          }
        />

        <Route
          path="/driver/:id"
          element={
            <Protected>
              <DriverDetail />
            </Protected>
          }
        />

        <Route
          path="/register"
          element={
            <Protected>
              <Register />
            </Protected>
          }
        />

        <Route
          path="/products/unassigned"
          element={
            <Protected>
              <UnassignedProducts />
            </Protected>
          }
        />

        {/* 그 외 경로는 메인으로 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function App() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <AppShell />
      </NotificationsProvider>
    </AuthProvider>
  );
}

export default App;
