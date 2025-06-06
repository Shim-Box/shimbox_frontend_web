import React, { createContext, ReactNode, useEffect, useState } from "react";

interface AuthContextType {
  token: string | null;
  isLoggedIn: boolean;
  setToken: (token: string | null) => void;
}

export const AuthContext = createContext<AuthContextType>({
  token: null,
  isLoggedIn: false,
  setToken: () => {},
});

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [token, setTokenState] = useState<string | null>(null);

  // 초기 렌더 시 sessionStorage에서 토큰이 있으면 상태에 반영
  useEffect(() => {
    const saved = sessionStorage.getItem("monitorToken");
    if (saved) {
      setTokenState(saved);
    }
  }, []);

  // 토큰을 변경할 때마다 sessionStorage에도 저장/제거
  const setToken = (newToken: string | null) => {
    if (newToken) {
      sessionStorage.setItem("monitorToken", newToken);
      setTokenState(newToken);
    } else {
      sessionStorage.removeItem("monitorToken");
      setTokenState(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ token, isLoggedIn: Boolean(token), setToken }}
    >
      {children}
    </AuthContext.Provider>
  );
};
