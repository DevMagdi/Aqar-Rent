// Optional biometric re-lock on app resume. The OTP session remains the source
// of truth; biometrics only gate local UI access to the stored tokens.
import 'package:flutter/services.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'i18n.dart';

class BiometricGate {
  BiometricGate._();
  static final BiometricGate instance = BiometricGate._();
  static const _enabledKey = 'aqar.biometric.enabled';

  final LocalAuthentication _auth = LocalAuthentication();

  Future<bool> get enabled async =>
      (await SharedPreferences.getInstance()).getBool(_enabledKey) ?? false;

  Future<void> setEnabled(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledKey, value);
  }

  Future<bool> canUse() async {
    try {
      return await _auth.canCheckBiometrics || await _auth.isDeviceSupported();
    } on PlatformException {
      return false;
    }
  }

  /// Returns true when the user is allowed in (auth succeeded OR gate disabled).
  Future<bool> authenticate() async {
    if (!await enabled) return true;
    if (!await canUse()) return true; // device lost biometric capability
    try {
      return await _auth.authenticate(
        localizedReason: s('biometric_body'),
        options: const AuthenticationOptions(
          biometricOnly: false,
          stickyAuth: true,
          useErrorDialogs: true,
        ),
      );
    } on PlatformException {
      return false;
    }
  }
}
