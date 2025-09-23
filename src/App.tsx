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

import { NotificationsProvider } from "./context/NotificationsProvider";
import NotificationToaster from "./components/NotificationToaster";

const PrivateRoute: React.FC = () => {
  const { isLoggedIn, loading } = useContext(AuthContext);
  if (loading) return null;
  return isLoggedIn ? <Outlet /> : <Navigate to="/login" replace />;
};

function App() {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <BrowserRouter>
          <NotificationToaster />
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
      </NotificationsProvider>
    </AuthProvider>
  );
}

export default App;
