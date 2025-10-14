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
            {/* 공개 라우트 */}
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* 보호 라우트 (로그인 필요) */}
            <Route element={<PrivateRoute />}>
              <Route path="/main" element={<Main />} />
              <Route path="/manage" element={<Manage />} />
              <Route path="/driver/:id" element={<DriverDetail />} />
            </Route>

            {/* fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </NotificationsProvider>
    </AuthProvider>
  );
}

export default App;
