// Universal links / custom-scheme deep links → go_router locations.
// Android: assetlinks.json at https://<host>/.well-known/assetlinks.json
// iOS: Associated Domains capability + apple-app-site-association.
import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/foundation.dart';
import 'package:go_router/go_router.dart';

class DeepLinkService {
  DeepLinkService._();
  static final DeepLinkService instance = DeepLinkService._();

  final AppLinks _appLinks = AppLinks();
  StreamSubscription<Uri>? _sub;
  GoRouter? _router;

  void attach(GoRouter router) {
    _router = router;
    _sub?.cancel();
    _sub = _appLinks.uriLinkStream.listen(_handle, onError: (Object e) {
      debugPrint('[deep-link] stream error: $e');
    });
  }

  void _handle(Uri uri) {
    final location = toLocation(uri);
    if (location != null && _router != null) {
      debugPrint('[deep-link] $uri → $location');
      _router!.go(location);
    }
  }

  /// Convert known host/scheme patterns into in-app routes. Unknown links are
  /// ignored (never open an arbitrary path inside the authenticated shell).
  static String? toLocation(Uri uri) {
    final segments = uri.pathSegments.where((p) => p.isNotEmpty).toList();
    if (uri.scheme == 'aqarrent') {
      // `aqarrent://listing/<id>` parses `listing` as the host, not a path
      // segment, so include the host as the first logical part.
      final parts = <String>[if (uri.host.isNotEmpty) uri.host, ...segments];
      if (parts.isEmpty) return '/';
      switch (parts.first) {
        case 'listing':
          return parts.length > 1 ? '/listing/${parts[1]}' : '/';
        case 'contracts':
          return '/contracts';
        case 'pricing':
          return '/pricing';
        case 'office':
          return '/office';
        case 'verify':
          return parts.length > 1 ? '/verify/${parts[1]}' : null;
        default:
          return null;
      }
    }
    if (uri.host.endsWith('aqarrent.app') || uri.host.endsWith('aqar-rent.com')) {
      // Strip an optional /ar or /en locale prefix before matching.
      final path = segments.where((p) => p != 'ar' && p != 'en').toList();
      if (path.isEmpty) return '/';
      if (path.first == 'rent' && path.length >= 4) {
        // /{locale}/rent/{gov}/{city}/{uuid}-{slug} → native listing detail.
        final idSlug = path.length >= 5 ? path[4] : path.last;
        final uuid = RegExp(
          r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}',
        ).firstMatch(idSlug)?.group(0);
        final id = uuid ?? idSlug.split('-').first;
        return '/listing/$id';
      }
      if (path.first == 'verify' && path.length > 1) {
        return '/verify/${path[1]}';
      }
      if (path.contains('pricing')) return '/pricing';
      if (path.contains('offices')) return '/office';
      return null;
    }
    return null;
  }

  void dispose() => _sub?.cancel();
}
