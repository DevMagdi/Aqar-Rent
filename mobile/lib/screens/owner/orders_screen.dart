// Orders & receipts: statuses, gateway/bank links, Arabic PDF receipt download
// (authenticated bytes → share sheet).
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../api/api_client.dart';
import '../../models/models.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  final api = ApiClient();
  List<Order> _items = [];
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
      final res = await api.get('/me/orders?limit=50') as Map<String, dynamic>;
      final items = ((res['items'] as List?) ?? []).whereType<Map<String, dynamic>>().map(Order.fromJson).toList();
      if (mounted) setState(() { _items = items; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _loading = false; });
    }
  }

  Future<void> _downloadReceipt(String orderId) async {
    try {
      final bytes = await api.downloadBytes('/orders/$orderId/receipt');
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/receipt-$orderId.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await Share.shareXFiles([XFile(file.path)], text: 'إيصال عقار رينت');
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  String _statusAr(String s) => switch (s) {
        'pending' => 'بانتظار الدفع',
        'paid' => 'مدفوع',
        'failed' => 'فشل',
        'expired' => 'منتهي',
        'refunded' => 'مسترد',
        _ => s,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('طلباتي وإيصالاتي')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('$_error'))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _items.isEmpty
                      ? ListView(children: const [Center(child: Padding(padding: EdgeInsets.all(32), child: Text('لا توجد طلبات بعد')))])
                      : ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _items.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, i) {
                            final o = _items[i];
                            return Card(
                              child: Padding(
                                padding: const EdgeInsets.all(12),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(
                                      children: [
                                        Text('طلب ${o.id.substring(0, 8)}', style: const TextStyle(fontWeight: FontWeight.bold)),
                                        const Spacer(),
                                        Chip(label: Text(_statusAr(o.status), style: const TextStyle(fontSize: 11))),
                                      ],
                                    ),
                                    const SizedBox(height: 4),
                                    Text('${o.weeks} أسابيع · ${o.total.toStringAsFixed(0)} جنيه · ${o.method}', style: const TextStyle(fontSize: 12)),
                                    if (o.status == 'paid')
                                      Align(
                                        alignment: AlignmentDirectional.centerStart,
                                        child: TextButton.icon(
                                          onPressed: () => _downloadReceipt(o.id),
                                          icon: const Icon(Icons.picture_as_pdf, size: 18),
                                          label: const Text('تحميل الإيصال PDF'),
                                        ),
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
