// lib/models/admin_models.dart

/// 관리자 가입 성공 시 반환되는 data.id, email, role
class AdminSignupData {
  final int id;
  final String email;
  final String role;

  AdminSignupData({
    required this.id,
    required this.email,
    required this.role,
  });

  factory AdminSignupData.fromJson(Map<String, dynamic> json) {
    return AdminSignupData(
      id: json['id'] as int,
      email: json['email'] as String,
      role: json['role'] as String,
    );
  }
}

/// 로그인 후 토큰
class AuthTokens {
  final String accessToken;
  final String refreshToken;

  AuthTokens({
    required this.accessToken,
    required this.refreshToken,
  });

  factory AuthTokens.fromJson(Map<String, dynamic> json) {
    return AuthTokens(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
    );
  }
}

/// 가입 대기자 항목
class PendingUser {
  final int id;
  final String name;
  final String phoneNumber;
  final String residence;
  final bool approvalStatus;
  final String birth;
  final String career;
  final String averageWorking;
  final String averageDelivery;
  final String bloodPressure;
  final String role;

  PendingUser({
    required this.id,
    required this.name,
    required this.phoneNumber,
    required this.residence,
    required this.approvalStatus,
    required this.birth,
    required this.career,
    required this.averageWorking,
    required this.averageDelivery,
    required this.bloodPressure,
    required this.role,
  });

  factory PendingUser.fromJson(Map<String, dynamic> json) {
    return PendingUser(
      id: json['id'] as int,
      name: json['name'] as String,
      phoneNumber: json['phoneNumber'] as String,
      residence: json['residence'] as String,
      approvalStatus: json['approvalStatus'] as bool,
      birth: json['birth'] as String,
      career: json['career'] as String,
      averageWorking: json['averageWorking'] as String,
      averageDelivery: json['averageDelivery'] as String,
      bloodPressure: json['bloodPressure'] as String,
      role: json['role'] as String,
    );
  }
}

/// 승인된 회원 항목
class ApprovedUser {
  final int id;
  final bool approvalStatus;
  final String profileImageUrl;
  final String name;
  final String attendance;
  final String residence;
  final String workTime;
  final String deliveryStats;
  final String conditionStatus;

  ApprovedUser({
    required this.id,
    required this.approvalStatus,
    required this.profileImageUrl,
    required this.name,
    required this.attendance,
    required this.residence,
    required this.workTime,
    required this.deliveryStats,
    required this.conditionStatus,
  });

  factory ApprovedUser.fromJson(Map<String, dynamic> json) {
    return ApprovedUser(
      id: json['id'] as int,
      approvalStatus: json['approvalStatus'] as bool,
      profileImageUrl: json['profileImageUrl'] as String,
      name: json['name'] as String,
      attendance: json['attendance'] as String,
      residence: json['residence'] as String,
      workTime: json['workTime'] as String,
      deliveryStats: json['deliveryStats'] as String,
      conditionStatus: json['conditionStatus'] as String,
    );
  }
}
