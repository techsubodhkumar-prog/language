import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:supabase_flutter/supabase_flutter.dart';

class ApiException implements Exception {
  const ApiException(this.statusCode, this.message);
  final int statusCode;
  final String message;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient(this.baseUrl, {http.Client? client})
    : _client = client ?? http.Client();
  String baseUrl;
  final http.Client _client;

  Future<dynamic> request(String method, String path, {Object? body}) async {
    final token = Supabase.instance.client.auth.currentSession?.accessToken;
    final response = await _client.send(
      http.Request(method, Uri.parse('$baseUrl$path'))
        ..headers.addAll({
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          if (token != null) 'Authorization': 'Bearer $token',
        })
        ..body = body == null ? '' : jsonEncode(body),
    );
    final result = await http.Response.fromStream(response);
    dynamic data;
    try {
      data = result.body.isEmpty ? null : jsonDecode(result.body);
    } catch (_) {
      data = null;
    }
    if (result.statusCode < 200 || result.statusCode >= 300) {
      final message = data is Map && data['message'] != null
          ? data['message']
          : 'Request failed (${result.statusCode})';
      throw ApiException(
        result.statusCode,
        message is List ? message.join(', ') : message.toString(),
      );
    }
    return data;
  }
}
