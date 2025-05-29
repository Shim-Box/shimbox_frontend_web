import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Main from "./pages/Main";
import Register from "./pages/Register";
import Manage from "./pages/Manage";
import DriverDetail from "./pages/DriverDetail";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/main" element={<Main />} />
        <Route path="/register" element={<Register />} />
        <Route path="/manage" element={<Manage />} />
        <Route path="/driver/:id" element={<DriverDetail />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
