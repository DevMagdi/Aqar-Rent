// Contracts list + create entry point.
import 'package:flutter/material.dart';

import '../api.dart';
import '../models.dart';
import 'contract_detail_screen.dart';
import 'contract_wizard_screen.dart';

class ContractsScreen extends StatefulWidget {
  const ContractsScreen({super.key});

  @override
  State<ContractsScreen> createState() => _ContractsScreenState();
}

class _ContractsScreenState extends State<ContractsScreen> {
  final _api = ApiClient();
  List<Contract> _items = [];
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
      final rows = await _api.listContracts();
      if (!mounted) return;
      setState(() {
        _items = rows.map((e) => Contract.fromJson(e as Map<String, dynamic>)).toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _error = '$e'; _loading = false; });
    }
  }

  Color _statusColor(String s) => switch (s) {
        'confirmed' => Colors.green.shade700,
        'pending_confirmation' => Colors.amber.shade800,
        _ => Colors.blueGrey,
      };

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
          await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ContractWizardScreen()));
          if (mounted) _load();
        },
        icon: const Icon(Icons.add),
        label: const Text('عقد جديد'),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: _loading
            ? const Center(child: CircularProgressIndicator())
            : _error != null
                ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text('$_error', textAlign: TextAlign.center))])
                : _items.isEmpty
                    ? ListView(children: [Padding(padding: const EdgeInsets.all(24), child: Text('لا توجد عقود بعد', textAlign: TextAlign.center))])
                    : ListView.separated(
                        padding: const EdgeInsets.all(12),
                        itemCount: _items.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, i) {
                          final c = _items[i];
                          return Card(
                            child: ListTile(
                              title: Text(c.referenceNo, textDirection: TextDirection.ltr),
                              subtitle: Text('${c.listingTitle ?? ''} · ${_statusAr(c.status)}'),
                              trailing: Icon(Icons.chevron_left, color: _statusColor(c.status)),
                              onTap: () async {
                                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => ContractDetailScreen(contractId: c.id)));
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
