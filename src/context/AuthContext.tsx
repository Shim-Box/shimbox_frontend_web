import React, { createContext, ReactNode, useEffect, useState } from "react";

type AuthContextType = {
  token: string | null;
  isLoggedIn: boolean;
  setToken: (t: string | null) => void;
  logout: () => void;
  loading: boolean;
};

export const AuthContext = createContext<AuthContextType>({
  token: null,
  isLoggedIn: false,
  setToken: () => {},
  logout: () => {},
  loading: true,
});

const TOKEN_KEY = "monitorToken"; // sessionStorage 키

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 앱 부팅 시: sessionStorage에 토큰이 있으면 그때만 로그인 상태로
  useEffect(() => {
    const saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) setTokenState(saved);
    setLoading(false);
  }, []);

  const setToken = (t: string | null) => {
    if (t) {
      sessionStorage.setItem(TOKEN_KEY, t);
      setTokenState(t);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      setTokenState(null);
    }
  };

  const logout = () => setToken(null);

  return (
    <AuthContext.Provider
      value={{ token, isLoggedIn: !!token, setToken, logout, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
};
