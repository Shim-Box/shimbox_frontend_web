import axios, { AxiosResponse } from "axios";
import { BASE_URL } from "../env";
import { ApiResponse } from "../models/ApiResponse";
import {
  AdminSignupData,
  AuthTokens,
  PendingUser,
  ApprovedUser,
  DriverHealthData,
  DriverRealtimeData,
  DeliveryItem,
} from "../models/AdminModels";
import { PaginatedResponse } from "../models/PaginatedResponse";
import { SignupData } from "../models/SignupData";

const client = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

// 응답 래퍼 추출 헬퍼
function unwrap<T>(res: AxiosResponse<ApiResponse<T>>): T {
  if (res.status === 200) return res.data.data;
  throw new Error(res.data.message);
}

export const ApiService = {
  registerAdmin(data: SignupData) {
    return client
      .post<ApiResponse<AdminSignupData>>("/api/v1/auth/save/admin", data)
      .then(unwrap);
  },

  login(data: SignupData) {
    return client
      .post<ApiResponse<AuthTokens>>("/api/v1/auth/login", data)
      .then(unwrap);
  },

  approveUsers(userIds: number[], token: string) {
    return client
      .patch<ApiResponse<number[]>>(
        "/api/v1/admin/status",
        { userIds },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(unwrap);
  },

  fetchPendingUsers(token: string, page = 1, size = 10) {
    return client
      .get<ApiResponse<PaginatedResponse<PendingUser>>>(
        "/api/v1/admin/pending",
        {
          params: { page, size },
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      .then(unwrap);
  },

  fetchApprovedUsers(
    token: string,
    filters: {
      residence?: string;
      attendance?: string;
      conditionStatus?: string;
      page?: number;
      size?: number;
    } = {}
  ) {
    return client
      .get<ApiResponse<PaginatedResponse<ApprovedUser>>>(
        "/api/v1/admin/approved",
        {
          params: filters,
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      .then(unwrap);
  },

  fetchDriverHealth(driverId: number, token: string) {
    return client
      .get<ApiResponse<DriverHealthData>>(
        `/api/v1/admin/driver/health/${driverId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(unwrap);
  },

  fetchDriverRealtime(driverId: number, token: string) {
    return client
      .get<ApiResponse<DriverRealtimeData>>(
        `/api/v1/admin/driver/realtime/${driverId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(unwrap);
  },

  // 배송 중인 상품 목록
  fetchDriverDelivering(driverId: number, token: string) {
    return client
      .get<ApiResponse<DeliveryItem[]>>(
        `/api/v1/admin/driver/product/${driverId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(unwrap);
  },

  // 배송 완료된 상품 목록
  fetchDriverCompleted(driverId: number, token: string) {
    return client
      .get<ApiResponse<DeliveryItem[]>>(
        `/api/v1/admin/driver/complete/${driverId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(unwrap);
  },

  fetchDriverOngoingProducts(driverId: number, token: string) {
    return client
      .get<ApiResponse<DeliveryItem[]>>(
        `/api/v1/admin/driver/product/${driverId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(unwrap);
  },
  fetchDriverCompletedProducts(driverId: number, token: string) {
    return client
      .get<ApiResponse<DeliveryItem[]>>(
        `/api/v1/admin/driver/complete/${driverId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      .then(unwrap);
  },
};
