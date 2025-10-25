// src/services/apiService.ts
import axios, { AxiosError, AxiosResponse, AxiosRequestHeaders } from "axios";
import { BASE_URL } from "../env";
import { ApiResponse } from "../models/ApiResponse";
import {
  AdminSignupData,
  AuthTokens,
  PendingUser,
  ApprovedUser,
  DeliveryItem,
  DriverProfile,
  AssignRegionRequest,
  AssignRegionResponse,
  ProductTimelineItem,
  RealtimeHealthItem,
  UnassignedProduct,
} from "../models/AdminModels";
import { PaginatedResponse } from "../models/PaginatedResponse";

/** ─────────── 토큰 유틸 ─────────── */
const ACCESS_KEY = "accessToken";
const REFRESH_KEY = "refreshToken";

function getAccessToken() {
  return (
    localStorage.getItem(ACCESS_KEY) ||
    sessionStorage.getItem(ACCESS_KEY) ||
    undefined
  );
}
function getRefreshToken() {
  return sessionStorage.getItem(REFRESH_KEY) || undefined;
}
function setTokens(tokens: AuthTokens) {
  if (tokens?.accessToken) localStorage.setItem(ACCESS_KEY, tokens.accessToken);
  if (tokens?.refreshToken)
    sessionStorage.setItem(REFRESH_KEY, tokens.refreshToken);
}
function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

/** ─────────── axios 기본 ─────────── */
const client = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

function unwrap<T>(res: AxiosResponse<ApiResponse<T>>): T {
  if (res.status === 200) return res.data.data;
  throw new Error(res.data.message);
}

const isAuthApi = (url: string) => url.startsWith("api/v1/auth/");

client.interceptors.request.use((config) => {
  const url = config.url ?? "";
  if (!config.headers) config.headers = new axios.AxiosHeaders();
  const h = config.headers as AxiosRequestHeaders;

  if (isAuthApi(url)) {
    delete h["Authorization"];
  } else {
    const token = getAccessToken();
    if (token) h["Authorization"] = `Bearer ${token}`;
    else delete h["Authorization"];
  }
  return config;
});

/** ─────────── 리프레시 단일비행 ─────────── */
let isRefreshing = false;
let waitQueue: Array<(token?: string) => void> = [];

async function reissue(): Promise<string | undefined> {
  const rt = getRefreshToken();
  if (!rt) return undefined;

  if (isRefreshing) {
    return new Promise<string | undefined>((resolve) => {
      waitQueue.push(resolve);
    });
  }

  try {
    isRefreshing = true;
    const res = await client.post<ApiResponse<AuthTokens>>(
      "api/v1/auth/reissue",
      { refreshToken: rt }
    );
    const tokens = res.data.data;
    setTokens(tokens);
    waitQueue.forEach((fn) => fn(tokens.accessToken));
    waitQueue = [];
    return tokens.accessToken;
  } catch {
    clearTokens();
    waitQueue.forEach((fn) => fn(undefined));
    waitQueue = [];
    return undefined;
  } finally {
    isRefreshing = false;
  }
}

client.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config;
    if (!original) return Promise.reject(error);

    const status = error.response?.status ?? 0;
    const url = original.url || "";

    if (isAuthApi(url)) return Promise.reject(error);

    if ((status === 401 || status === 403) && !(original as any)._retry) {
      (original as any)._retry = true;
      try {
        const newAccess = await reissue();
        if (!newAccess) return Promise.reject(error);
        if (!original.headers) original.headers = new axios.AxiosHeaders();
        (original.headers as AxiosRequestHeaders)["Authorization"] =
          `Bearer ${newAccess}`;
        return client(original);
      } catch {
        clearTokens();
        return Promise.reject(error);
      }
    }

    if (status === 403) {
      console.warn("권한 없음(403). 계정 역할/승인 상태를 확인하세요. URL:", url);
    }

    return Promise.reject(error);
  }
);

/** 위치 스냅샷 타입 */
export type RealtimeLocationItem = {
  lat: number;
  lng: number;
  capturedAt?: string;
  addressShort?: string;
  region?: string;
  timestamp?: number;
};

/** ─────────── 간단 캐시(메모리) ─────────── */
const productListCache = new Map<number, DeliveryItem[]>();

/** ─────────── API 서비스 ─────────── */
export const ApiService = {
  /* Auth */
  registerAdmin(data: { email: string; password: string }) {
    return client
      .post<ApiResponse<AdminSignupData>>("api/v1/auth/save/admin", data)
      .then(unwrap);
  },

  login(data: { email: string; password: string }) {
    return client
      .post<ApiResponse<AuthTokens>>("api/v1/auth/login", data)
      .then(unwrap)
      .then((tokens) => {
        setTokens(tokens);
        return tokens;
      });
  },

  /* Admin */
  fetchApprovedUsers(
    filters: {
      residence?: string;
      attendance?: "출근전" | "출근" | "퇴근";
      conditionStatus?: "위험" | "불안" | "좋음";
      page?: number;
      size?: number;
    } = {}
  ) {
    return client
      .get<ApiResponse<PaginatedResponse<ApprovedUser>>>(
        "api/v1/admin/approved",
        { params: filters }
      )
      .then(unwrap);
  },

  fetchPendingUsers(page = 1, size = 10) {
    return client
      .get<ApiResponse<PaginatedResponse<PendingUser>>>(
        "api/v1/admin/pending",
        { params: { page, size } }
      )
      .then(unwrap);
  },

  approveUsers(userIds: number[]) {
    return client
      .patch<ApiResponse<number[]>>("api/v1/admin/status", { userIds })
      .then(unwrap);
  },

  assignDriverRegion(body: AssignRegionRequest) {
    return client
      .post<ApiResponse<AssignRegionResponse>>(
        "api/v1/admin/driver/assign-region",
        body
      )
      .then(unwrap);
  },

  /* Product timeline */
  fetchProductTimeline(productId: number) {
    return client
      .get<ApiResponse<ProductTimelineItem[]>>(
        `api/v1/admin/product/${productId}/timeline`
      )
      .then(unwrap);
  },

  /* Driver */
  fetchDriverProfile(driverId: number) {
    return client
      .get<ApiResponse<DriverProfile>>(
        `api/v1/admin/driver/${driverId}/profile`
      )
      .then(unwrap);
  },

  /** 배송 상태별 필터 지원 + 404/204 → 빈 배열 처리 + 캐시 */
  async fetchDriverAssignedProducts(
    driverId: number,
    shippingStatus?: "배송대기" | "배송시작" | "배송완료"
  ) {
    if (!driverId && driverId !== 0) return [] as DeliveryItem[];

    // 전체(상태 미지정)만 캐싱
    if (!shippingStatus && productListCache.has(driverId)) {
      return productListCache.get(driverId)!;
    }

    const res = await client.get<ApiResponse<DeliveryItem[]>>(
      `api/v1/admin/driver/${driverId}/products`,
      {
        params: shippingStatus ? { shippingStatus } : undefined,
        validateStatus: (s) => s === 200 || s === 204 || s === 404,
      }
    );

    if (res.status === 200) {
      const list = (res.data as ApiResponse<DeliveryItem[]>).data || [];
      if (!shippingStatus) productListCache.set(driverId, list);
      return list;
    }
    // 204/404
    if (!shippingStatus) productListCache.set(driverId, []);
    return [] as DeliveryItem[];
  },

  /** 실시간 건강 스냅샷 */
  fetchRealtimeHealth(region?: string) {
    return client
      .get<ApiResponse<RealtimeHealthItem[]>>("api/v1/admin/realtime/health", {
        params: region ? { region } : undefined,
      })
      .then(unwrap);
  },

  /** 실시간 위치 스냅샷 */
  fetchRealtimeLocations(region?: string) {
    const params = region ? { region } : undefined;
    return client
      .get<ApiResponse<RealtimeLocationItem[]>>(
        "api/v1/admin/location/realtime",
        { params }
      )
      .then(unwrap);
  },

  /**  할당되지 않은 상품 목록 */
  fetchUnassignedProducts() {
    return client
      .get<ApiResponse<UnassignedProduct[]>>("api/v1/admin/products/unassigned")
      .then(unwrap)
      .catch((e: AxiosError) => {
        if (e.response?.status === 404) return [] as UnassignedProduct[];
        throw e;
      });
  },
};

export default ApiService;
