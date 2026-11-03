// Bottom-nav shell + profile hub. Uses go_router everywhere (no imperative
// Navigator routes), Arabic-first strings, language + biometric settings.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/api_client.dart';
import '../core/biometrics.dart';
import '../core/i18n.dart';
import '../core/widgets.dart';
import '../features/legal/legal_notice.dart';
import 'favorites_screen.dart';
import 'notifications_screen.dart';
import 'search_screen.dart';
import '../core/theme.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  List<String> get _titles => [s('nav_search'), s('nav_favorites'), s('nav_notifications'), s('nav_profile')];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_index == 0 ? s('brand') : _titles[_index]),
        actions: [
          IconButton(
            tooltip: s('language'),
            icon: const Icon(Icons.language),
            onPressed: () => LocaleController.instance.toggle(),
          ),
          ValueListenableBuilder<ThemeMode>(
            valueListenable: appThemeMode,
            builder: (context, mode, _) => IconButton(
              tooltip: mode == ThemeMode.dark ? "الوضع النهاري" : "الوضع الليلي",
              icon: Icon(mode == ThemeMode.dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
              onPressed: () async {
                final next = mode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
                appThemeMode.value = next;
                await const FlutterSecureStorage().write(
                  key: "aqar.theme",
                  value: next == ThemeMode.dark ? "dark" : "light",
                );
              },
            ),
          ),
        ],
      ),
      body: IndexedStack(
        index: _index,
        children: const [
          SearchScreen(),
          FavoritesScreen(),
          NotificationsScreen(),
          ProfileScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.search_outlined), selectedIcon: const Icon(Icons.search), label: s('nav_search')),
          NavigationDestination(icon: const Icon(Icons.favorite_border), selectedIcon: const Icon(Icons.favorite), label: s('nav_favorites')),
          NavigationDestination(icon: const Icon(Icons.notifications_outlined), selectedIcon: const Icon(Icons.notifications), label: s('nav_notifications')),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: s('nav_profile')),
        ],
      ),
    );
  }
}

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final api = ApiClient();
  Map<String, dynamic>? _me;
  String? _error;
  bool _biometric = false;

  @override
  void initState() {
    super.initState();
    _load();
    BiometricGate.instance.enabled.then((v) {
      if (mounted) setState(() => _biometric = v);
    });
  }

  Future<void> _load() async {
    try {
      final me = await api.cachedGet('/me') as Map<String, dynamic>;
      if (mounted) setState(() { _me = me; _error = null; });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _editName() async {
    final ctrl = TextEditingController(text: (_me?['full_name'] ?? '') as String);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(AppStrings.isArabic ? 'تعديل الاسم' : 'Edit name'),
        content: TextField(controller: ctrl, decoration: InputDecoration(labelText: s('account_name'))),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(s('cancel'))),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(s('save'))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await api.patch('/me', data: {'full_name': ctrl.text.trim()});
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(s('save'))));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _logout() async {
    await ApiClient.clear();
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) return ErrorView(message: _error!, onRetry: _load);
    if (_me == null) return const CardSkeleton();
    final me = _me!;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        Card(
          child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person)),
            title: Text((me['full_name'] ?? (AppStrings.isArabic ? 'مستخدم جديد' : 'New user')) as String),
            subtitle: Text('${me['phone']}', textDirection: TextDirection.ltr),
            trailing: IconButton(icon: const Icon(Icons.edit), onPressed: _editName, tooltip: s('save')),
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const Icon(Icons.verified_user_outlined, color: AppColors.teal),
            title: Text(s('trust_title')),
            subtitle: TrustBadge(level: (me['verification_level'] ?? 'phone') as String),
            trailing: const Icon(Icons.chevron_left),
            onTap: () => context.go('/trust'),
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: [
              _tile(Icons.verified_user_outlined, AppStrings.isArabic ? 'رفع مستندات التوثيق' : 'Upload verification documents',
                  '${me['verification_status']}', '/verification'),
              _tile(Icons.dashboard_outlined, AppStrings.isArabic ? 'لوحة المالك' : 'Owner dashboard', AppStrings.isArabic ? 'إعلاناتك وحالتها' : 'Your listings & status', '/owner'),
              _tile(Icons.payments_outlined, s('pricing'), AppStrings.isArabic ? 'باقات واشتراكات' : 'Packages & plans', '/pricing'),
              _tile(Icons.business_outlined, s('office_workspace'), s('office_tagline'), '/office'),
              _tile(Icons.description_outlined, s('contracts'), AppStrings.isArabic ? 'اتفاقات خاصة ومحاضر تسليم' : 'Private agreements & handovers', '/contracts'),
              _tile(Icons.receipt_long_outlined, AppStrings.isArabic ? 'طلباتي وإيصالاتي' : 'My orders & receipts', '', '/orders'),
              _tile(Icons.gavel_outlined, s('legal_title'), s('legal_private_only'), '/legal'),
            ],
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.language),
                title: Text(s('language')),
                subtitle: Text(AppStrings.isArabic ? 'العربية · اضغط للإنجليزية' : 'English · tap for Arabic'),
                onTap: () => LocaleController.instance.toggle(),
              ),
              SwitchListTile(
                secondary: const Icon(Icons.fingerprint),
                title: Text(s('biometric_use')),
                value: _biometric,
                onChanged: (v) async {
                  if (v && !await BiometricGate.instance.canUse()) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                        content: Text(AppStrings.isArabic ? 'الجهاز لا يدعم البصمة' : 'Biometrics unavailable on this device'),
                      ));
                    }
                    return;
                  }
                  await BiometricGate.instance.setEnabled(v);
                  if (mounted) setState(() => _biometric = v);
                },
              ),
              ListTile(
                leading: const Icon(Icons.logout, color: AppColors.danger),
                title: Text(s('logout'), style: const TextStyle(color: AppColors.danger)),
                onTap: _logout,
              ),
            ],
          ),
        ),
        const SizedBox(height: 12),
        const LegalNotice(),
      ],
    );
  }

  Widget _tile(IconData icon, String title, String subtitle, String route) => ListTile(
        leading: Icon(icon),
        title: Text(title),
        subtitle: subtitle.isEmpty ? null : Text(subtitle, style: const TextStyle(fontSize: 11)),
        trailing: const Icon(Icons.chevron_left),
        onTap: () => context.go(route),
      );
}
