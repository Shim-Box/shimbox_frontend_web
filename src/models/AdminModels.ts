export interface AdminSignupData {
  id: number;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PendingUser {
  id: number;
  name: string;
  phoneNumber: string;
  residence: string;
  licenseImage: string;
  approvalStatus: boolean;
  birth: string;
  career: string;
  averageWorking: string;
  averageDelivery: string;
  bloodPressure: string;
  role: string;
}

export interface ApprovedUser {
  id: number;
  approvalStatus: boolean;
  profileImageUrl: string;
  name: string;
  attendance: string;
  residence: string;
  workTime: string;
  deliveryStats: string;
  conditionStatus: string;
}
