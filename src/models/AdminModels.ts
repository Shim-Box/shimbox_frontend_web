// ───────────────── 공통 문자열 리터럴 타입 ─────────────────
export type Attendance = "출근전" | "출근" | "퇴근";
export type ConditionStatusKo = "좋음" | "불안" | "위험";
export type ConditionStatusEn = "GOOD" | "WARNING" | "DANGER";
export type ShippingStatus =
  | "배송대기"
  | "배송중"
  | "배송완료"
  | "CANCELED"
  | "PENDING"
  | "STARTED"
  | "DELIVERED";

// ───────────────── 인증 / 회원가입 ─────────────────
export interface AdminSignupData {
  id: number;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ───────────────── 가입 대기자 ─────────────────
export interface PendingUser {
  id: number;
  name: string;
  phoneNumber: string;
  residence: string;
  licenseImage: string;
  birth: string;
  career: string;
  averageWorking: string;
  averageDelivery: string;
  bloodPressure: string;
  approvalStatus: boolean;
  role: string;
}

// ───────────────── 승인된 회원 ─────────────────
export interface ApprovedUser {
  userId: number;
  driverId: number;
  name: string;
  approvalStatus: boolean;
  profileImageUrl?: string | null;
  career: string;
  averageWorking: string;
  averageDelivery: string;
  height?: number;
  weight?: number;
  attendance: Attendance; // "출근전" | "출근" | "퇴근"
  residence: string;
  workTime?: string | null;
  deliveryStats?: string | null;
  conditionStatus: ConditionStatusKo;
}

// ───────────────── 기사 프로필 ─────────────────
export interface DriverProfile {
  driverId: number;
  name: string;
  phoneNumber: string;
  residence: string;
  regions: string[];
  conditionStatus: ConditionStatusKo | ConditionStatusEn;
  heartRate: number;
  stepCount: number;
  deliveryCount: number;
}

// ───────────────── 기사 배정 상품 ─────────────────
export interface DeliveryItem {
  productId: number;
  productName: string;
  recipientName: string;
  recipientPhoneNumber: string;
  address: string;
  detailAddress: string;
  postalCode: string;
  shippingStatus: ShippingStatus | string;
  driverId: number;
  deliveryImageUrl?: string | null;
}

// ───────────────── 심박수 타임라인 ─────────────────
export interface HeartRateTimelineItem {
  userId: number;
  driverName: string;
  heartRate: number;
  recordedAt: string; // ISO-8601
}

// ───────────────── 상품 타임라인 ─────────────────
export interface ProductTimelineItem {
  timelineId: number;
  productId: number;
  productName: string;
  status: "STARTED" | "DELIVERED" | "PENDING" | "CANCELED" | string;
  statusChangedAt: string;
  latitude: number | null;
  longitude: number | null;
  addressShort: string | null;
  driverName: string | null;
  driverPhoneNumber: string | null;
}

// ───────────────── 실시간 건강 데이터 ─────────────────
export interface RealtimeHealthItem {
  userId: string;
  step: number;
  heartRate: number;
  capturedAt: string;
}

// ───────────────── 실시간 위치(초기 로딩) ─────────────────
export interface LocationRealtimeItem {
  lat: number;
  lng: number;
  capturedAt: string; // ISO-8601
  addressShort: string;
  region: string; // 예: "구로구"
  timestamp: number; // epoch millis
}

// ───────────────── 기사 퇴근 후 건강 데이터  ─────────────────
export interface DriverHealthData {
  workTime: string;
  leaveWorkTime: string;
  finish1: string;
  finish2: string;
  finish3: string;
  step: number;
  heartRate: number;
  conditionStatus: ConditionStatusKo | string;
}

export interface DriverRealtimeData {
  driverId: number;
  step: number;
  heartRate: number;
  conditionStatus: string;
  modifiedDate: string;
}

// ───────────────── 관리자: 지역 배정  ─────────────────
export interface AssignRegionRequest {
  driverId: number;
  region1: string;
  region2: string;
}

export interface AssignRegionResponse {
  driverId: number;
  driverName: string;
  region1: string;
  region2: string;
}
