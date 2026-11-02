// Bottom-nav shell: Search · Favorites · Notifications · Profile.
import 'package:flutter/material.dart';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/api_client.dart';
import 'favorites_screen.dart';
import 'notifications_screen.dart';
import 'owner/dashboard_screen.dart';
import 'owner/orders_screen.dart';
import 'owner/verification_screen.dart';
import 'search_screen.dart';
import 'contracts/contracts_home_screen.dart';
import '../core/theme.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});
  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;
  static const _titles = ['البحث', 'المفضلة', 'الإشعارات', 'حسابي'];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_titles[_index]),
        actions: [
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
        destinations: const [
          NavigationDestination(icon: Icon(Icons.search), label: 'بحث'),
          NavigationDestination(icon: Icon(Icons.favorite_border), label: 'المفضلة'),
          NavigationDestination(icon: Icon(Icons.notifications_outlined), label: 'إشعارات'),
          NavigationDestination(icon: Icon(Icons.person_outline), label: 'حسابي'),
        ],
      ),
    );
  }
}

/// Profile tab: name edit, verification, owner tools, orders, contracts, logout.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final api = ApiClient();
  Map<String, dynamic>? _me;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final me = await api.get('/me') as Map<String, dynamic>;
      if (mounted) setState(() => _me = me);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _editName() async {
    final ctrl = TextEditingController(text: (_me?['full_name'] ?? '') as String);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تعديل الاسم'),
        content: TextField(controller: ctrl, decoration: const InputDecoration(labelText: 'الاسم')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('حفظ')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await api.patch('/me', data: {'full_name': ctrl.text.trim()});
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم الحفظ ✓')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _logout() async {
    await ApiClient.clear();
    if (mounted) Navigator.of(context).pushNamedAndRemoveUntil('/login', (_) => false);
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) return Center(child: Text('$_error'));
    if (_me == null) return const Center(child: CircularProgressIndicator());
    final me = _me!;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Card(
          child: ListTile(
            leading: const CircleAvatar(child: Icon(Icons.person)),
            title: Text((me['full_name'] ?? 'مستخدم جديد') as String),
            subtitle: Text('${me['phone']}', textDirection: TextDirection.ltr),
            trailing: IconButton(icon: const Icon(Icons.edit), onPressed: _editName, tooltip: 'تعديل'),
          ),
        ),
        const SizedBox(height: 8),
        Card(
          child: Column(
            children: [
              ListTile(
                leading: const Icon(Icons.verified_user_outlined),
                title: const Text('توثيق الملكية'),
                subtitle: Text('الحالة: ${me['verification_status']}'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const VerificationScreen())),
              ),
              ListTile(
                leading: const Icon(Icons.dashboard_outlined),
                title: const Text('لوحة المالك'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OwnerDashboardScreen())),
              ),
              ListTile(
                leading: const Icon(Icons.receipt_long_outlined),
                title: const Text('طلباتي وإيصالاتي'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const OrdersScreen())),
              ),
              ListTile(
                leading: const Icon(Icons.description_outlined),
                title: const Text('العقود والتسليم'),
                trailing: const Icon(Icons.chevron_left),
                onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ContractsHomeScreen())),
              ),
              ListTile(
                leading: const Icon(Icons.logout, color: AppColors.danger),
                title: const Text('تسجيل الخروج', style: TextStyle(color: AppColors.danger)),
                onTap: _logout,
              ),
            ],
          ),
        ),
      ],
    );
  }
}
