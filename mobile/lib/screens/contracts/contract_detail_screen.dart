// Contract detail: status, terms, OTP confirmation, PDF share, fee, handovers.
import 'dart:io';

import 'package:flutter/material.dart';

import '../../core/widgets.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../api/api_client.dart';
import 'handover_screen.dart';
import '../../core/theme.dart';

class ContractDetailScreen extends StatefulWidget {
  const ContractDetailScreen({super.key, required this.contractId});
  final String contractId;

  @override
  State<ContractDetailScreen> createState() => _ContractDetailScreenState();
}

class _ContractDetailScreenState extends State<ContractDetailScreen> {
  final api = ApiClient();
  Map<String, dynamic>? _c;
  List<dynamic> _handovers = [];
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final c = await api.get('/contracts/${widget.contractId}') as Map<String, dynamic>;
      final h = await api.get('/contracts/${widget.contractId}/handovers') as List;
      if (mounted) setState(() { _c = c; _handovers = h; });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
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

  Future<void> _confirmWithOtp() async {
    final ctrl = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تأكيد النص النهائي'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('سنرسل رمز تحقق إلى هاتفك', style: TextStyle(fontSize: 13)),
            const SizedBox(height: 10),
            TextField(
              controller: ctrl,
              keyboardType: TextInputType.number,
              maxLength: 6,
              autofocus: true,
              decoration: const InputDecoration(labelText: 'رمز التحقق', counterText: ''),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () async {
              // request a fresh code first
              try {
                final me = await ApiClient().get('/me') as Map<String, dynamic>;
                await ApiClient().post('/auth/otp/request', data: {'phone': me['phone']});
              } catch (_) {}
              if (ctx.mounted) Navigator.pop(ctx, ctrl.text.trim());
            },
            child: const Text('إرسال الرمز'),
          ),
        ],
      ),
    );
    if (code == null || code.length != 6) return;
    try {
      await api.post('/contracts/${widget.contractId}/confirm', data: {'otp_code': code});
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم التأكيد ✓')));
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _downloadPdf() async {
    try {
      final bytes = await api.downloadBytes('/contracts/${widget.contractId}/pdf');
      final dir = await getTemporaryDirectory();
      final ref = (_c?['reference_no'] ?? 'contract') as String;
      final file = File('${dir.path}/$ref.pdf');
      await file.writeAsBytes(bytes, flush: true);
      await Share.shareXFiles([XFile(file.path)], text: 'عقد $ref');
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  Future<void> _payFee() async {
    try {
      final order = await api.post('/contracts/${widget.contractId}/fee-order', data: {'method': 'card'}) as Map<String, dynamic>;
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('طلب الدفع جاهز: ${order['order_id']}')));
        await _load();
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) return Scaffold(appBar: AppBar(), body: Center(child: Text('$_error')));
    final c = _c;
    if (c == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final status = c['status'] as String;
    final terms = (c['terms'] as Map<String, dynamic>?) ?? {};
    final parties = ((c['parties'] as List?) ?? []).whereType<Map<String, dynamic>>();
    final feeRequired = (c['fee_required'] ?? false) as bool;
    final feeStatus = c['fee_order_status'] as String?;
    return Scaffold(
      appBar: AppBar(title: Text('${c['reference_no']}', textDirection: TextDirection.ltr)),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(14),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: Text('${c['listing_title'] ?? ''}', style: const TextStyle(fontWeight: FontWeight.bold))),
                        Chip(label: Text(_statusAr(status), style: const TextStyle(fontSize: 11))),
                      ],
                    ),
                    const SizedBox(height: 8),
                    for (final p in parties)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text(
                          '${p['role'] == 'owner' ? 'المالك' : 'المستأجر'}: ${p['full_name']} · ${p['national_id_masked']}',
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    if (status == 'confirmed') ...[
                      const SizedBox(height: 8),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(color: AppColors.successBg, borderRadius: BorderRadius.circular(10)),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text('✓ العقد مؤكد نهائياً وغير قابل للتعديل', style: TextStyle(color: AppColors.success, fontWeight: FontWeight.bold, fontSize: 13)),
                            if (c['terms_hash'] != null)
                              Text('SHA-256: ${c['terms_hash']}', style: TextStyle(fontSize: 10, color: appMutedColor(context))),
                          ],
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('العنوان: ${terms['unit_address'] ?? '—'}'),
                    Text('البداية: ${terms['start_date'] ?? '—'} · المدة: ${terms['duration_months'] ?? '—'} شهراً'),
                    Text('الإيجار: ${terms['monthly_rent'] ?? '—'} جنيه/شهر · الزيادة: ${terms['yearly_increase_pct'] ?? 0}%'),
                    Text('التأمين: ${terms['deposit_amount'] ?? '—'} (رد خلال ${terms['deposit_refund_days'] ?? 30} يوم)'),
                    Text('يوم السداد: ${terms['payment_day'] ?? '—'}'),
                    if ('${terms['utilities_responsibility'] ?? ''}'.isNotEmpty) Text('المرافق: ${terms['utilities_responsibility']}'),
                    if ('${terms['termination_terms'] ?? ''}'.isNotEmpty) Text('الإنهاء: ${terms['termination_terms']}'),
                    const SizedBox(height: 8),
                    Text('⚖️ اتفاق خاص بين الطرفين: ليس موثّقاً ولا مسجّلاً رسمياً ولا سنداً تنفيذياً، ولا يُغني عن التوثيق الرسمي.', style: TextStyle(fontSize: 11, color: Theme.of(context).brightness == Brightness.dark ? AppColors.darkWarn : AppColors.warn)),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                if (status == 'pending_confirmation' && (c['can_confirm'] ?? false) == true)
                  FilledButton.icon(
                    onPressed: _confirmWithOtp,
                    icon: const Icon(Icons.lock, size: 18),
                    label: const Text('تأكيد برمز تحقق'),
                  ),
                if (status == 'confirmed')
                  FilledButton.icon(
                    onPressed: _downloadPdf,
                    icon: const Icon(Icons.picture_as_pdf, size: 18),
                    label: const Text('تحميل PDF'),
                  ),
                if (feeRequired && feeStatus != 'paid')
                  OutlinedButton(onPressed: _payFee, child: Text('دفع رسوم العقد ${c['fee_amount']} جنيه')),
              ],
            ),
            if (status == 'confirmed') ...[
              const SizedBox(height: 16),
              Row(
                children: [
                  Text('محاضر التسليم', style: Theme.of(context).textTheme.titleMedium),
                  const Spacer(),
                  TextButton.icon(
                    onPressed: () async {
                      await Navigator.push(
                        context,
                        AqarPageRoute(disableAnimations: MediaQuery.of(context).disableAnimations, builder: (_) => HandoverScreen(contractId: widget.contractId, kind: 'check_in')),
                      );
                      if (mounted) _load();
                    },
                    icon: const Icon(Icons.add, size: 18),
                    label: const Text('+ تسليم دخول'),
                  ),
                ],
              ),
              for (final raw in _handovers)
                Builder(
                  builder: (ctx) {
                    final h = raw as Map<String, dynamic>;
                    final kind = h['kind'] as String;
                    final hStatus = h['status'] as String;
                    return Card(
                      child: ListTile(
                        title: Text(kind == 'check_in' ? 'تسليم دخول' : 'تسليم خروج'),
                        subtitle: Text(hStatus == 'confirmed' ? 'مؤكد ✓' : 'مسودة'),
                        trailing: hStatus == 'confirmed'
                            ? IconButton(
                                icon: const Icon(Icons.picture_as_pdf, size: 20),
                                onPressed: () async {
                                  try {
                                    final bytes = await api.downloadBytes('/handovers/${h['id']}/pdf');
                                    final dir = await getTemporaryDirectory();
                                    final f = File('${dir.path}/handover-$kind.pdf');
                                    await f.writeAsBytes(bytes, flush: true);
                                    await Share.shareXFiles([XFile(f.path)]);
                                  } catch (e) {
                                    if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(content: Text('$e')));
                                  }
                                },
                              )
                            : const Icon(Icons.chevron_left),
                        onTap: () async {
                          await Navigator.push(
                            context,
                            AqarPageRoute(disableAnimations: MediaQuery.of(context).disableAnimations,
                              builder: (_) => HandoverScreen(contractId: widget.contractId, kind: kind, existingId: h['id'] as String),
                            ),
                          );
                          if (mounted) _load();
                        },
                      ),
                    );
                  },
                ),
            ],
          ],
        ),
      ),
    );
  }
}
