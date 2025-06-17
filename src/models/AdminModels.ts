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

// 승인된 회원(택배기사)
export interface ApprovedUser {
  userId: number;
  driverId: number;
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
  workTime: string;
  leaveWorkTime: string;
  finish1: string;
  finish2: string;
  finish3: string;
  step: number;
  heartRate: number;
  conditionStatus: string;
}

// 관리자용 실시간 건강 데이터
export interface DriverRealtimeData {
  driverId: number;
  step: number;
  heartRate: number;
  conditionStatus: string;
  modifiedDate: string;
}
