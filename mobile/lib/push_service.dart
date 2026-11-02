// Real FCM push: permission, token registration/refresh, foreground messages
// via flutter_local_notifications, and notification taps → deep-link route.
// No mock provider. A release build refuses to boot without FIREBASE_* config
// (see AppConfig.assertReleaseConfig).
import 'dart:convert';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:go_router/go_router.dart';

import 'api/api_client.dart';
import 'config.dart';
import 'core/deep_links.dart';

class PushServiceBootstrap {
  PushServiceBootstrap._();
  static final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();
  static GoRouter? _router;
  static bool _ready = false;

  static Future<void> init(GoRouter router) async {
    _router = router;
    if (_ready) return;
    if (!AppConfig.pushConfigured) {
      debugPrint('[push] FIREBASE_* dart-defines missing — push registration skipped');
      return;
    }
    try {
      await Firebase.initializeApp(
        options: FirebaseOptions(
          apiKey: AppConfig.firebaseApiKey,
          appId: AppConfig.firebaseAppId,
          messagingSenderId: AppConfig.firebaseMessagingSenderId,
          projectId: AppConfig.firebaseProjectId,
          iosBundleId: AppConfig.firebaseIosBundleId.isEmpty ? null : AppConfig.firebaseIosBundleId,
        ),
      );
      await _local.initialize(
        const InitializationSettings(
          android: AndroidInitializationSettings('@mipmap/ic_launcher'),
          iOS: DarwinInitializationSettings(requestAlertPermission: false, requestBadgePermission: false),
        ),
        onDidReceiveNotificationResponse: _onTap,
      );
      final messaging = FirebaseMessaging.instance;
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true, badge: true, sound: true,
      );
      final settings = await messaging.requestPermission(alert: true, badge: true, sound: true);
      if (settings.authorizationStatus == AuthorizationStatus.authorized ||
          settings.authorizationStatus == AuthorizationStatus.provisional) {
        await _register(messaging);
        messaging.onTokenRefresh.listen((token) => _registerToken(token));
      }
      FirebaseMessaging.onMessage.listen(_onForeground);
      FirebaseMessaging.onMessageOpenedApp.listen(_onOpened);
      final initial = await messaging.getInitialMessage();
      if (initial != null) _onOpened(initial);
      _ready = true;
    } catch (e) {
      // Never crash the app on a push failure; errors are visible in logs and
      // the backend has its own failure alerting / payment audit trail.
      debugPrint('[push] init failed: $e');
    }
  }

  static Future<void> _register(FirebaseMessaging messaging) async {
    final token = await messaging.getToken();
    if (token != null) await _registerToken(token);
  }

  static Future<void> _registerToken(String token) async {
    final platform = defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
    try {
      await ApiClient().post('/me/devices', data: {'platform': platform, 'push_token': token});
    } catch (e) {
      debugPrint('[push] device registration failed: $e');
    }
  }

  static void _onForeground(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;
    _local.show(
      message.hashCode % 100000,
      notification.title ?? 'عقار رينت',
      notification.body ?? '',
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'aqar_general',
          'إشعارات عقار رينت',
          channelDescription: 'الإعلانات، العقود، الدفع والتسليم',
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: DarwinNotificationDetails(presentAlert: true, presentBadge: true, presentSound: true),
      ),
      payload: jsonEncode(message.data),
    );
  }

  static void _onTap(NotificationResponse response) {
    if (response.payload == null) return;
    try {
      final data = jsonDecode(response.payload!) as Map<String, dynamic>;
      _route(data);
    } catch (_) {}
  }

  static void _onOpened(RemoteMessage message) => _route(message.data);

  static void _route(Map<String, dynamic> data) {
    final link = data['link'] ?? data['deep_link'] ?? data['url'];
    if (link is String) {
      final uri = Uri.tryParse(link);
      final location = uri == null ? null : DeepLinkService.toLocation(uri);
      if (location != null) {
        _router?.go(location);
        return;
      }
    }
    final type = data['type'] as String?;
    if (type == 'contract' && data['contract_id'] != null) {
      _router?.go('/contracts');
    } else if (type == 'payment' && data['order_id'] != null) {
      _router?.go('/orders');
    } else if (type == 'listing' && data['listing_id'] != null) {
      _router?.go('/listing/${data['listing_id']}');
    } else {
      _router?.go('/notifications');
    }
  }
}
