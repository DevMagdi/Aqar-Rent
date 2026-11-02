// API client for the Aqar Rent backend (contracts & handovers).
// Base URL is configurable per flavor — pass --dart-define=API_BASE=https://…
import 'dart:convert';
import 'dart:io';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiClient {
  ApiClient({this.base = const String.fromEnvironment('API_BASE', defaultValue: 'http://10.0.2.2:8000')});

  final String base;
  static const _storage = FlutterSecureStorage();

  Future<String?> get accessToken => _storage.read(key: 'aqar.access');
  Future<String?> get refreshToken => _storage.read(key: 'aqar.refresh');

  Future<void> saveTokens(String access, String refresh) async {
    await _storage.write(key: 'aqar.access', value: access);
    await _storage.write(key: 'aqar.refresh', value: refresh);
  }

  Future<void> clearTokens() => _storage.deleteAll();

  Uri _u(String path) => Uri.parse('$base/api/v1$path');

  Future<Map<String, dynamic>> post(String path, {Object? body, bool auth = true, bool retry = true}) async {
    final headers = <String, String>{'Content-Type': 'application/json'};
    final token = await accessToken;
    if (auth && token != null) headers['Authorization'] = 'Bearer $token';
    final res = await http.post(_u(path), headers: headers, body: jsonEncode(body ?? {}));
    if (res.statusCode == 401 && auth && retry && (await refreshToken) != null) {
      final refreshed = await _refresh();
      if (refreshed) return post(path, body: body, auth: auth, retry: false);
    }
    return _decode(res);
  }

  Future<Map<String, dynamic>> get(String path, {bool auth = true, bool retry = true}) async {
    final headers = <String, String>{};
    final token = await accessToken;
    if (auth && token != null) headers['Authorization'] = 'Bearer $token';
    final res = await http.get(_u(path), headers: headers);
    if (res.statusCode == 401 && auth && retry && (await refreshToken) != null) {
      final refreshed = await _refresh();
      if (refreshed) return get(path, auth: auth, retry: false);
    }
    return _decode(res);
  }

  Future<Map<String, dynamic>> patch(String path, Object body) async {
    final token = await accessToken;
    final res = await http.patch(
      _u(path),
      headers: {'Content-Type': 'application/json', if (token != null) 'Authorization': 'Bearer $token'},
      body: jsonEncode(body),
    );
    return _decode(res);
  }

  Future<bool> _refresh() async {
    final rt = await refreshToken;
    if (rt == null) return false;
    final res = await http.post(_u('/auth/refresh'), headers: {'Content-Type': 'application/json'}, body: jsonEncode({'refresh_token': rt}));
    if (res.statusCode != 200) {
      await clearTokens();
      return false;
    }
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    await saveTokens(data['access_token'] as String, data['refresh_token'] as String);
    return true;
  }

  Map<String, dynamic> _decode(http.Response res) {
    final body = res.body.isEmpty ? '{}' : res.body;
    final data = jsonDecode(body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw ApiException(res.statusCode, (data['message'] ?? data['detail'] ?? 'HTTP ${res.statusCode}').toString(), data['code'] as String?);
    }
    return data;
  }

  // ── auth ────────────────────────────────────────────────────────────────
  Future<String> requestOtp(String phone) async {
    final data = await post('/auth/otp/request', body: {'phone': phone}, auth: false);
    return (data['dev_code'] ?? '') as String;
  }

  Future<void> verifyOtp(String phone, String code) async {
    final data = await post('/auth/otp/verify', body: {'phone': phone, 'code': code, 'platform': 'android'}, auth: false);
    final tokens = data['tokens'] as Map<String, dynamic>;
    await saveTokens(tokens['access_token'] as String, tokens['refresh_token'] as String);
  }

  // ── contracts ───────────────────────────────────────────────────────────
  Future<List<dynamic>> listContracts() async => (await get('/contracts')) as List<dynamic>;

  Future<Map<String, dynamic>> getContract(String id) => get('/contracts/$id');

  Future<Map<String, dynamic>> createContract(Map<String, dynamic> payload) => post('/contracts', body: payload);

  Future<Map<String, dynamic>> patchContract(String id, Map<String, dynamic> payload) => patch('/contracts/$id', payload);

  Future<Map<String, dynamic>> requestContractConfirmation(String id) => post('/contracts/$id/request-confirmation', body: {});

  Future<Map<String, dynamic>> confirmContract(String id, String otp) => post('/contracts/$id/confirm', body: {'otp_code': otp});

  Future<Map<String, dynamic>> createFeeOrder(String id, String method) => post('/contracts/$id/fee-order', body: {'method': method});

  Future<String> contractPdf(String id) async {
    final token = await accessToken;
    final res = await http.get(_u('/contracts/$id/pdf'), headers: {if (token != null) 'Authorization': 'Bearer $token'});
    if (res.statusCode != 200) throw ApiException(res.statusCode, 'PDF failed', null);
    return base64Encode(res.bodyBytes);
  }

  // ── handovers ───────────────────────────────────────────────────────────
  Future<List<dynamic>> listHandovers(String contractId) async => (await get('/contracts/$contractId/handovers')) as List<dynamic>;

  Future<Map<String, dynamic>> createHandover(String contractId, Map<String, dynamic> payload) =>
      post('/contracts/$contractId/handovers', body: payload);

  Future<Map<String, dynamic>> patchHandover(String id, Map<String, dynamic> payload) => patch('/handovers/$id', payload);

  Future<Map<String, dynamic>> confirmHandover(String id, String otp) => post('/handovers/$id/confirm', body: {'otp_code': otp});

  Future<void> uploadHandoverMedia(String id, {required File file, required String room, String? note}) async {
    final token = await accessToken;
    final req = http.MultipartRequest('POST', _u('/handovers/$id/media'))
      ..headers.addAll({if (token != null) 'Authorization': 'Bearer $token'})
      ..files.add(await http.MultipartFile.fromPath('file', file.path))
      ..fields['room'] = room;
    if (note != null && note.isNotEmpty) req.fields['note'] = note;
    final res = await req.send();
    final body = await res.stream.bytesToString();
    if (res.statusCode >= 400) {
      final data = jsonDecode(body) as Map<String, dynamic>;
      throw ApiException(res.statusCode, (data['message'] ?? 'upload failed').toString(), data['code'] as String?);
    }
  }

  Future<String> handoverPdf(String id) async {
    final token = await accessToken;
    final res = await http.get(_u('/handovers/$id/pdf'), headers: {if (token != null) 'Authorization': 'Bearer $token'});
    if (res.statusCode != 200) throw ApiException(res.statusCode, 'PDF failed', null);
    return base64Encode(res.bodyBytes);
  }
}

class ApiException implements Exception {
  ApiException(this.status, this.message, this.code);
  final int status;
  final String message;
  final String? code;
  @override
  String toString() => message;
}
