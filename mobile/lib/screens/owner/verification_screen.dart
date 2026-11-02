// Ownership-proof upload (BR-6): doc type + image/PDF ≤8MB → status list.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api/api_client.dart';
import '../models/models.dart';

class VerificationScreen extends StatefulWidget {
  const VerificationScreen({super.key});
  @override
  State<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends State<VerificationScreen> {
  final api = ApiClient();
  final _picker = ImagePicker();
  List<Verification> _items = [];
  String _docType = 'electricity_bill';
  bool _uploading = false;
  String? _error;

  static const _docs = {
    'electricity_bill': 'فاتورة كهرباء',
    'water_bill': 'فاتورة مياه',
    'ownership_contract': 'عقد ملكية',
    'id_authorization': 'توكيل بالهوية',
  };

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await api.get('/me/verification') as Map<String, dynamic>;
      final items = ((res['items'] as List?) ?? []).whereType<Map<String, dynamic>>().map(Verification.fromJson).toList();
      if (mounted) setState(() => _items = items);
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _upload() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(children: [
          ListTile(leading: const Icon(Icons.photo_camera), title: const Text('الكاميرا'), onTap: () => Navigator.pop(ctx, ImageSource.camera)),
          ListTile(leading: const Icon(Icons.photo_library), title: const Text('المعرض'), onTap: () => Navigator.pop(ctx, ImageSource.gallery)),
        ]),
      ),
    );
    if (source == null) return;
    final picked = await _picker.pickImage(source: source, imageQuality: 85);
    if (picked == null) return;
    setState(() { _uploading = true; _error = null; });
    try {
      await api.upload(
        '/me/verification',
        file: FilePart(picked.path, picked.name),
        fields: {'doc_type': _docType},
      );
      await _load();
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم رفع المستند ✓')));
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  String _statusAr(String s) => switch (s) {
        'pending' => 'قيد المراجعة',
        'approved' => 'موثّق',
        'rejected' => 'مرفوض',
        _ => s,
      };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('توثيق الملكية')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Card(
            child: Padding(
              padding: EdgeInsets.all(12),
              child: Text('ارفع مستند يثبت ملكيتك (فاتورة/عقد/توكيل) — يرفع ثقة المستأجرين ويُلزم قبل اعتماد أول إعلان.'),
            ),
          ),
          const SizedBox(height: 12),
          DropdownButtonFormField<String>(
            value: _docType,
            decoration: const InputDecoration(labelText: 'نوع المستند', border: OutlineInputBorder()),
            items: [for (final e in _docs.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
            onChanged: (v) => setState(() => _docType = v ?? _docType),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _uploading ? null : _upload,
            icon: _uploading ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.upload),
            label: Text(_uploading ? 'جارٍ الرفع…' : 'اختيار ورفع مستند'),
          ),
          if (_error != null)
            Padding(padding: const EdgeInsets.only(top: 8), child: Text('$_error', style: const TextStyle(color: Colors.red))),
          const SizedBox(height: 16),
          Text('السجل', style: Theme.of(context).textTheme.titleMedium),
          for (final v in _items)
            Card(
              child: ListTile(
                leading: Icon(v.status == 'approved' ? Icons.verified : v.status == 'rejected' ? Icons.cancel : Icons.hourglass_top),
                title: Text(_docs[v.docType] ?? v.docType),
                subtitle: Text(v.rejectReason != null ? 'مرفوض: ${v.rejectReason}' : _statusAr(v.status)),
                trailing: v.fileUrl != null ? const Icon(Icons.visibility_outlined) : null,
                onTap: v.fileUrl == null
                    ? null
                    : () => showDialog<void>(
                          context: context,
                          builder: (_) => Dialog(child: InteractiveViewer(child: Image.network(v.fileUrl!, errorBuilder: (_, __, ___) => const Padding(padding: EdgeInsets.all(24), child: Text('تعذّر عرض الملف'))))),
                        ),
              ),
            ),
        ],
      ),
    );
  }
}
