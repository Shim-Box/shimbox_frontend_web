// src/App.tsx
import React, { useContext } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
} from "react-router-dom";
import { AuthProvider, AuthContext } from "./context/AuthContext";
import Login from "./pages/Login";
import Main from "./pages/Main";
import Register from "./pages/Register";
import Manage from "./pages/Manage";
import DriverDetail from "./pages/DriverDetail";
import PopupNotice from "./components/PopupNotice";
import { NotificationsProvider } from "./context/NotificationsProvider";
import UnassignedProducts from "./pages/UnassignedProducts";

const PrivateRoute: React.FC = () => {
  const { isLoggedIn, loading } = useContext(AuthContext);
  if (loading) return null;

  return isLoggedIn ? (
    <>
      <PopupNotice />
      <Outlet />
    </>
  ) : (
    <Navigate to="/login" replace />
  );
};

function App() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <BrowserRouter>
          <Routes>
            {/* ✅ 공개 라우트 */}
            <Route path="/" element={<Main />} />            {/* 메인 공개 */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* 레거시 호환: /main -> / 로 리다이렉트 */}
            <Route path="/main" element={<Navigate to="/" replace />} />

            {/* ✅ 보호 라우트 (로그인 필요) */}
            <Route element={<PrivateRoute />}>
              <Route path="/manage" element={<Manage />} />
              <Route path="/driver/:id" element={<DriverDetail />} />
              <Route path="/products/unassigned" element={<UnassignedProducts />} />
            </Route>

            {/* fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationsProvider>
    </AuthProvider>
  );
}

export default App;
