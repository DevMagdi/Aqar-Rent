// OTP login: phone →6-digit code (resend timer) → session.
import 'dart:io';

import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../config.dart';
import '../core/i18n.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final api = ApiClient();
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _codeStep = false;
  bool _busy = false;
  int _resendIn = 0;
  String? _error;
  String? devCode;

  Future<void> _send() async {
    setState(() { _busy = true; _error = null; });
    try {
      final res = await api.post('/auth/otp/request', data: {'phone': _phone.text.trim()});
      final dev = (res as Map)['dev_code'] as String?;
      if (!mounted) return;
      setState(() {
        _codeStep = true;
        _busy = false;
        _resendIn = ((res['expires_in'] as num?)?.toInt() ?? 60).clamp(0, 60).toInt();
        // Dev-only helper: NEVER shown or auto-filled in production builds.
        devCode = AppConfig.isProduction ? null : dev;
      });
      if (devCode != null) _code.text = devCode!;
      _tick();
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _busy = false; });
    }
  }

  void _tick() {
    Future.doWhile(() async {
      await Future<void>.delayed(const Duration(seconds: 1));
      if (!mounted || _resendIn <= 0) return false;
      setState(() => _resendIn--);
      return true;
    });
  }

  Future<void> _verify() async {
    setState(() { _busy = true; _error = null; });
    try {
      final res = await api.post('/auth/otp/verify', data: {
        'phone': _phone.text.trim(),
        'code': _code.text.trim(),
        'platform': Platform.isIOS ? 'ios' : 'android',
      }) as Map<String, dynamic>;
      final tokens = res['tokens'] as Map<String, dynamic>?;
      if (tokens == null) throw StateError('Invalid login response');
      await ApiClient.saveTokens(
        tokens['access_token'] as String,
        tokens['refresh_token'] as String,
      );
      if (!mounted) return;
      Navigator.of(context).pushReplacementNamed('/home');
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('عقار رينت')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(_codeStep ? 'تأكيد رقم الهاتف' : 'تسجيل الدخول',
                        style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 6),
                    Text(_codeStep ? 'أدخل رمز التحقق المرسل إليك' : 'أدخل رقم هاتفك وسنرسل لك رمز تحقق',
                        style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 16),
                    if (!_codeStep)
                      TextField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(labelText: 'رقم الهاتف', hintText: '01xxxxxxxxx'),
                      )
                    else ...[
                      TextField(
                        controller: _code,
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        textAlign: TextAlign.center,
                        decoration: const InputDecoration(labelText: 'رمز التحقق', counterText: ''),
                      ),
                      TextButton(
                        onPressed: _resendIn > 0 || _busy ? null : _send,
                        child: Text(_resendIn > 0 ? 'إعادة الإرسال بعد $_resendIn ث' : 'إعادة إرسال الرمز'),
                      ),
                    ],
                    if (devCode != null && !AppConfig.isProduction) ...[
                      const SizedBox(height: 8),
                      Text('${s('login_dev_code')} $devCode',
                          textAlign: TextAlign.center,
                          style: const TextStyle(fontSize: 12, color: Color(0xFF0F766E))),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 10),
                      Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                    ],
                    const SizedBox(height: 14),
                    FilledButton(
                      onPressed: _busy ? null : (_codeStep ? _verify : _send),
                      child: Text(_busy ? '…' : (_codeStep ? 'تأكيد' : 'إرسال الرمز')),
                    ),
                    if (_codeStep)
                      TextButton(
                        onPressed: _busy ? null : () => setState(() { _codeStep = false; _error = null; }),
                        child: const Text('رجوع'),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
