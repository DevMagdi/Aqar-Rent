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
      if (segments.isEmpty) return '/';
      switch (segments.first) {
        case 'listing':
          return segments.length > 1 ? '/listing/${segments[1]}' : '/';
        case 'contracts':
          return '/contracts';
        case 'pricing':
          return '/pricing';
        case 'office':
          return '/office';
        case 'verify':
          return segments.length > 1 ? '/verify/${segments[1]}' : null;
        default:
          return null;
      }
    }
    if (uri.host.endsWith('aqarrent.app') || uri.host.endsWith('aqar-rent.com')) {
      if (segments.isEmpty) return '/';
      if (segments.first == 'rent' && segments.length >= 4) {
        // /{locale}/rent/{gov}/{city}/{id}-{slug} → native listing detail
        final idSlug = segments.length >= 5 ? segments[4] : segments.last;
        final id = idSlug.split('-').first;
        return '/listing/$id';
      }
      if (segments.first == 'verify' && segments.length > 1) {
        return '/verify/${segments[1]}';
      }
      if (segments.contains('pricing')) return '/pricing';
      if (segments.contains('offices')) return '/office';
      return null;
    }
    return null;
  }

  void dispose() => _sub?.cancel();
}
