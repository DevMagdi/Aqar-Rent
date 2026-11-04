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
import 'contracts/contracts_home_screen.dart';
import 'search_screen.dart';
import '../core/theme.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  final _searchKey = GlobalKey<SearchScreenState>();
  List<String> get _titles => [s('nav_home'), s('nav_search'), s('nav_favorites'), s('nav_contracts'), s('nav_profile')];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        toolbarHeight: 64,
        title: _index == 0 ? const AqarLockup() : Text(_titles[_index]),
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
        children: [
          _HomeLanding(
            onSearch: () => setState(() => _index = 1),
            onFilter: (type) {
              setState(() => _index = 1);
              WidgetsBinding.instance.addPostFrameCallback((_) => _searchKey.currentState?.applyQuickFilter(type));
            },
          ),
          SearchScreen(key: _searchKey),
          const FavoritesScreen(),
          const ContractsHomeScreen(),
          const ProfileScreen(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          NavigationDestination(icon: const Icon(Icons.home_outlined), selectedIcon: const Icon(Icons.home_rounded), label: s('nav_home')),
          NavigationDestination(icon: const Icon(Icons.search_outlined), selectedIcon: const Icon(Icons.search), label: s('nav_search')),
          NavigationDestination(icon: const Icon(Icons.favorite_border), selectedIcon: const Icon(Icons.favorite), label: s('nav_favorites')),
          NavigationDestination(icon: const Icon(Icons.description_outlined), selectedIcon: const Icon(Icons.description), label: s('nav_contracts')),
          NavigationDestination(icon: const Icon(Icons.person_outline), selectedIcon: const Icon(Icons.person), label: s('nav_profile')),
        ],
      ),
    );
  }
}

class _HomeLanding extends StatelessWidget {
  const _HomeLanding({required this.onSearch, required this.onFilter});
  final VoidCallback onSearch;
  final ValueChanged<String> onFilter;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final types = <MapEntry<String, String>>[
      MapEntry('apartment', s('spec_apartment')),
      MapEntry('studio', s('spec_studio')),
      MapEntry('villa', s('spec_villa')),
      MapEntry('room', s('spec_room')),
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 18, 16, 28),
      children: [
        Container(
          padding: const EdgeInsets.all(22),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(28),
            border: Border.all(color: AppColors.gold.withValues(alpha: .28)),
            gradient: LinearGradient(
              begin: AlignmentDirectional.topStart,
              end: AlignmentDirectional.bottomEnd,
              colors: [AppColors.brand, AppColors.brandDeep],
            ),
            boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: dark ? .38 : .16), blurRadius: 28, offset: const Offset(0, 14))],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                const AqarMark(size: 34),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    s('brand'),
                    style: const TextStyle(color: AppColors.onDark, fontFamily: 'ElMessiriArabic', fontWeight: FontWeight.w700, fontSize: 16),
                  ),
                ),
                Icon(Icons.verified, size: 18, color: AppColors.gold),
              ]),
              const SizedBox(height: 14),
              Text(s('welcome'), style: const TextStyle(color: AppColors.onDark, fontFamily: 'ElMessiriArabic', fontWeight: FontWeight.w700, fontSize: 27, height: 1.25)),
              const SizedBox(height: 8),
              Text(s('tagline'), style: const TextStyle(color: AppColors.onDark, fontSize: 13, height: 1.65)),
              const SizedBox(height: 20),
              Semantics(
                button: true,
                label: s('search_hint'),
                child: Material(
                  color: Theme.of(context).colorScheme.surface,
                  borderRadius: BorderRadius.circular(999),
                  child: InkWell(
                    onTap: onSearch,
                    borderRadius: BorderRadius.circular(999),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(minHeight: AppShape.tapMin),
                      child: Padding(
                        padding: const EdgeInsetsDirectional.fromSTEB(18, 8, 8, 8),
                        child: Row(children: [
                          Expanded(
                            child: Text(
                              s('search_hint'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: .66), fontSize: 13),
                            ),
                          ),
                          const SizedBox(width: 8),
                          const CircleAvatar(radius: 20, backgroundColor: AppColors.gold, child: Icon(Icons.search, color: AppColors.brandDeep, size: 20)),
                        ]),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        Text(s('quick_filters'), style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        const SizedBox(height: 10),
        Wrap(spacing: 8, runSpacing: 8, children: [
          for (final entry in types)
            ActionChip(
              avatar: const Icon(Icons.home_work_outlined, size: 16),
              label: Text(entry.value),
              onPressed: () => onFilter(entry.key),
            ),
        ]),
        const SizedBox(height: 22),
        Card(
          child: InkWell(
            onTap: onSearch,
            borderRadius: BorderRadius.circular(AppShape.radiusCard),
            child: ConstrainedBox(
              constraints: const BoxConstraints(minHeight: AppShape.tapMin),
              child: Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(16, 14, 16, 14),
                child: Row(children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                      color: dark ? AppColors.darkGoldTint : AppColors.verifiedBg,
                      shape: BoxShape.circle,
                      border: Border.all(color: AppColors.verifiedBorder),
                    ),
                    child: Icon(Icons.verified_user_outlined, color: dark ? AppColors.gold : AppColors.verified, size: 21),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(s('trust_title'), style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      const SizedBox(height: 2),
                      Text(s('trust_note'), maxLines: 2, overflow: TextOverflow.ellipsis, style: TextStyle(fontSize: 12.5, color: appMutedColor(context))),
                    ]),
                  ),
                  Icon(
                    Directionality.of(context) == TextDirection.rtl ? Icons.chevron_left : Icons.chevron_right,
                    color: appMutedColor(context),
                  ),
                ]),
              ),
            ),
          ),
        ),
      ],
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
            minTileHeight: AppShape.tapMin,
            contentPadding: const EdgeInsetsDirectional.fromSTEB(16, 6, 16, 6),
            leading: Icon(
              Icons.verified_user_outlined,
              color: Theme.of(context).brightness == Brightness.dark ? AppColors.gold : AppColors.verified,
            ),
            title: Text(s('trust_title')),
            subtitle: TrustBadge(level: (me['verification_level'] ?? 'phone') as String),
            trailing: Icon(
              Directionality.of(context) == TextDirection.rtl ? Icons.chevron_left : Icons.chevron_right,
              color: appMutedColor(context),
            ),
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
              _tile(Icons.notifications_outlined, s('nav_notifications'), '', '/notifications'),
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
