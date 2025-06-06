import React, { useState, useContext, useEffect } from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";
import { loginApi } from "../api/auth";
import { AuthContext } from "../context/AuthContext";

const Login: React.FC = () => {
  const navigate = useNavigate();
  const { token, isLoggedIn, setToken } = useContext(AuthContext);

  // 이미 로그인되어 있으면 바로 /main으로 리다이렉트
  useEffect(() => {
    if (isLoggedIn) {
      navigate("/main", { replace: true });
    }
  }, [isLoggedIn, navigate]);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogin = async () => {
    setErrorMsg(null);

    try {
      const res = await loginApi({ username, password });
      // 로그인 성공: 토큰을 context + sessionStorage에 저장
      setToken(res.access_token);

      navigate("/main");
    } catch (err: any) {
      console.error(err);

      setErrorMsg("로그인에 실패했습니다. 아이디/비밀번호를 확인하세요.");
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-logo">
          <span className="login-quote">'</span>box
        </h1>
        <input
          type="text"
          placeholder="ID"
          className="login-input"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <input
          type="password"
          placeholder="PASSWORD"
          className="login-input"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {errorMsg && (
          <p style={{ color: "red", marginTop: "0.5rem" }}>{errorMsg}</p>
        )}
        <button className="login-button" onClick={handleLogin}>
          로그인
        </button>
      </div>
    </div>
  );
};

export default Login;
