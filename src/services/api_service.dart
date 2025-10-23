import 'dart:convert';
import 'package:http/http.dart' as http;

import '../models/api_response.dart';
import '../models/paginated_response.dart';
import '../models/admin_models.dart';
import '../models/signup_data.dart';

class ApiService {
  static const _baseUrl = 'http://116.39.208.72:26443';

  // — 공통 POST 헬퍼 — 
  static Future<Map<String, dynamic>?> _postJson(
    String endpoint,
    Map<String, dynamic> body, {
    String? token,
  }) async {
    final url = Uri.parse('$_baseUrl$endpoint');
    final resp = await http.post(
      url,
      headers: {
        'Content-Type': 'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      },
      body: jsonEncode(body),
    );
    if (resp.statusCode == 200) {
      return jsonDecode(resp.body) as Map<String, dynamic>;
    } else {
      print('❌ POST $endpoint 실패: ${resp.statusCode}');
      return null;
    }
  }

  // 관리자 회원가입
  static Future<ApiResponse<AdminSignupData>?> registerAdmin(
      SignupData data) async {
    final json = await _postJson('/api/v1/auth/save/admin', data.toJson());
    if (json == null) return null;
    return ApiResponse.fromJson(
      json,
      (d) => AdminSignupData.fromJson(d as Map<String, dynamic>),
    );
  }

  // 로그인 (관리자/사용자 공용)
  static Future<ApiResponse<AuthTokens>?> login(SignupData data) async {
    final json = await _postJson('/api/v1/auth/login', data.toJson());
    if (json == null) return null;
    return ApiResponse.fromJson(
      json,
      (d) => AuthTokens.fromJson(d as Map<String, dynamic>),
    );
  }

  // 회원 승인 (PATCH /admin/status)
  static Future<ApiResponse<List<int>>?> approveUsers({
    required List<int> userIds,
    required String token,
  }) async {
    final url = '$_baseUrl/api/v1/admin/status';
    final resp = await http.patch(
      Uri.parse(url),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode({ 'userIds': userIds }),
    );
    if (resp.statusCode == 200) {
      final json = jsonDecode(resp.body) as Map<String, dynamic>;
      return ApiResponse.fromJson(
        json,
        (d) => (d as List).map((e) => e as int).toList(),
      );
    }
    print('❌ PATCH /admin/status 실패: ${resp.statusCode}');
    return null;
  }

  // 가입 대기자 조회 (GET /admin/pending)
  static Future<ApiResponse<PaginatedResponse<PendingUser>>?> fetchPendingUsers({
    required String token,
    int page = 1,
    int size = 10,
  }) async {
    final uri = Uri.parse('$_baseUrl/api/v1/admin/pending')
        .replace(queryParameters: {
      'page': page.toString(),
      'size': size.toString(),
    });
    final resp = await http.get(
      uri,
      headers: { 'Authorization': 'Bearer $token' },
    );
    if (resp.statusCode == 200) {
      final json = jsonDecode(resp.body) as Map<String, dynamic>;
      return ApiResponse.fromJson(
        json,
        (d) => PaginatedResponse.fromJson(
          d as Map<String, dynamic>,
          (e) => PendingUser.fromJson(e as Map<String, dynamic>),
        ),
      );
    }
    print('❌ GET /admin/pending 실패: ${resp.statusCode}');
    return null;
  }

  // 승인된 회원 목록 조회 (GET /admin/approved)
  static Future<ApiResponse<PaginatedResponse<ApprovedUser>>?> fetchApprovedUsers({
    required String token,
    String? residence,
    String? attendance,
    String? conditionStatus,
    int page = 1,
    int size = 10,
  }) async {
    final qp = <String, String>{
      'page': page.toString(),
      'size': size.toString(),
      if (residence != null) 'residence': residence,
      if (attendance != null) 'attendance': attendance,
      if (conditionStatus != null) 'conditionStatus': conditionStatus,
    };
    final uri = Uri.parse('$_baseUrl/api/v1/admin/approved')
        .replace(queryParameters: qp);
    final resp = await http.get(
      uri,
      headers: { 'Authorization': 'Bearer $token' },
    );
    if (resp.statusCode == 200) {
      final json = jsonDecode(resp.body) as Map<String, dynamic>;
      return ApiResponse.fromJson(
        json,
        (d) => PaginatedResponse.fromJson(
          d as Map<String, dynamic>,
          (e) => ApprovedUser.fromJson(e as Map<String, dynamic>),
        ),
      );
    }
    print('❌ GET /admin/approved 실패: ${resp.statusCode}');
    return null;
  }
}
