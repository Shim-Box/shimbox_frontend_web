class PaginatedResponse<T> {
  final List<T> items;
  final int page;
  final int size;
  final int totalElements;
  final int totalPages;

  PaginatedResponse({
    required this.items,
    required this.page,
    required this.size,
    required this.totalElements,
    required this.totalPages,
  });

  factory PaginatedResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Object? json) fromJsonT,
  ) {
    final data = json['data'] as Map<String, dynamic>;
    final list = (data['data'] as List)
        .map((e) => fromJsonT(e))
        .toList();
    return PaginatedResponse<T>(
      items: list,
      page: data['page'] as int,
      size: data['size'] as int,
      totalElements: data['totalElements'] as int,
      totalPages: data['totalPages'] as int,
    );
  }
}
