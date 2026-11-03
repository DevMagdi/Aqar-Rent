// Office/agency workspace: branded profile, team invites, CRM-lite pipeline,
// follow-ups and a performance dashboard. All data is live from the API.
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';

const _stages = ['new', 'contacted', 'viewing', 'offer', 'won', 'lost'];

class OfficeScreen extends StatefulWidget {
  const OfficeScreen({super.key});
  @override
  State<OfficeScreen> createState() => _OfficeScreenState();
}

class _OfficeScreenState extends State<OfficeScreen> {
  final api = ApiClient();
  Map<String, dynamic>? _office;
  Map<String, dynamic>? _dash;
  List<Map<String, dynamic>> _leads = [];
  List<Map<String, dynamic>> _members = [];
  bool _loading = true;
  String? _error;
  bool _notFound = false;
  bool _busy = false;

  final _officeForm = <String, String>{
    'name_ar': '',
    'name_en': '',
    'commercial_register': '',
    'city': '',
    'public_phone': '',
  };
  final _leadForm = <String, String>{'tenant_name': '', 'tenant_phone': '', 'budget_egp': '', 'note': ''};
  final _inviteForm = <String, String>{'invited_phone': '', 'display_name': '', 'role': 'agent'};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final office = await api.cachedGet('/offices/me') as Map<String, dynamic>;
      final id = office['id'] as String;
      final results = await Future.wait([
        api.cachedGet('/offices/$id/dashboard'),
        api.cachedGet('/offices/$id/leads'),
        api.cachedGet('/offices/$id/members'),
      ]);
      if (!mounted) return;
      setState(() {
        _office = office;
        _notFound = false;
        _dash = results[0] is Map ? results[0] as Map<String, dynamic> : null;
        _leads = results[1] is List
            ? (results[1] as List).whereType<Map<String, dynamic>>().toList()
            : [];
        _members = results[2] is List
            ? (results[2] as List).whereType<Map<String, dynamic>>().toList()
            : [];
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      final missing = '$e'.contains('OFFICE_NOT_FOUND') || '$e'.contains('404');
      setState(() {
        _notFound = missing;
        _error = missing ? null : '$e';
        _loading = false;
      });
    }
  }

  Future<void> _run(Future<dynamic> Function() action, String success) async {
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(success)));
      await _load();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(s('office_workspace'))),
      body: _loading
          ? const CardSkeleton()
          : _error != null
              ? ErrorView(message: _error!, onRetry: _load)
              : _notFound || _office == null
                  ? _createOffice()
                  : _workspace(),
    );
  }

  Widget _createOffice() => ListView(
        padding: const EdgeInsets.all(18),
        children: [
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(20),
              color: AppColors.ink,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(s('office_create'), style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                Text(s('office_tagline'), style: const TextStyle(color: Colors.white70, fontSize: 12, height: 1.6)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          for (final key in ['name_ar', 'name_en', 'commercial_register', 'city', 'public_phone']) ...[
            TextField(
              decoration: InputDecoration(labelText: _label(key)),
              onChanged: (v) => _officeForm[key] = v,
            ),
            const SizedBox(height: 10),
          ],
          FilledButton(
            onPressed: _busy
                ? null
                : () => _run(
                      () => api.post('/offices', data: _officeForm),
                      AppStrings.isArabic ? 'تم إنشاء المكتب ✓' : 'Office created ✓',
                    ),
            child: Text(s('office_save')),
          ),
          const SizedBox(height: 12),
          Text(s('commission_note'), style: const TextStyle(fontSize: 11, color: Colors.black54)),
        ],
      );

  String _label(String key) => switch (key) {
        'name_ar' => s('office_name_ar'),
        'name_en' => s('office_name_en'),
        'commercial_register' => s('office_cr'),
        'city' => s('office_city'),
        'public_phone' => s('office_phone'),
        _ => key,
      };

  Widget _workspace() {
    final id = _office!['id'] as String;
    final dash = _dash ?? const {};
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 40),
        children: [
          Card(
            child: ListTile(
              leading: const CircleAvatar(child: Icon(Icons.business)),
              title: Text((AppStrings.isArabic ? _office!['name_ar'] : _office!['name_en'] ?? _office!['name_ar'] ?? '') as String,
                  style: const TextStyle(fontWeight: FontWeight.w900)),
              subtitle: Text('${AppStrings.isArabic ? 'الحالة' : 'Status'}: ${_office!['verification_status']}'),
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 10,
            runSpacing: 10,
            children: [
              _stat(s('leads'), '${dash['leads_total'] ?? 0}'),
              _stat(s('conversion'), '${dash['conversion_pct'] ?? 0}%'),
              _stat(s('follow_ups'), '${dash['follow_ups_due'] ?? 0}'),
            ],
          ),
          const SizedBox(height: 16),
          _sectionTitle(s('team')),
          ..._members.map((m) => Card(
                margin: const EdgeInsets.only(bottom: 6),
                child: ListTile(
                  dense: true,
                  leading: const Icon(Icons.person_outline, size: 18),
                  title: Text((m['display_name'] ?? m['invited_phone'] ?? '-') as String, style: const TextStyle(fontSize: 12)),
                  subtitle: Text('${m['role']} · ${m['status']}', style: const TextStyle(fontSize: 10)),
                ),
              )),
          _inviteFormWidget(id),
          const SizedBox(height: 16),
          _sectionTitle(s('new_lead')),
          _leadFormWidget(id),
          const SizedBox(height: 16),
          _sectionTitle(s('leads')),
          if (_leads.isEmpty)
            const EmptyView(icon: Icons.people_outline)
          else
            ..._leads.map((l) => Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    title: Text(l['tenant_name'] as String? ?? '-', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                    subtitle: Text('${l['tenant_phone'] ?? ''} · ${l['budget_egp'] ?? '—'} ${s('egp')}',
                        style: const TextStyle(fontSize: 11)),
                    trailing: DropdownButton<String>(
                      value: _stages.contains(l['stage']) ? l['stage'] as String : 'new',
                      items: [for (final st in _stages) DropdownMenuItem(value: st, child: Text(st, style: const TextStyle(fontSize: 11)))],
                      onChanged: (v) => _run(
                        () => api.patch('/offices/$id/leads/${l['id']}', data: {'stage': v}),
                        AppStrings.isArabic ? 'تم تحديث المرحلة ✓' : 'Stage updated ✓',
                      ),
                    ),
                  ),
                )),
          const SizedBox(height: 12),
          Text(s('commission_note'), style: const TextStyle(fontSize: 10.5, color: Colors.black54)),
        ],
      ),
    );
  }

  Widget _inviteFormWidget(String id) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  decoration: InputDecoration(labelText: s('office_phone'), isDense: true),
                  keyboardType: TextInputType.phone,
                  onChanged: (v) => _inviteForm['invited_phone'] = v,
                ),
              ),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: _busy
                    ? null
                    : () => _run(
                          () => api.post('/offices/$id/members', data: _inviteForm),
                          AppStrings.isArabic ? 'تمت الدعوة ✓' : 'Invited ✓',
                        ),
                child: Text(s('add')),
              ),
            ],
          ),
        ),
      );

  Widget _leadFormWidget(String id) => Card(
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            children: [
              TextField(decoration: InputDecoration(labelText: s('tenant_name'), isDense: true), onChanged: (v) => _leadForm['tenant_name'] = v),
              const SizedBox(height: 8),
              TextField(decoration: InputDecoration(labelText: s('tenant_phone'), isDense: true), keyboardType: TextInputType.phone, onChanged: (v) => _leadForm['tenant_phone'] = v),
              const SizedBox(height: 8),
              TextField(decoration: InputDecoration(labelText: s('budget'), isDense: true), keyboardType: TextInputType.number, onChanged: (v) => _leadForm['budget_egp'] = v),
              const SizedBox(height: 8),
              TextField(decoration: InputDecoration(labelText: s('note'), isDense: true), onChanged: (v) => _leadForm['note'] = v),
              const SizedBox(height: 10),
              FilledButton(
                onPressed: _busy
                    ? null
                    : () {
                        final body = Map<String, dynamic>.from(_leadForm);
                        if (body['budget_egp'] == null || body['budget_egp'] == '') {
                          body.remove('budget_egp');
                        } else {
                          body['budget_egp'] = num.tryParse('${body['budget_egp']}');
                        }
                        _run(
                          () => api.post('/offices/$id/leads', data: body),
                          AppStrings.isArabic ? 'أُضيف العميل ✓' : 'Lead added ✓',
                        );
                      },
                child: Text(s('add')),
              ),
            ],
          ),
        ),
      );

  Widget _stat(String label, String value) => SizedBox(
        width: 108,
        child: Card(
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontSize: 10.5, color: Colors.black54)),
                const SizedBox(height: 4),
                Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: AppTheme.brand)),
              ],
            ),
          ),
        ),
      );

  Widget _sectionTitle(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Text(text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w900)),
      );
}
