// Contract detail: status, terms, OTP confirmation, PDF, fee, handovers entry.
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../api.dart';
import '../models.dart';
import 'handover_screen.dart';

class ContractDetailScreen extends StatefulWidget {
  const ContractDetailScreen({super.key, required this.contractId});

  final String contractId;

  @override
  State<ContractDetailScreen> createState() => _ContractDetailScreenState();
}

class _ContractDetailScreenState extends State<ContractDetailScreen> {
  final _api = ApiClient();
  Contract? _contract;
  List<Handover> _handovers = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final c = await _api.getContract(widget.contractId);
      final h = await _api.listHandovers(widget.contractId);
      if (!mounted) return;
      setState(() {
        _contract = Contract.fromJson(c);
        _handovers = h.map((e) => Handover.fromJson(e as Map<String, dynamic>)).toList();
        _error = null;
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _otpDialog(String title, Future<void> Function(String code) onConfirm) async {
    final ctrl = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          maxLength: 6,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'رمز التحقق', counterText: ''),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('تأكيد')),
        ],
      ),
    );
    if (code == null || code.length != 6) return;
    try {
      await onConfirm(code);
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم التأكيد ✓')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _downloadPdf() async {
    try {
      final b64 = await _contractPdf();
      final bytes = base64Decode(b64);
      final dir = await getTemporaryDirectory();
      final file = File('${dir.path}/contract-${_contract!.referenceNo}.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await Share.shareXFiles([XFile(file.path)], text: 'عقد ${_contract!.referenceNo}');
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<String> _contractPdf() => _api.contractPdf(widget.contractId);

  Future<void> _payFee() async {
    try {
      final order = await _api.createFeeOrder(widget.contractId, 'card');
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('طلب الدفع جاهز: ${order['order_id']}')));
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
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

  String _tplAr(String s) => switch (s) {
        'residential_unfurnished' => 'سكني — غير مفروش',
        'residential_furnished' => 'سكني — مفروش',
        'commercial' => 'تجاري',
        _ => s,
      };

  @override
  Widget build(BuildContext context) {
    final c = _contract;
    return Scaffold(
      appBar: AppBar(title: Text(c?.referenceNo ?? 'العقد')),
      body: _error != null
          ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text('$_error', textAlign: TextAlign.center)))
          : c == null
              ? const Center(child: CircularProgressIndicator())
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                children: [
                                  Text(_tplAr(c.template), style: const TextStyle(fontWeight: FontWeight.bold)),
                                  Chip(label: Text(_statusAr(c.status))),
                                ],
                              ),
                              if (c.status == 'confirmed') ...[
                                const SizedBox(height: 8),
                                Container(
                                  padding: const EdgeInsets.all(8),
                                  decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(10)),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      const Text('✓ العقد مؤكد نهائياً وغير قابل للتعديل', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                                      if (c.termsHash != null)
                                        Text('SHA-256: ${c.termsHash}', style: const TextStyle(fontSize: 10, color: Colors.grey)),
                                    ],
                                  ),
                                ),
                              ],
                              const SizedBox(height: 8),
                              ...c.parties.map((p) => Text(
                                    '${p.role == 'owner' ? 'المالك' : 'المستأجر'}: ${p.fullName} · ${p.nidMasked}',
                                    style: const TextStyle(fontSize: 13),
                                  )),
                              const Divider(),
                              Text('العنوان: ${c.terms['unit_address'] ?? '—'}'),
                              Text('البداية: ${c.terms['start_date'] ?? '—'} · المدة: ${c.terms['duration_months'] ?? '—'} شهراً'),
                              Text('الإيجار: ${c.terms['monthly_rent'] ?? '—'} جنيه/شهر · الزيادة: ${c.terms['yearly_increase_pct'] ?? 0}%'),
                              Text('التأمين: ${c.terms['deposit_amount'] ?? '—'} (رد خلال ${c.terms['deposit_refund_days'] ?? 30} يوم)'),
                              Text('يوم السداد: ${c.terms['payment_day'] ?? '—'}'),
                              if ((c.terms['utilities_responsibility'] ?? '').toString().isNotEmpty) Text('المرافق: ${c.terms['utilities_responsibility']}'),
                              if ((c.terms['termination_terms'] ?? '').toString().isNotEmpty) Text('الإنهاء: ${c.terms['termination_terms']}'),
                              const SizedBox(height: 12),
                              Wrap(
                                spacing: 8,
                                runSpacing: 8,
                                children: [
                                  if (c.canConfirm)
                                    FilledButton.icon(
                                      onPressed: () => _otpDialog('تأكيد النص النهائي', (code) => _api.confirmContract(c.id, code)),
                                      icon: const Icon(Icons.lock, size: 16),
                                      label: const Text('تأكيد برمز تحقق'),
                                    ),
                                  if (c.canEdit)
                                    OutlinedButton(
                                      onPressed: () => _load(),
                                      child: const Text('تعديل المسودة'),
                                    ),
                                  if (c.pdfReady)
                                    OutlinedButton.icon(
                                      onPressed: _downloadPdf,
                                      icon: const Icon(Icons.picture_as_pdf, size: 16),
                                      label: const Text('تحميل PDF'),
                                    ),
                                ],
                              ),
                              if (c.confirmationsLog.isNotEmpty) ...[
                                const SizedBox(height: 10),
                                const Text('سجل التأكيد', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                ...c.confirmationsLog.map((e) {
                                  final m = e as Map<String, dynamic>;
                                  return Text('• ${m['party']} · ${m['at']?.toString().substring(0, 19) ?? ''} · ${m['ip'] ?? ''} · OTP ✓',
                                      style: const TextStyle(fontSize: 11, color: Colors.grey));
                                }),
                              ],
                            ],
                          ),
                        ),
                      ),
                      if (c.feeRequired && c.feeOrderStatus != 'paid')
                        Card(
                          child: ListTile(
                            title: Text('رسوم العقد: ${c.feeAmount} EGP'),
                            trailing: FilledButton(onPressed: _payFee, child: const Text('ادفع')),
                          ),
                        ),
                      const SizedBox(height: 8),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          const Text('محاضر التسليم', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                          if (c.status == 'confirmed')
                            FilledButton.tonal(
                              onPressed: () async {
                                await Navigator.of(context).push(MaterialPageRoute(
                                    builder: (_) => HandoverScreen(contractId: c.id, kind: 'check_in')));
                                await _load();
                              },
                              child: const Text('+ تسليم دخول'),
                            ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      ..._handovers.map((h) => Card(
                            child: ListTile(
                              title: Text('${h.kind == 'check_in' ? 'تسليم دخول' : 'تسليم خروج'} · ${h.data['occurred_at'] ?? ''}'),
                              subtitle: Text(h.status == 'confirmed' ? 'مؤكد ✓ ${(h.hash ?? '').substring(0, 12)}…' : 'مسودة'),
                              trailing: h.status == 'confirmed'
                                  ? IconButton(
                                      icon: const Icon(Icons.picture_as_pdf),
                                      onPressed: () async {
                                        try {
                                          final b64 = await _api.handoverPdf(h.id);
                                          final bytes = base64Decode(b64);
                                          final dir = await getTemporaryDirectory();
                                          final f = File('${dir.path}/handover-${h.kind}.pdf');
                                          await f.writeAsBytes(bytes, flush: true);
                                          await Share.shareXFiles([XFile(f.path)]);
                                        } catch (e) {
                                          if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
                                        }
                                      },
                                    )
                                  : const Icon(Icons.chevron_left),
                              onTap: () async {
                                await Navigator.of(context).push(MaterialPageRoute(
                                    builder: (_) => HandoverScreen(contractId: c.id, kind: h.kind, existing: h)));
                                await _load();
                              },
                            ),
                          )),
                    ],
                  ),
                ),
    );
  }
}
