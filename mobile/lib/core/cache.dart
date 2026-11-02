// Small, dependency-free offline cache for GET responses. Values are JSON
// strings with a TTL; corrupted/expired entries are ignored (never crash).
import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

class CachedValue<T> {
  const CachedValue(this.value, {required this.fromCache, required this.stale});
  final T value;
  final bool fromCache;
  final bool stale;
}

class CacheStore {
  CacheStore._();
  static final CacheStore instance = CacheStore._();
  static const _prefix = 'aqar.cache.';
  static const _maxAge = Duration(hours: 6);

  String _key(String path) => '$_prefix${path.replaceAll(RegExp(r'[^A-Za-z0-9_.-]'), '_')}';

  Future<void> put(String path, dynamic json) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(
        _key(path),
        jsonEncode({'at': DateTime.now().toUtc().millisecondsSinceEpoch, 'data': json}),
      );
    } catch (_) {
      // Cache is best-effort; disk full must never break a request.
    }
  }

  Future<CachedValue<dynamic>?> read(String path) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final raw = prefs.getString(_key(path));
      if (raw == null) return null;
      final decoded = jsonDecode(raw) as Map<String, dynamic>;
      final at = DateTime.fromMillisecondsSinceEpoch(decoded['at'] as int, isUtc: true);
      final age = DateTime.now().toUtc().difference(at);
      return CachedValue<dynamic>(decoded['data'], fromCache: true, stale: age > _maxAge);
    } catch (_) {
      return null;
    }
  }

  Future<void> clear() async {
    final prefs = await SharedPreferences.getInstance();
    final keys = prefs.getKeys().where((k) => k.startsWith(_prefix)).toList();
    for (final k in keys) {
      await prefs.remove(k);
    }
  }
}
