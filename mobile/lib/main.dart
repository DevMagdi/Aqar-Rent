// Aqar Rent mini app — contract & handover screens (Phase 4).
// Arabic-first (RTL). Run `flutter create .` inside mobile/ once to generate
// the android/ios platform shells, then `flutter run`.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';

import 'screens/login_screen.dart';
import 'screens/contracts_screen.dart';

void main() => runApp(const AqarApp());

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
        fontFamily: 'Segoe UI',
      ),
      routes: {
        '/': (_) => const LoginScreen(),
        '/contracts': (_) => const ContractsScreen(),
      },
    );
  }
}
