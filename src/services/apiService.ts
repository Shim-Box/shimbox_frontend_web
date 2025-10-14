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
} from "../models/AdminModels";
import { PaginatedResponse } from "../models/PaginatedResponse";

/** ───────────────── 토큰 유틸 ───────────────── */
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

/** ───────────────── axios 기본 설정 ───────────────── */
const client = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

function unwrap<T>(res: AxiosResponse<ApiResponse<T>>): T {
  if (res.status === 200) return res.data.data;
  throw new Error(res.data.message);
}

/** 인증 API 여부 */
const isAuthApi = (url: string) => url.startsWith("api/v1/auth/");

/** 요청 인터셉터: 인증 API 제외하고 Authorization 자동 주입 */
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

/** ───────────────── 리프레시 단일 비행 처리 ───────────────── */
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

    // reissue는 인증 API이므로 요청 인터셉터가 Authorization 헤더를 제거함
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

/** 응답 인터셉터:
 *  - 401 또는 403 에서 1회 리프레시 시도 후 원요청 재시도
 *  - auth API는 제외
 */
client.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config;
    if (!original) return Promise.reject(error);

    const status = error.response?.status ?? 0;
    const url = original.url || "";

    // 인증 관련 엔드포인트 자체에서의 에러는 통과
    if (isAuthApi(url)) return Promise.reject(error);

    // 만료를 403으로 보내는 백엔드 대응: 401/403 모두 refresh 시도
    if ((status === 401 || status === 403) && !(original as any)._retry) {
      (original as any)._retry = true;

      try {
        const newAccess = await reissue();
        if (!newAccess) {
          return Promise.reject(error);
        }

        // Authorization 갱신 후 재시도
        if (!original.headers) original.headers = new axios.AxiosHeaders();
        (original.headers as AxiosRequestHeaders)[
          "Authorization"
        ] = `Bearer ${newAccess}`;
        return client(original);
      } catch {
        clearTokens();
        return Promise.reject(error);
      }
    }

    // 여전히 403이면 권한 문제 가능성 안내(ADMIN 권한 필요 등)
    if (status === 403) {
      console.warn(
        "권한 없음(403). 계정 역할/승인 상태를 확인하세요. URL:",
        url
      );
    }

    return Promise.reject(error);
  }
);

/** ───────────────── API 서비스 ───────────────── */
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

  fetchDriverAssignedProducts(driverId: number) {
    return client
      .get<ApiResponse<DeliveryItem[]>>(
        `api/v1/admin/driver/${driverId}/products`
      )
      .then(unwrap);
  },
};

export default ApiService;
