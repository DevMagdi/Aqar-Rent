import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../core/theme.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({super.key});
  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  final api = ApiClient();
  List<AppNotification> _items = [];
  int _unread = 0;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await api.get('/notifications?limit=50') as Map<String, dynamic>;
      final items = ((res['items'] as List?) ?? []).whereType<Map<String, dynamic>>().map(AppNotification.fromJson).toList();
      if (mounted) {
        setState(() {
          _items = items;
          _unread = (res['unread_count'] as num?)?.toInt() ?? 0;
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _loading = false; });
    }
  }

  Future<void> _markAll() async {
    try {
      await api.post('/notifications/read', data: {'ids': <String>[]});
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text('$_error'));
    return RefreshIndicator(
      onRefresh: _load,
      child: _items.isEmpty
          ? ListView(children: const [Center(child: Padding(padding: EdgeInsets.all(32), child: Text('لا توجد إشعارات')))])
          : ListView(
              children: [
                if (_unread > 0)
                  Align(
                    alignment: AlignmentDirectional.centerEnd,
                    child: TextButton(onPressed: _markAll, child: const Text('تعليم الكل كمقروء')),
                  ),
                for (final n in _items)
                  Card(
                    color: n.read ? null : AppColors.goldTint14,
                    child: ListTile(
                      title: Text(n.title, style: TextStyle(fontWeight: n.read ? FontWeight.normal : FontWeight.bold)),
                      subtitle: Text(n.body),
                      trailing: n.read ? null : Container(width: 8, height: 8, decoration: const BoxDecoration(color: AppColors.gold, shape: BoxShape.circle)),
                    ),
                  ),
              ],
            ),
    );
  }
}
