// src/api/auth.ts
import axios from "axios";

const API_BASE = "http://localhost:4000";

export interface LoginPayload {
  username: string;
  password: string;
}
export interface LoginResponse {
  access_token: string;
}

export const loginApi = async (data: LoginPayload): Promise<LoginResponse> => {
  const res = await axios.post<LoginResponse>(`${API_BASE}/login`, data);
  return res.data;
};

export interface MonitorData {
  serverTime: string;
  status: string;
  monitored: {
    temperature: number;
    cpuUsage: number;
    memoryUsage: number;
  };
}

export const fetchMonitorData = async (token: string): Promise<MonitorData> => {
  const res = await axios.get<MonitorData>(`${API_BASE}/monitor/data`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return res.data;
};
