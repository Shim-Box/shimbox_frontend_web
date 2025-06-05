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

/**
 * PrivateRoute: isLoggedIn이 true여야만 children 컴포넌트 렌더.
 * 아니면 /login 으로 리다이렉트.
 */
const PrivateRoute: React.FC = () => {
  const { isLoggedIn } = useContext(AuthContext);
  return isLoggedIn ? <Outlet /> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />

          <Route path="/login" element={<Login />} />

          <Route path="/register" element={<Register />} />

          <Route element={<PrivateRoute />}>
            <Route path="/main" element={<Main />} />
            <Route path="/manage" element={<Manage />} />
            <Route path="/driver/:id" element={<DriverDetail />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
