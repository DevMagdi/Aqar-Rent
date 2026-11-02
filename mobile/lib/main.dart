// Aqar Rent — full Flutter client (Android + iOS).
// Arabic-first (RTL), English secondary. Build: flutter create . && flutter run
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'api/api_client.dart';
import 'push_service.dart';
import 'screens/login_screen.dart';
import 'screens/home_shell.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Push (FCM) boots after the first frame so a missing Firebase config never
  // blocks the app — see push_service.dart (requires FIREBASE_* dart-defines).
  WidgetsBinding.instance.addPostFrameCallback((_) {
    // ignore: discarded_futures
    PushServiceBootstrap.maybeInit();
  });
  runApp(const AqarApp());
}

class AqarApp extends StatelessWidget {
  const AqarApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'عقار ربنا',
      debugShowCheckedModeBanner: false,
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFFA93408)),
        scaffoldBackgroundColor: const Color(0xFFFAFAF9),
      ),
      routes: {
        '/': (_) => const BootGate(),
        '/home': (_) => const HomeShell(),
      },
    );
  }
}

/// Silent session check: straight to the shell when a token exists.
class BootGate extends StatefulWidget {
  const BootGate({super.key});
  @override
  State<BootGate> createState() => _BootGateState();
}

class _BootGateState extends State<BootGate> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final ok = await ApiClient.hasSession();
      if (!mounted) return;
      Navigator.of(context).pushReplacementNamed(ok ? '/home' : '/login');
    });
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
