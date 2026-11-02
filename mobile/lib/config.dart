/// Runtime configuration via --dart-define. NO secrets are embedded here:
/// Firebase public identifiers and the API host are supplied by the operator
/// at build time. A release build refuses to start on a dev/mock endpoint.
import 'package:flutter/foundation.dart';

class AppConfig {
  AppConfig._();

  /// `ENVIRONMENT=production|staging|dev` (release builds MUST be production).
  static const environment = String.fromEnvironment('ENVIRONMENT', defaultValue: 'dev');

  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://10.0.2.2:8000', // Android emulator loopback (dev only)
  );

  static const mapTilesUrl = String.fromEnvironment(
    'MAP_TILES_URL',
    defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  );

  static const deepLinkHost = String.fromEnvironment(
    'DEEP_LINK_HOST',
    defaultValue: 'aqarrent.app',
  );

  static const firebaseApiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const firebaseAppId = String.fromEnvironment('FIREBASE_APP_ID');
  static const firebaseMessagingSenderId = String.fromEnvironment('FIREBASE_SENDER_ID');
  static const firebaseProjectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static const firebaseIosBundleId = String.fromEnvironment('FIREBASE_IOS_BUNDLE_ID');

  static bool get isProduction => environment == 'production';
  static bool get pushConfigured =>
      firebaseApiKey.isNotEmpty &&
      firebaseAppId.isNotEmpty &&
      firebaseMessagingSenderId.isNotEmpty &&
      firebaseProjectId.isNotEmpty;

  /// Fail fast on a misconfigured release build. Call from `main()` before runApp.
  static void assertReleaseConfig() {
    if (!kReleaseMode) return;
    final problems = <String>[];
    if (environment != 'production') {
      problems.add('ENVIRONMENT=production is required for release builds');
    }
    if (!apiBase.startsWith('https://')) {
      problems.add('API_BASE must be HTTPS in production');
    }
    if (apiBase.contains('10.0.2.2') || apiBase.contains('localhost') || apiBase.contains('127.0.0.1')) {
      problems.add('API_BASE must not point at a dev loopback address');
    }
    if (!pushConfigured) {
      problems.add('FIREBASE_* dart-defines are required (real FCM push)');
    }
    if (!mapTilesUrl.startsWith('https://')) {
      problems.add('MAP_TILES_URL must be HTTPS (production tile host)');
    }
    if (problems.isNotEmpty) {
      throw StateError('Aqar Rent release configuration invalid:\n- ${problems.join('\n- ')}');
    }
  }
}
