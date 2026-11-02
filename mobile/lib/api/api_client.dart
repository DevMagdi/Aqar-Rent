// Dio-based API client: bearer tokens in secure storage, single-flight refresh
// on 401, typed errors. Base URL comes from --dart-define=API_BASE.
import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../config.dart';
import '../core/cache.dart';
import '../core/connectivity.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message, this.code);
  final int status;
  final String message;
  final String? code;
  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({Dio? dio}) : _dio = dio ?? Dio(BaseOptions(baseUrl: '${AppConfig.apiBase}/api/v1', connectTimeout: const Duration(seconds: 15), receiveTimeout: const Duration(seconds: 20))) {
    _dio!.interceptors.add(InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await storage.read(key: 'aqar.access');
        if (token != null && !options.headers.containsKey('Authorization')) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onError: (e, handler) async {
        if (e.response?.statusCode == 401 && !e.requestOptions.extra.containsKey('retried')) {
          final refreshed = await _refresh();
          if (refreshed) {
            e.requestOptions.extra['retried'] = true;
            final token = await storage.read(key: 'aqar.access');
            e.requestOptions.headers['Authorization'] = 'Bearer $token';
            try {
              final res = await _dio!.fetch(e.requestOptions);
              return handler.resolve(res);
            } on DioException catch (err) {
              return handler.next(err);
            }
          }
        }
        handler.next(e);
      },
    ));
  }

  final Dio? _dio;
  static const storage = FlutterSecureStorage();

  static Future<void> saveTokens(String access, String refresh) async {
    await storage.write(key: 'aqar.access', value: access);
    await storage.write(key: 'aqar.refresh', value: refresh);
  }

  static Future<void> clear() => storage.deleteAll();
  static Future<bool> hasSession() async => (await storage.read(key: 'aqar.access')) != null;

  Future<bool> _refresh() async {
    final rt = await storage.read(key: 'aqar.refresh');
    if (rt == null) return false;
    try {
      final res = await Dio().post(
        '${AppConfig.apiBase}/api/v1/auth/refresh',
        data: {'refresh_token': rt},
      );
      final data = res.data as Map<String, dynamic>;
      await saveTokens(data['access_token'] as String, data['refresh_token'] as String);
      return true;
    } catch (_) {
      await clear();
      return false;
    }
  }

  Future<dynamic> get(String path, {Map<String, dynamic>? query}) async {
    try {
      final res = await _dio!.get(path, queryParameters: query);
      return res.data;
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  /// GET with transparent offline fallback: fresh data is cached; on network
  /// failure the last cached JSON is returned. Callers can show the offline
  /// banner via `ConnectivityService.instance.changes`.
  Future<dynamic> cachedGet(
    String path, {
    Map<String, dynamic>? query,
    bool forceRefresh = false,
  }) async {
    final key = '$path${query == null ? '' : query.toString()}';
    if (!forceRefresh && !ConnectivityService.instance.online) {
      final cached = await CacheStore.instance.read(key);
      if (cached != null) return cached.value;
    }
    try {
      final fresh = await get(path, query: query);
      await CacheStore.instance.put(key, fresh);
      return fresh;
    } catch (e) {
      final cached = await CacheStore.instance.read(key);
      if (cached != null) return cached.value;
      rethrow;
    }
  }

  Future<dynamic> post(String path, {Object? data}) async {
    try {
      final res = await _dio!.post(path, data: data);
      return res.data;
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<dynamic> delete(String path) async {
    try {
      final res = await _dio!.delete(path);
      return res.data;
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  Future<dynamic> patch(String path, {Object? data}) async {
    try {
      final res = await _dio!.patch(path, data: data);
      return res.data;
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  /// Multipart upload with real progress events (photo wizard, verification,
  /// bank receipts, handover media).
  Future<dynamic> upload(
    String path, {
    required FilePart file,
    Map<String, String> fields = const {},
    void Function(int sent, int total)? onProgress,
  }) async {
    final form = FormData.fromMap({
      ...fields,
      'file': await MultipartFile.fromFile(file.path, filename: file.name),
    });
    try {
      final res = await _dio!.post(
        path,
        data: form,
        onSendProgress: onProgress == null ? null : (s, t) => onProgress(s, t),
      );
      return res.data;
    } on DioException catch (e) {
      throw _wrap(e);
    }
  }

  /// Authenticated binary download (receipts/contract/handover PDFs).
  Future<List<int>> downloadBytes(String path) async {
    final token = await storage.read(key: 'aqar.access');
    final res = await Dio().get(
      '${AppConfig.apiBase}/api/v1$path',
      options: Options(
        responseType: ResponseType.bytes,
        headers: {if (token != null) 'Authorization': 'Bearer $token'},
      ),
    );
    return (res.data as List).cast<int>();
  }

  static ApiException _wrap(DioException e) {
    final data = e.response?.data;
    if (data is Map) {
      return ApiException(
        e.response?.statusCode ?? 0,
        (data['message'] ?? data['detail'] ?? 'Request failed').toString(),
        data['code'] as String?,
      );
    }
    return ApiException(e.response?.statusCode ?? 0, 'Network error', null);
  }
}

class FilePart {
  FilePart(this.path, this.name);
  final String path;
  final String name;
}
