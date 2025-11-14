// src/pages/Login.tsx
import React, { useState, useContext, useEffect } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { ApiService } from "../services/apiService";
import { AuthContext } from "../context/AuthContext";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { isLoggedIn, setToken } = useContext(AuthContext);

  useEffect(() => {
    if (isLoggedIn) {
      navigate("/", { replace: true });  // ✅ /main -> /
    }
  }, [isLoggedIn, navigate]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setErrorMsg(null);
    setLoading(true);
    try {
      const tokens = await ApiService.login({ email: username, password });
      setToken(tokens.accessToken);
      sessionStorage.setItem("refreshToken", tokens.refreshToken);
      navigate("/", { replace: true });   // ✅ /main -> /
    } catch (err: any) {
      console.error(err);
      setErrorMsg("로그인에 실패했습니다. 이메일과 비밀번호를 확인하세요.");
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-logo">
          <span className="login-quote">'</span>box
        </h1>

        <input
          type="email"
          placeholder="Email"
          className="login-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={onKeyDown}
          autoFocus
        />

        <input
          type="password"
          placeholder="Password"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={onKeyDown}
        />

        {errorMsg && (
          <p style={{ color: "red", marginTop: "0.5rem" }}>{errorMsg}</p>
        )}

        <button
          className="login-button"
          onClick={handleLogin}
          disabled={loading}
        >
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </div>
    </div>
  );
};

export default Login;
