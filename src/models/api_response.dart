class ApiResponse<T> {
  final T data;
  final String message;
  final int statusCode;

  ApiResponse({
    required this.data,
    required this.message,
    required this.statusCode,
  });

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object? json) fromJsonT,
  ) {
    return ApiResponse<T>(
      data: fromJsonT(json['data']),
      message: json['message'] as String,
      statusCode: json['statusCode'] as int,
    );
  }
}
