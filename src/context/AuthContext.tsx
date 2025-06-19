import React, { createContext, ReactNode, useEffect, useState } from "react";

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

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("monitorToken");
    if (saved) {
      setTokenState(saved);
    }
    setLoading(false);
  }, []);

  const setToken = (newToken: string | null) => {
    if (newToken) {
      localStorage.setItem("monitorToken", newToken);
      setTokenState(newToken);
    } else {
      localStorage.removeItem("monitorToken");
      setTokenState(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{ token, isLoggedIn: Boolean(token), setToken, loading }}
    >
      {children}
    </AuthContext.Provider>
  );
};
