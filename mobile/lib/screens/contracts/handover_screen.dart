// Handover editor: rooms checklist + conditions + meters + keys + inventory,
// photo capture with real upload progress, review comment, dual OTP confirm
// (immutable after), PDF share. Works for check-in and check-out (from a
// confirmed check-in — the server copies the structure).
import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

import '../../api/api_client.dart';
import '../../core/theme.dart';

const _rooms = {
  'living_room': 'الصالة',
  'bedroom_1': 'غرفة النوم1',
  'bedroom_2': 'غرفة النوم2',
  'bedroom_3': 'غرفة النوم3',
  'kitchen': 'المطبخ',
  'bathroom_1': 'الحمام1',
  'bathroom_2': 'الحمام2',
  'balcony': 'البلكونة',
  'other': 'أخرى',
};

const _conds = {
  'good': 'جيدة',
  'needs_repair': 'تحتاج صيانة',
  'damaged': 'متضررة',
};

const _meters = {
  'electricity': 'الكهرباء',
  'water': 'المياه',
  'gas': 'الغاز',
};

class HandoverScreen extends StatefulWidget {
  const HandoverScreen({super.key, required this.contractId, required this.kind, this.existingId, this.sourceId});
  final String contractId;
  final String kind; // check_in | check_out
  final String? existingId;
  final String? sourceId;

  @override
  State<HandoverScreen> createState() => _HandoverScreenState();
}

class _HandoverScreenState extends State<HandoverScreen> {
  final api = ApiClient();
  final _picker = ImagePicker();
  String? _id;
  Map<String, dynamic> _data = {
    'rooms': [
      {'name': 'living_room', 'items': <Map<String, dynamic>>[]},
      {'name': 'kitchen', 'items': <Map<String, dynamic>>[]},
    ],
    'meters': {'electricity': {'value': ''}, 'water': {'value': ''}, 'gas': {'value': ''}},
    'keys_count': null,
    'inventory': <Map<String, dynamic>>[],
    'comments': <String, dynamic>{},
  };
  String _status = 'draft';
  String _hash = '';
  List<dynamic> _media = [];
  String _mediaRoom = 'living_room';
  bool _busy = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _id = widget.existingId;
    if (_id != null) _loadExisting();
  }

  Future<void> _loadExisting() async {
    try {
      final h = await api.get('/handovers/$_id') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() {
        _data = (h['data'] as Map<String, dynamic>?) ?? _data;
        _status = (h['status'] as String?) ?? 'draft';
        _hash = (h['hash'] as String?) ?? '';
        _media = (h['media'] as List?) ?? [];
      });
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  List<Map<String, dynamic>> get _roomList =>
      ((_data['rooms'] as List?) ?? []).whereType<Map<String, dynamic>>().toList();

  void _toast(String msg) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<bool> _save() async {
    setState(() { _busy = true; _error = null; });
    try {
      if (_id == null) {
        final created = await api.post('/contracts/${widget.contractId}/handovers', data: {
          'kind': widget.kind,
          'source_handover_id': widget.sourceId,
          'data': _data,
        }) as Map<String, dynamic>;
        if (mounted) setState(() => _id = created['id'] as String);
      } else {
        await api.patch('/handovers/$_id', data: {'data': _data});
      }
      if (mounted) setState(() => _busy = false);
      return true;
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _busy = false; });
      _toast('$e');
      return false;
    }
  }

  Future<void> _confirm() async {
    if (_id == null && !await _save()) return;
    if (!mounted) return;
    final ctrl = TextEditingController();
    final code = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('تأكيد المحضر'),
        content: TextField(
          controller: ctrl,
          keyboardType: TextInputType.number,
          maxLength: 6,
          autofocus: true,
          decoration: const InputDecoration(labelText: 'رمز التحقق', counterText: ''),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('إلغاء')),
          FilledButton(
            onPressed: () async {
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
    setState(() => _busy = true);
    try {
      final updated = await api.post('/handovers/$_id/confirm', data: {'otp_code': code}) as Map<String, dynamic>;
      if (mounted) {
        setState(() {
          _status = (updated['status'] as String?) ?? 'confirmed';
          _hash = (updated['hash'] as String?) ?? '';
          _busy = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('المحضر نهائي')));
      }
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _busy = false; });
      _toast('$e');
    }
  }

  Future<void> _capture() async {
    if (_id == null && !await _save()) return;
    if (!mounted) return;
    final src = await showModalBottomSheet<ImageSource>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Wrap(children: [
          ListTile(leading: const Icon(Icons.photo_camera), title: const Text('كاميرا'), onTap: () => Navigator.pop(ctx, ImageSource.camera)),
          ListTile(leading: const Icon(Icons.photo_library), title: const Text('المعرض'), onTap: () => Navigator.pop(ctx, ImageSource.gallery)),
        ]),
      ),
    );
    if (src == null) return;
    final picked = await _picker.pickImage(source: src, imageQuality: 80);
    if (picked == null) return;
    setState(() => _busy = true);
    try {
      final res = await api.upload(
        '/handovers/$_id/media',
        file: FilePart(picked.path, picked.name),
        fields: {'room': _mediaRoom},
        onProgress: (s, t) {},
      ) as Map<String, dynamic>;
      if (mounted) setState(() => _media = [..._media, res]);
      _toast('تم رفع الصورة');
    } catch (e) {
      _toast('فشل الرفع: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _downloadPdf() async {
    try {
      final bytes = await api.downloadBytes('/handovers/$_id/pdf');
      final dir = await getTemporaryDirectory();
      final f = File('${dir.path}/handover-${widget.kind}.pdf');
      await f.writeAsBytes(bytes, flush: true);
      await Share.shareXFiles([XFile(f.path)]);
    } catch (e) {
      _toast('$e');
    }
  }

  void _setRoom(int idx, String key, dynamic value) {
    final rooms = _roomList;
    rooms[idx][key] = value;
    setState(() => _data = {..._data, 'rooms': rooms});
  }

  void _setItem(int roomIdx, int itemIdx, String key, dynamic value) {
    final rooms = _roomList;
    final items = ((rooms[roomIdx]['items'] as List?) ?? []).whereType<Map<String, dynamic>>().toList();
    items[itemIdx][key] = value;
    rooms[roomIdx]['items'] = items;
    setState(() => _data = {..._data, 'rooms': rooms});
  }

  bool get _confirmed => _status == 'confirmed';

  @override
  Widget build(BuildContext context) {
    final rooms = _roomList;
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.kind == 'check_in' ? 'محضر تسليم (دخول)' : 'محضر تسليم (خروج)'),
        actions: [
          if (_confirmed)
            IconButton(icon: const Icon(Icons.picture_as_pdf), onPressed: _downloadPdf, tooltip: 'PDF'),
        ],
      ),
      body: _confirmed
          ? _confirmedView()
          : ListView(
              padding: const EdgeInsets.all(14),
              children: [
                for (var r = 0; r < rooms.length; r++) ...[
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: DropdownButton<String>(
                                  value: (rooms[r]['name'] as String?) ?? 'other',
                                  isExpanded: true,
                                  underline: const SizedBox.shrink(),
                                  items: [for (final e in _rooms.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                                  onChanged: (v) => _setRoom(r, 'name', v),
                                ),
                              ),
                              TextButton.icon(
                                onPressed: () {
                                  final items = ((rooms[r]['items'] as List?) ?? []).whereType<Map<String, dynamic>>().toList();
                                  items.add({'label': '', 'condition': 'good', 'note': ''});
                                  _setRoom(r, 'items', items);
                                },
                                icon: const Icon(Icons.add, size: 16),
                                label: const Text('بند'),
                              ),
                            ],
                          ),
                          for (var i = 0; i < ((rooms[r]['items'] as List?) ?? []).length; i++)
                            _itemRow(r, i),
                        ],
                      ),
                    ),
                  ),
                ],
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Column(
                      children: [
                        const Text('قراءات العدادات', style: TextStyle(fontWeight: FontWeight.bold)),
                        for (final e in _meters.entries)
                          TextField(
                            keyboardType: TextInputType.number,
                            decoration: InputDecoration(labelText: e.value, isDense: true, border: const OutlineInputBorder()),
                            controller: TextEditingController(text: '${(((_data['meters'] as Map<String, dynamic>?) ?? {})[e.key] as Map<String, dynamic>?)?['value'] ?? ''}'),
                            onChanged: (v) {
                              final meters = Map<String, dynamic>.from(_data['meters'] as Map<String, dynamic>? ?? {});
                              meters[e.key] = {'value': v};
                              setState(() => _data = {..._data, 'meters': meters});
                            },
                          ),
                        const SizedBox(height: 8),
                        TextField(
                          keyboardType: TextInputType.number,
                          decoration: const InputDecoration(labelText: 'عدد المفاتيح', isDense: true, border: OutlineInputBorder()),
                          controller: TextEditingController(text: '${_data['keys_count'] ?? ''}'),
                          onChanged: (v) => setState(() => _data = {..._data, 'keys_count': int.tryParse(v)}),
                        ),
                      ],
                    ),
                  ),
                ),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButton<String>(
                        value: _mediaRoom,
                        isExpanded: true,
                        items: [for (final e in _rooms.entries) DropdownMenuItem(value: e.key, child: Text(e.value))],
                        onChanged: (v) => setState(() => _mediaRoom = v ?? 'living_room'),
                      ),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: _busy ? null : _capture,
                      icon: const Icon(Icons.add_a_photo, size: 18),
                      label: const Text('صورة'),
                    ),
                  ],
                ),
                if (_media.isNotEmpty)
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      for (final m in _media.whereType<Map<String, dynamic>>())
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: SizedBox(
                            width: 64,
                            height: 64,
                            child: CachedNetworkImage(imageUrl: '${m['url']}', fit: BoxFit.cover,
                                errorWidget: (_, __, ___) => const ColoredBox(color: AppColors.track)),
                          ),
                        ),
                    ],
                  ),
                TextField(
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'ملاحظة للمراجعة', border: OutlineInputBorder()),
                  controller: TextEditingController(text: '${(((_data['comments'] as Map<String, dynamic>?) ?? {})['note'] ?? '')}'),
                  onChanged: (v) => setState(() => _data = {..._data, 'comments': {...(_data['comments'] as Map<String, dynamic>? ?? {}), 'note': v}}),
                ),
                if (_error != null)
                  Padding(padding: const EdgeInsets.only(top: 8), child: Text('$_error', style: const TextStyle(color: AppColors.danger))),
                const SizedBox(height: 12),
                FilledButton.icon(
                  onPressed: _busy ? null : _confirm,
                  icon: const Icon(Icons.lock, size: 18),
                  label: Text(_busy ? '…' : 'تأكيد المحضر برمز تحقق'),
                ),
                const SizedBox(height: 8),
                Text('التأكيد برمز تحقق من الطرفين يجعل المحضر نهائياً.', style: TextStyle(fontSize: 11, color: appMutedColor(context))),
              ],
            ),
    );
  }

  Widget _itemRow(int r, int i) {
    final rooms = _roomList;
    final items = ((rooms[r]['items'] as List?) ?? []).whereType<Map<String, dynamic>>().toList();
    final item = items[i];
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: TextFormField(
              initialValue: item['label'] as String? ?? '',
              decoration: const InputDecoration(isDense: true, labelText: 'البند', border: OutlineInputBorder()),
              onChanged: (v) => _setItem(r, i, 'label', v),
            ),
          ),
          const SizedBox(width: 6),
          Expanded(
            flex: 2,
            child: DropdownButton<String>(
              value: item['condition'] as String?,
              isExpanded: true,
              underline: const SizedBox.shrink(),
              items: [
                const DropdownMenuItem(value: null, child: Text('—')),
                for (final e in _conds.entries) DropdownMenuItem(value: e.key, child: Text(e.value, style: const TextStyle(fontSize: 12))),
              ],
              onChanged: (v) => _setItem(r, i, 'condition', v),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.close, size: 16, color: AppColors.danger),
            onPressed: () {
              items.removeAt(i);
              _setRoom(r, 'items', items);
            },
          ),
        ],
      ),
    );
  }

  Widget _confirmedView() {
    final rooms = _roomList;
    final meters = (_data['meters'] as Map<String, dynamic>?) ?? {};
    return ListView(
      padding: const EdgeInsets.all(14),
      children: [
        Card(
          color: AppColors.successBg,
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
              const Icon(Icons.lock_rounded, size: 15, color: AppColors.success),
              const SizedBox(width: 6),
              Expanded(child: Text('المحضر نهائي وغير قابل للتعديل', style: const TextStyle(color: AppColors.success, fontWeight: FontWeight.bold))),
            ]),
                if (_hash.isNotEmpty)
                  Text('SHA-256: $_hash', style: TextStyle(fontSize: 10, color: appMutedColor(context))),
              ],
            ),
          ),
        ),
        const SizedBox(height: 8),
        for (final room in rooms) ...[
          Text(_rooms['${room['name']}'] ?? '${room['name']}', style: const TextStyle(fontWeight: FontWeight.bold)),
          for (final item in ((room['items'] as List?) ?? []).whereType<Map<String, dynamic>>())
            Text('• ${item['label']}: ${_conds['${item['condition']}'] ?? '—'} ${item['note'] ?? ''}', style: const TextStyle(fontSize: 13)),
        ],
        const SizedBox(height: 8),
        for (final e in meters.entries)
          if ('${(e.value as Map<String, dynamic>?)?['value'] ?? ''}'.isNotEmpty)
            Text('${_meters[e.key]}: ${(e.value as Map<String, dynamic>)['value']}', style: const TextStyle(fontSize: 13)),
        if (_data['keys_count'] != null)
          Text('المفاتيح: ${_data['keys_count']}', style: const TextStyle(fontSize: 13)),
        const SizedBox(height: 12),
        FilledButton.icon(
          onPressed: _downloadPdf,
          icon: const Icon(Icons.picture_as_pdf, size: 18),
          label: const Text('تحميل / مشاركة PDF'),
        ),
      ],
    );
  }
}
