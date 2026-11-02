// Aqar Rent — full Flutter client (Android + iOS).
// Arabic-first (RTL), English secondary · premium Mantiq theme (light+dark).
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'api/api_client.dart';
import 'core/theme.dart';
import 'push_service.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final mode = await const FlutterSecureStorage().read(key: "aqar.theme");
  if (mode == "dark") appThemeMode.value = ThemeMode.dark;
  if (mode == "light") appThemeMode.value = ThemeMode.light;
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
    return ValueListenableBuilder<ThemeMode>(
      valueListenable: appThemeMode,
      builder: (context, mode, _) {
        return MaterialApp(
          title: "عقار ربنا",
          debugShowCheckedModeBanner: false,
          themeMode: mode,
          theme: AppTheme.light(),
          darkTheme: AppTheme.dark(),
          locale: const Locale("ar"),
          supportedLocales: const [Locale("ar"), Locale("en")],
          localizationsDelegates: const [
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          routes: {
            "/": (_) => const BootGate(),
            "/home": (_) => const HomeShell(),
          },
        );
      },
    );
  }
}

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
      Navigator.of(context).pushReplacementNamed(ok ? "/home" : "/login");
    });
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}
