// My contracts list (owner + tenant roles) + entry to the wizard.
import 'package:flutter/material.dart';

import '../../core/widgets.dart';

import '../../api/api_client.dart';
import 'contract_detail_screen.dart';
import 'contract_wizard_screen.dart';

class ContractsHomeScreen extends StatefulWidget {
  const ContractsHomeScreen({super.key});
  @override
  State<ContractsHomeScreen> createState() => _ContractsHomeScreenState();
}

class _ContractsHomeScreenState extends State<ContractsHomeScreen> {
  final api = ApiClient();
  List<Map<String, dynamic>> _items = [];
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
      final rows = await api.get('/contracts') as List;
      if (mounted) {
        setState(() {
          _items = rows.whereType<Map<String, dynamic>>().toList();
          _loading = false;
        });
      }
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _loading = false; });
    }
  }

  String _statusAr(String s) => switch (s) {
        'draft' => 'مسودة',
        'pending_confirmation' => 'بانتظار التأكيد',
        'confirmed' => 'مؤكد نهائياً',
        'active' => 'نشط',
        'terminated' => 'منتهٍ',
        'completed' => 'مكتمل',
        _ => s,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('العقود')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () async {
          await Navigator.push(context, AqarPageRoute(disableAnimations: MediaQuery.of(context).disableAnimations, builder: (_) => const ContractWizardScreen()));
          if (mounted) _load();
        },
        icon: const Icon(Icons.add),
        label: const Text('عقد جديد'),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Text('$_error'))
              : RefreshIndicator(
                  onRefresh: _load,
                  child: _items.isEmpty
                      ? ListView(children: const [Center(child: Padding(padding: EdgeInsets.all(32), child: Text('لا توجد عقود بعد')))])
                      : ListView.separated(
                          padding: const EdgeInsets.all(12),
                          itemCount: _items.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (context, i) {
                            final c = _items[i];
                            final refNo = c['reference_no'] as String;
                            final status = c['status'] as String;
                            return Card(
                              child: ListTile(
                                title: Text(refNo, textDirection: TextDirection.ltr),
                                subtitle: Text('${c['listing_title'] ?? ''} · ${_statusAr(status)}'),
                                trailing: const Icon(Icons.chevron_left),
                                onTap: () async {
                                  await Navigator.push(
                                    context,
                                    AqarPageRoute(disableAnimations: MediaQuery.of(context).disableAnimations, builder: (_) => ContractDetailScreen(contractId: c['id'] as String)),
                                  );
                                  if (mounted) _load();
                                },
                              ),
                            );
                          },
                        ),
                ),
    );
  }
}
