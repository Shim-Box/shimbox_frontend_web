// 관리자 회원가입 응답 데이터
export interface AdminSignupData {
  id: number;
  email: string;
  role: string;
}

// 인증 토큰
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// 가입 대기자
export interface PendingUser {
  id: number; // 고유 ID
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

// 승인된 회원(택배기사)
export interface ApprovedUser {
  userId: number; // 유저 ID
  driverId: number; // 드라이버 ID (상세 조회 및 키로 사용)
  name: string;
  approvalStatus: boolean;
  profileImageUrl: string;
  career: string;
  averageWorking: string;
  averageDelivery: string;
  height: number;
  weight: number;
  attendance: string;
  residence: string;
  workTime: string;
  deliveryStats: string;
  conditionStatus: string;
}

// 기사 퇴근 후 건강 데이터
export interface DriverHealthData {
  workTime: string; // 출근 시간 (ISO 형식)
  leaveWorkTime: string; // 퇴근 시간 (ISO 형식)
  finish1: string; // 설문 응답 1
  finish2: string; // 설문 응답 2
  finish3: string; // 설문 응답 3
  step: number; // 걸음 수
  heartRate: number; // 심박수
  conditionStatus: string; // 상태 (위험, 불안, 좋음)
}

// 관리자용 실시간 건강 데이터
export interface DriverRealtimeData {
  driverId: number; // 드라이버 ID
  step: number; // 실시간 걸음 수
  heartRate: number; // 실시간 심박수
  conditionStatus: string; // 상태 (위험, 불안, 좋음)
  modifiedDate: string; // 업데이트 시간 (ISO 형식)
}
