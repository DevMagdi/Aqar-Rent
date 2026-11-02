// Owner dashboard: my listings with stats + renew / mark-rented / edit / add.
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';
import 'listing_wizard_screen.dart';

class OwnerDashboardScreen extends StatefulWidget {
  const OwnerDashboardScreen({super.key});
  @override
  State<OwnerDashboardScreen> createState() => _OwnerDashboardScreenState();
}

class _OwnerDashboardScreenState extends State<OwnerDashboardScreen> {
  final api = ApiClient();
  List<MeListing> _items = [];
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
      final rows = await api.get('/me/listings') as List;
      if (mounted) {
        setState(() {
          _items = rows.whereType<Map<String, dynamic>>().map(MeListing.fromJson).toList();
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _loading = false; });
    }
  }

  Future<void> _markRented(String id) async {
    try {
      await api.post('/listings/$id/mark-rented', data: {});
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  String _statusAr(String s) => switch (s) {
        'draft' => 'مسودة',
        'submitted' => 'قيد المراجعة',
        'approved' => 'معتمد',
        'active' => 'نشط',
        'expired' => 'منتهي',
        'rejected' => 'مرفوض',
        'rented' => 'مؤجر',
        'removed' => 'محذوف',
        _ => s,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('لوحة المالك')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          await Navigator.push(context, MaterialPageRoute(builder: (_) => const ListingWizardScreen()));
          if (mounted) _load();
        },
        icon: const Icon(Icons.add),
        label: const Text('إعلان جديد'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('$_error'))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _items.isEmpty
                      ? ListView(children: const [Center(child: Padding(padding: EdgeInsets.all(32), child: Text('لم تضف أي إعلان بعد')))])
                      : ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _items.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, i) {
                            final l = _items[i];
                            final stats = l.stats;
                            return Card(
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Expanded(child: Text(l.title, style: const TextStyle(fontWeight: FontWeight.bold))),
                                        Chip(label: Text(_statusAr(l.status), style: const TextStyle(fontSize: 11))),
                                      ],
                                    ),
                                    if (l.rejectReason != null)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 4),
                                        child: Text('سبب الرفض: ${l.rejectReason}', style: const TextStyle(color: Colors.red, fontSize: 12)),
                                      ),
                                    const SizedBox(height: 6),
                                    Text(
                                      '👁 ${stats['view_count'] ?? 0} مشاهدات · ☎ ${stats['contact_count'] ?? 0} اتصال · ⏳ ${stats['days_left'] ?? '—'} يوم',
                                      style: const TextStyle(fontSize: 12, color: Colors.black54),
                                    ),
                                    const SizedBox(height: 8),
                                    Wrap(
                                      spacing: 8,
                                      children: [
                                        OutlinedButton(
                                          onPressed: () async {
                                            await Navigator.push(
                                              context,
                                              MaterialPageRoute(builder: (_) => ListingWizardScreen(editId: l.id)),
                                            );
                                            if (mounted) _load();
                                          },
                                          child: const Text('تعديل', style: TextStyle(fontSize: 12)),
                                        ),
                                        if (const ['approved', 'active', 'expired', 'rejected'].contains(l.status))
                                          FilledButton(
                                            onPressed: () async {
                                              await Navigator.push(
                                                context,
                                                MaterialPageRoute(builder: (_) => CheckoutScreen(listingId: l.id, title: l.title)),
                                              );
                                              if (mounted) _load();
                                            },
                                            child: const Text('تجديد/دفع', style: TextStyle(fontSize: 12)),
                                          ),
                                        if (l.status == 'active')
                                          OutlinedButton(
                                            onPressed: () => _markRented(l.id),
                                            child: const Text('تم التأجير', style: TextStyle(fontSize: 12)),
                                          ),
                                      ],
                                    ),
                                  ],
                                ),
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}
