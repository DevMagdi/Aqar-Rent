// OTP login (phone → code) required to view & confirm contracts.
import 'package:flutter/material.dart';

import '../api.dart';
import 'contracts_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _api = ApiClient();
  final _phone = TextEditingController();
  final _code = TextEditingController();
  bool _codeStep = false;
  bool _busy = false;
  String? _error;

  Future<void> _send() async {
    setState(() { _busy = true; _error = null; });
    try {
      final dev = await _api.requestOtp(_phone.text.trim());
      if (!mounted) return;
      setState(() { _codeStep = true; _busy = false; });
      if (dev.isNotEmpty) _code.text = dev; // dev builds expose the code
    } catch (e) {
      setState(() { _error = '$e'; _busy = false; });
    }
  }

  Future<void> _verify() async {
    setState(() { _busy = true; _error = null; });
    try {
      await _api.verifyOtp(_phone.text.trim(), _code.text.trim());
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const ContractsScreen()));
    } catch (e) {
      setState(() { _error = '$e'; _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('عقار ربنا — العقود')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 420),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Text(_codeStep ? 'تأكيد رقم الهاتف' : 'تسجيل الدخول', style: Theme.of(context).textTheme.titleLarge),
                    const SizedBox(height: 6),
                    Text(_codeStep ? 'أدخل رمز التحقق المرسل إليك' : 'أدخل رقم هاتفك وسنرسل لك رمز تحقق',
                        style: Theme.of(context).textTheme.bodySmall),
                    const SizedBox(height: 16),
                    if (!_codeStep) ...[
                      TextField(
                        controller: _phone,
                        keyboardType: TextInputType.phone,
                        decoration: const InputDecoration(labelText: 'رقم الهاتف', hintText: '01xxxxxxxxx'),
                      ),
                    ] else ...[
                      TextField(
                        controller: _code,
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        textAlign: TextAlign.center,
                        decoration: const InputDecoration(labelText: 'رمز التحقق', counterText: ''),
                      ),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: 10),
                      Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
                    ],
                    const SizedBox(height: 18),
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
