/// Runtime configuration via --dart-define (no secrets here — only public
/// endpoints and Firebase public config provided by the operator).
class AppConfig {
  static const apiBase = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://10.0.2.2:8000', // Android emulator loopback
  );
  static const firebaseApiKey = String.fromEnvironment('FIREBASE_API_KEY');
  static const firebaseAppId = String.fromEnvironment('FIREBASE_APP_ID');
  static const firebaseMessagingSenderId = String.fromEnvironment('FIREBASE_SENDER_ID');
  static const firebaseProjectId = String.fromEnvironment('FIREBASE_PROJECT_ID');
  static bool get pushConfigured =>
      firebaseApiKey.isNotEmpty && firebaseAppId.isNotEmpty;
}
