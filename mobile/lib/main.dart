// Aqar Rent (عقار رينت) — production Flutter client, Android + iOS.
// Arabic-first with full English, RTL, go_router deep links, FCM, biometrics,
// offline-aware cache, onboarding, polished Material 3 UI.
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:go_router/go_router.dart';

import 'api/api_client.dart';
import 'config.dart';
import 'core/biometrics.dart';
import 'core/connectivity.dart';
import 'core/deep_links.dart';
import 'core/i18n.dart';
import 'core/theme.dart';
import 'core/widgets.dart';
import 'features/legal/legal_notice.dart';
import 'features/onboarding/onboarding_screen.dart';
import 'features/offices/office_screen.dart';
import 'features/pricing/pricing_screen.dart';
import 'features/trust/trust_screen.dart';
import 'push_service.dart';
import 'screens/contracts/contracts_home_screen.dart';
import 'screens/home_shell.dart';
import 'screens/listing_detail_screen.dart';
import 'screens/login_screen.dart';
import 'screens/notifications_screen.dart';
import 'screens/owner/dashboard_screen.dart';
import 'screens/owner/orders_screen.dart';
import 'screens/owner/verification_screen.dart';

final _rootNavigatorKey = GlobalKey<NavigatorState>();

final GoRouter _router = GoRouter(
  navigatorKey: _rootNavigatorKey,
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (_, __) => const BootGate()),
    GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
    GoRoute(path: '/home', builder: (_, __) => const HomeShell()),
    GoRoute(path: '/pricing', builder: (_, __) => const PricingScreen()),
    GoRoute(path: '/trust', builder: (_, __) => const TrustScreen()),
    GoRoute(path: '/verification', builder: (_, __) => const VerificationScreen()),
    GoRoute(path: '/office', builder: (_, __) => const OfficeScreen()),
    GoRoute(path: '/contracts', builder: (_, __) => const ContractsHomeScreen()),
    GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
    GoRoute(path: '/owner', builder: (_, __) => const OwnerDashboardScreen()),
    GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
    GoRoute(path: '/legal', builder: (_, __) => const LegalScreen()),
    GoRoute(
      path: '/listing/:id',
      builder: (_, state) => ListingDetailScreen(listingId: state.pathParameters['id']!),
    ),
    GoRoute(
      path: '/verify/:ref',
      builder: (_, state) => VerifyReferenceScreen(reference: state.pathParameters['ref']!),
    ),
  ],
  errorBuilder: (context, state) => Scaffold(
    appBar: AppBar(title: Text(s('brand'))),
    body: ErrorView(message: s('empty_generic'), onRetry: () => context.go('/')),
  ),
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Fail fast on a misconfigured release build (no dev API, no missing FCM).
  AppConfig.assertReleaseConfig();
  await ConnectivityService.instance.init();
  DeepLinkService.instance.attach(_router);
  WidgetsBinding.instance.addPostFrameCallback((_) {
    // ignore: discarded_futures
    PushServiceBootstrap.init(_router);
  });
  runApp(const AqarApp());
}

class AqarApp extends StatefulWidget {
  const AqarApp({super.key});
  @override
  State<AqarApp> createState() => _AqarAppState();
}

class _AqarAppState extends State<AqarApp> with WidgetsBindingObserver {
  bool _locked = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    DeepLinkService.instance.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      setState(() => _locked = true);
    } else if (state == AppLifecycleState.resumed && _locked) {
      _unlock();
    }
  }

  Future<void> _unlock() async {
    final ok = await BiometricGate.instance.authenticate();
    if (mounted) setState(() => _locked = !ok);
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: LocaleController.instance,
      builder: (_, __) => MaterialApp.router(
        title: s('brand'),
        debugShowCheckedModeBanner: false,
        routerConfig: _router,
        locale: LocaleController.instance.locale,
        supportedLocales: const [Locale('ar'), Locale('en')],
        localizationsDelegates: const [
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        theme: AppTheme.light(),
        darkTheme: AppTheme.dark(),
        themeMode: ThemeMode.system,
        builder: (context, child) => Directionality(
          textDirection: AppStrings.direction,
          child: Stack(
            children: [
              Column(
                children: [
                  StreamBuilder<bool>(
                    stream: ConnectivityService.instance.changes,
                    initialData: ConnectivityService.instance.online,
                    builder: (_, snap) => OfflineBanner(offline: !(snap.data ?? true)),
                  ),
                  Expanded(child: child ?? const SizedBox.shrink()),
                ],
              ),
              if (_locked)
                BiometricLockScreen(
                  onUnlocked: () => setState(() => _locked = false),
                  onLogout: () {
                    setState(() => _locked = false);
                    _router.go('/login');
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// First-run → onboarding → session check → shell or login.
class BootGate extends StatefulWidget {
  const BootGate({super.key});
  @override
  State<BootGate> createState() => _BootGateState();
}

class _BootGateState extends State<BootGate> {
  bool _checking = true;
  bool _locked = false;

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    final seen = await onboardingSeen();
    if (!mounted) return;
    if (!seen) {
      setState(() => _checking = false);
      return;
    }
    await _decide();
  }

  Future<void> _decide() async {
    final ok = await ApiClient.hasSession();
    if (!mounted) return;
    if (ok && !await BiometricGate.instance.authenticate()) {
      setState(() { _checking = false; _locked = true; });
      return;
    }
    if (!mounted) return;
    _router.go(ok ? '/home' : '/login');
  }

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    if (_locked) {
      return BiometricLockScreen(
        onUnlocked: () {
          setState(() => _locked = false);
          _router.go('/home');
        },
        onLogout: () {
          setState(() => _locked = false);
          _router.go('/login');
        },
      );
    }
    return OnboardingScreen(
      onDone: () {
        // ignore: discarded_futures
        _decide();
      },
    );
  }
}

class BiometricLockScreen extends StatelessWidget {
  const BiometricLockScreen({super.key, required this.onUnlocked, required this.onLogout});
  final VoidCallback onUnlocked;
  final VoidCallback onLogout;
  @override
  Widget build(BuildContext context) => Scaffold(
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(30),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.fingerprint, size: 72, color: AppTheme.brand),
                const SizedBox(height: 18),
                Text(s('biometric_title'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                Text(s('biometric_body'), textAlign: TextAlign.center, style: const TextStyle(fontSize: 13)),
                const SizedBox(height: 22),
                FilledButton.icon(
                  onPressed: () async {
                    final ok = await BiometricGate.instance.authenticate();
                    if (ok) onUnlocked();
                  },
                  icon: const Icon(Icons.lock_open),
                  label: Text(s('biometric_use')),
                ),
                TextButton(
                  onPressed: () async {
                    await ApiClient.clear();
                    onLogout();
                  },
                  child: Text(s('biometric_fallback')),
                ),
              ],
            ),
          ),
        ),
      );
}

class LegalScreen extends StatelessWidget {
  const LegalScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(s('legal_title'))),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const LegalNotice(compact: false),
            const SizedBox(height: 16),
            Text(s('legal_body'), style: const TextStyle(fontSize: 13, height: 1.8)),
            const SizedBox(height: 16),
            Text(s('no_rent_money'), style: const TextStyle(fontSize: 12, color: Colors.black54, height: 1.6)),
          ],
        ),
      );
}

/// Public QR/contract verification result — honest, no government claim.
class VerifyReferenceScreen extends StatefulWidget {
  const VerifyReferenceScreen({super.key, required this.reference});
  final String reference;
  @override
  State<VerifyReferenceScreen> createState() => _VerifyReferenceScreenState();
}

class _VerifyReferenceScreenState extends State<VerifyReferenceScreen> {
  final api = ApiClient();
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async =>
      (await api.cachedGet('/verify/${Uri.encodeComponent(widget.reference)}')) as Map<String, dynamic>;

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: Text(s('legal_title'))),
        body: FutureBuilder<Map<String, dynamic>>(
          future: _future,
          builder: (_, snap) => AsyncView<Map<String, dynamic>>(
            snapshot: snap,
            onRetry: () => setState(() => _future = _load()),
            builder: (d) => ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: ListTile(
                    leading: Icon(
                      d['valid'] == true ? Icons.verified : Icons.error_outline,
                      color: d['valid'] == true ? AppTheme.teal : Colors.red,
                    ),
                    title: Text(widget.reference, style: const TextStyle(fontWeight: FontWeight.w900)),
                    subtitle: Text(
                      d['status'] == null
                          ? (AppStrings.isArabic ? 'تعذّر التحقق من هذا المرجع' : 'This reference could not be verified')
                          : '${d['status']} · ${d['reference_no'] ?? widget.reference}',
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                const LegalNotice(compact: false),
              ],
            ),
          ),
        ),
      );
}
