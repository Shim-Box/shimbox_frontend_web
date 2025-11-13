// src/context/AuthContext.tsx
import React, { createContext, ReactNode, useEffect, useState } from "react";

const AUTH_KEY = "accessToken"; // ✅ 세션스토리지 키 통일

interface AuthContextType {
  token: string | null;
  isLoggedIn: boolean;
  setToken: (token: string | null) => void;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType>({
  token: null,
  isLoggedIn: false,
  setToken: () => {},
  loading: true,
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // ✅ 세션스토리지에서만 복원 (처음 접속 시 자동로그인 방지)
    const saved = sessionStorage.getItem(AUTH_KEY);
    if (saved) setTokenState(saved);
    setLoading(false);
  }, []);

  const setToken = (newToken: string | null) => {
    if (newToken) {
      sessionStorage.setItem(AUTH_KEY, newToken);
      setTokenState(newToken);
    } else {
      sessionStorage.removeItem(AUTH_KEY);
      setTokenState(null);
    }
    // 과거 잔존 키 방어 제거
    try {
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem("monitorToken");
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ token, isLoggedIn: Boolean(token), setToken, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
