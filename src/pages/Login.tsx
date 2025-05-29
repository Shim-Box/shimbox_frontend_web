import React from "react";
import "../styles/Login.css";
import { useNavigate } from "react-router-dom";

const Login: React.FC = () => {
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate("/main");
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h1 className="login-logo">
          <span className="login-quote">'</span>box
        </h1>
        <input type="text" placeholder="ID" className="login-input" />
        <input type="password" placeholder="PASSWORD" className="login-input" />
        <button className="login-button" onClick={handleLogin}>
          관리자 로그인
        </button>
      </div>
    </div>
  );
};

export default Login;
