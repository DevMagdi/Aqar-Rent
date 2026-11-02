// Contract wizard (4 steps): listing+template → parties+NIDs → terms → review.
// Mirrors the web wizard; saves draft then optionally sends for confirmation.
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import 'contract_detail_screen.dart';

class ContractWizardScreen extends StatefulWidget {
  const ContractWizardScreen({super.key});
  @override
  State<ContractWizardScreen> createState() => _ContractWizardScreenState();
}

class _ContractWizardScreenState extends State<ContractWizardScreen> {
  final api = ApiClient();
  int _step = 0;
  bool _busy = false;
  String? _error;

  String? _listingId;
  String _template = 'residential_unfurnished';
  List<Map<String, dynamic>> _listings = [];
  final _ownerName = TextEditingController();
  final _tenantName = TextEditingController();
  final _tenantPhone = TextEditingController();
  final _ownerNid = TextEditingController();
  final _tenantNid = TextEditingController();
  final _address = TextEditingController();
  final _rent = TextEditingController();
  final _increase = TextEditingController(text: '0');
  final _deposit = TextEditingController(text: '0');
  final _depositDays = TextEditingController(text: '30');
  final _paymentDay = TextEditingController(text: '1');
  final _duration = TextEditingController(text: '12');
  final _utilities = TextEditingController();
  final _termination = TextEditingController();
  final _notes = TextEditingController();
  DateTime? _start;

  static const _templates = {
    'residential_unfurnished': 'سكني — غير مفروش',
    'residential_furnished': 'سكني — مفروش',
    'commercial': 'تجاري',
  };

  @override
  void initState() {
    super.initState();
    _loadListings();
  }

  Future<void> _loadListings() async {
    try {
      final rows = await api.get('/me/listings') as List;
      final mine = rows
          .whereType<Map<String, dynamic>>()
          .where((r) => const ['approved', 'active', 'expired', 'rejected'].contains(r['status']))
          .toList();
      if (!mounted) return;
      setState(() {
        _listings = mine;
        if (mine.isNotEmpty && _listingId == null) {
          _listingId = mine.first['id'] as String;
          _address.text = (mine.first['address_text'] ?? '') as String;
          _rent.text = '${mine.first['rent_monthly'] ?? 0}';
        }
      });
      final me = await api.get('/me') as Map<String, dynamic>;
      if (mounted && (me['full_name'] ?? '').toString().isNotEmpty) {
        setState(() => _ownerName.text = me['full_name'] as String);
      }
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  bool _validate(int step) {
    switch (step) {
      case 0:
        return _listingId != null;
      case 1:
        return _ownerName.text.trim().length >= 3 &&
            _tenantName.text.trim().length >= 3 &&
            RegExp(r'^01[0125]\d{8}$').hasMatch(_tenantPhone.text.trim()) &&
            _ownerNid.text.length >= 6 &&
            _tenantNid.text.length >= 6;
      case 2:
        return _address.text.trim().isNotEmpty &&
            _start != null &&
            (int.tryParse(_duration.text) ?? 0) >= 1 &&
            (double.tryParse(_rent.text) ?? 0) > 0;
      default:
        return true;
    }
  }

  Map<String, dynamic> _terms() => {
        'party_names': {'owner': _ownerName.text.trim(), 'tenant': _tenantName.text.trim()},
        'unit_address': _address.text.trim(),
        'start_date': _start!.toIso8601String().substring(0, 10),
        'duration_months': int.parse(_duration.text),
        'monthly_rent': double.parse(_rent.text),
        'yearly_increase_pct': double.tryParse(_increase.text) ?? 0,
        'deposit_amount': double.tryParse(_deposit.text) ?? 0,
        'deposit_refund_days': int.tryParse(_depositDays.text) ?? 30,
        'payment_day': int.tryParse(_paymentDay.text) ?? 1,
        'utilities_responsibility': _utilities.text.trim(),
        'termination_terms': _termination.text.trim(),
        'extra_notes': _notes.text.trim(),
      };

  Future<void> _save({required bool requestConfirmation}) async {
    setState(() { _busy = true; _error = null; });
    try {
      var contract = await api.post('/contracts', data: {
        'listing_id': _listingId,
        'template': _template,
        'tenant_phone': _tenantPhone.text.trim(),
        'national_ids': {'owner': _ownerNid.text.trim(), 'tenant': _tenantNid.text.trim()},
        'terms': _terms(),
      }) as Map<String, dynamic>;
      if (requestConfirmation) {
        contract = await api.post('/contracts/${contract['id']}/request-confirmation', data: {}) as Map<String, dynamic>;
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(requestConfirmation ? 'تم إرسال العقد للتأكيد' : 'تم حفظ المسودة')),
      );
      Navigator.pushReplacement(
        context,
        MaterialPageRoute(builder: (_) => ContractDetailScreen(contractId: contract['id'] as String)),
      );
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _busy = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('إنشاء عقد')),
      body: Stepper(
        currentStep: _step,
        onStepTapped: (i) => setState(() => _step = i),
        onStepContinue: () {
          if (!_validate(_step)) {
            setState(() => _error = 'أكمل الحقول المطلوبة');
            return;
          }
          setState(() { _error = null; _step = (_step + 1).clamp(0, 3); });
        },
        onStepCancel: () => setState(() => _step = (_step - 1).clamp(0, 3)),
        steps: [
          Step(
            title: const Text('الإعلان والقالب'),
            isActive: _step >= 0,
            content: Column(
              children: [
                DropdownButtonFormField<String>(
                  value: _listingId,
                  decoration: const InputDecoration(labelText: 'اختر الإعلان *', border: OutlineInputBorder()),
                  items: [
                    for (final l in _listings)
                      DropdownMenuItem(value: l['id'] as String, child: Text('${l['title']}', overflow: TextOverflow.ellipsis)),
                  ],
                  onChanged: (v) => setState(() => _listingId = v),
                ),
                const SizedBox(height: 10),
                DropdownButtonFormField<String>(
                  value: _template,
                  decoration: const InputDecoration(labelText: 'قالب العقد *', border: OutlineInputBorder()),
                  items: [for (final e in _templates.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                  onChanged: (v) => setState(() => _template = v ?? _template),
                ),
                const SizedBox(height: 8),
                const Card(
                  color: Color(0xFFFFF7E6),
                  child: Padding(
                    padding: EdgeInsets.all(8),
                    child: Text('⚖️ مسودة — تحتاج مراجعة محامي قبل الاستخدام الإنتاجي.', style: TextStyle(fontSize: 12)),
                  ),
                ),
              ],
            ),
          ),
          Step(
            title: const Text('الأطراف'),
            isActive: _step >= 1,
            content: Column(
              children: [
                TextField(controller: _ownerName, decoration: const InputDecoration(labelText: 'اسم المالك *', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                TextField(controller: _tenantName, decoration: const InputDecoration(labelText: 'اسم المستأجر *', border: OutlineInputBorder())),
                const SizedBox(height: 10),
                TextField(
                  controller: _tenantPhone,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'هاتف المستأجر (دعوة) *', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _ownerNid,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'البطاقة الوطنية للمالك *', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _tenantNid,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'البطاقة الوطنية للمستأجر *', border: OutlineInputBorder()),
                ),
                const SizedBox(height: 8),
                const Text('تُخزَّن الأرقام الوطنية مشفَّرة ولا تظهر إلا للطرفين.', style: TextStyle(fontSize: 11, color: Colors.black54)),
              ],
            ),
          ),
          Step(
            title: const Text('الشروط'),
            isActive: _step >= 2,
            content: Column(
              children: [
                TextField(controller: _address, decoration: const InputDecoration(labelText: 'عنوان الوحدة *', border: OutlineInputBorder())),
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(_start == null ? 'تاريخ البداية *' : 'البداية: ${_start!.toIso8601String().substring(0, 10)}'),
                  trailing: const Icon(Icons.calendar_today, size: 18),
                  onTap: () async {
                    final now = DateTime.now();
                    final picked = await showDatePicker(
                      context: context,
                      firstDate: now,
                      lastDate: now.add(const Duration(days: 365 * 3)),
                    );
                    if (picked != null) setState(() => _start = picked);
                  },
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _duration,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'المدة (شهور) *', border: OutlineInputBorder()),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _rent,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'الإيجار الشهري *', border: OutlineInputBorder()),
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _increase,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'الزيادة السنوية %', border: OutlineInputBorder()),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _deposit,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'التأمين', border: OutlineInputBorder()),
                      ),
                    ),
                  ],
                ),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _depositDays,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'رد التأمين (يوم)', border: OutlineInputBorder()),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: TextField(
                        controller: _paymentDay,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(labelText: 'يوم السداد', border: OutlineInputBorder()),
                      ),
                    ),
                  ],
                ),
                TextField(controller: _utilities, maxLines: 2, decoration: const InputDecoration(labelText: 'مسؤولية المرافق', border: OutlineInputBorder())),
                TextField(controller: _termination, maxLines: 2, decoration: const InputDecoration(labelText: 'شروط الإنهاء', border: OutlineInputBorder())),
                TextField(controller: _notes, maxLines: 2, decoration: const InputDecoration(labelText: 'ملاحظات إضافية', border: OutlineInputBorder())),
              ],
            ),
          ),
          Step(
            title: const Text('المراجعة'),
            isActive: _step >= 3,
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('القالب: ${_templates[_template]}', style: const TextStyle(fontWeight: FontWeight.bold)),
                Text('الطرفان: ${_ownerName.text} — ${_tenantName.text}'),
                Text('العنوان: ${_address.text}'),
                Text('المدة: ${_duration.text} شهراً · الإيجار: ${_rent.text} جنيه'),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text('$_error', style: const TextStyle(color: Colors.red, fontSize: 13)),
                  ),
                const SizedBox(height: 8),
                const Text('بعد الحفظ يؤكد الطرفان برمز تحقق، وبعدها يصبح العقد نهائياً.', style: TextStyle(fontSize: 12, color: Colors.black54)),
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: _busy || _step < 3 ? null : () => _save(requestConfirmation: false),
                  child: const Text('حفظ مسودة'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton(
                  onPressed: _busy || _step < 3 ? null : () => _save(requestConfirmation: true),
                  child: const Text('إرسال للتأكيد'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
