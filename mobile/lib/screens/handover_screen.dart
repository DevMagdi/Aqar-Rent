// Handover (check-in / check-out) editor: rooms checklist, meters, keys,
// inventory, photo capture with upload, review comment, OTP confirmation.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../api.dart';
import '../models.dart';

class HandoverScreen extends StatefulWidget {
  const HandoverScreen({super.key, required this.contractId, required this.kind, this.existing});

  final String contractId;
  final String kind; // check_in | check_out
  final Handover? existing;

  @override
  State<HandoverScreen> createState() => _HandoverScreenState();
}

class _HandoverScreenState extends State<HandoverScreen> {
  final _api = ApiClient();
  late Handover? _existing = widget.existing;
  late List<HandoverRoom> _rooms;
  late Map<String, TextEditingController> _meters;
  final _keys = TextEditingController();
  final _comment = TextEditingController();
  DateTime? _occurred;
  bool _busy = false;
  String? _error;
  String _mediaRoom = 'living_room';
  int _uploadPct = 0;

  @override
  void initState() {
    super.initState();
    final data = widget.existing?.data ?? {};
    _occurred = DateTime.tryParse('${data['occurred_at'] ?? ''}');
    _keys.text = '${data['keys_count'] ?? ''}';
    _comment.text = ((data['comments'] as Map<String, dynamic>?)?.values.first ?? '').toString();
    _meters = {
      for (final m in meterLabelsAr.keys) m: TextEditingController(text: '${((data['meters'] as Map<String, dynamic>?)?[m] as Map<String, dynamic>?)?['value'] ?? ''}')
    };
    final srcRooms = (data['rooms'] as List? ?? []).whereType<Map<String, dynamic>>();
    _rooms = srcRooms.isEmpty
        ? [
            HandoverRoom(name: 'living_room', items: []),
            HandoverRoom(name: 'kitchen', items: []),
          ]
        : srcRooms
            .map((r) => HandoverRoom(
                  name: (r['name'] ?? 'other') as String,
                  items: ((r['items'] as List?) ?? [])
                      .whereType<Map<String, dynamic>>()
                      .map((i) => HandoverItem.fromJson(i))
                      .toList(),
                ))
            .toList();
  }

  Map<String, dynamic> _payload() => {
        'occurred_at': (_occurred ?? DateTime.now()).toIso8601String().substring(0, 10),
        'rooms': _rooms.map((r) => r.toJson()).toList(),
        'meters': {for (final m in _meters.keys) m: {'value': _meters[m]!.text}},
        'keys_count': int.tryParse(_keys.text),
        'inventory': ((widget.existing?.data['inventory'] as List?) ?? []).whereType<Map<String, dynamic>>().map((i) => HandoverItem.fromJson(i).toJson()).toList(),
        if (_comment.text.trim().isNotEmpty) 'comments': {'note': _comment.text.trim()},
      };

  Future<void> _save() async {
    setState(() { _busy = true; _error = null; });
    try {
      if (_existing == null) {
        final created = await _api.createHandover(widget.contractId, {
          'kind': widget.kind,
          'source_handover_id': widget.existing?.sourceHandoverId,
          'data': _payload(),
        });
        _existing = Handover.fromJson(created);
      } else {
        final updated = await _api.patchHandover(_existing!.id, {'data': _payload()});
        _existing = Handover.fromJson(updated);
      }
      if (mounted) setState(() => _busy = false);
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _busy = false; });
    }
  }

  Future<void> _confirm() async {
    if (_existing == null) await _save();
    if (_existing == null) return;
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
          FilledButton(onPressed: () => Navigator.pop(ctx, ctrl.text.trim()), child: const Text('تأكيد')),
        ],
      ),
    );
    if (code == null || code.length != 6) return;
    setState(() => _busy = true);
    try {
      final updated = await _api.confirmHandover(_existing!.id, code);
      setState(() { _existing = Handover.fromJson(updated); _busy = false; });
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('المحضر نهائي ✓')));
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _busy = false; });
    }
  }

  Future<void> _pickAndUpload() async {
    if (_existing == null) await _save();
    if (_existing == null) return;
    final picked = await ImagePicker().pickImage(source: ImageSource.camera, imageQuality: 85);
    if (picked == null) return;
    setState(() { _uploadPct = 10; _error = null; });
    try {
      await _api.uploadHandoverMedia(_existing!.id, file: await _toFile(picked), room: _mediaRoom);
      setState(() => _uploadPct = 100);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم رفع الصورة ✓')));
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _uploadPct = 0; });
    }
  }

  Future<File> _toFile(XFile x) async => File(x.path);

  bool get _confirmed => _existing?.status == 'confirmed';

  String _roomLabel(String name) => roomLabelsAr[name] ?? name.replaceAll('_', ' ');

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.kind == 'check_in' ? 'محضر تسليم (دخول)' : 'محضر تسليم (خروج)'),
      ),
      body: _confirmed
          ? ListView(
              padding: const EdgeInsets.all(12),
              children: [
                Card(
                  color: Colors.green.shade50,
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text('✓ المحضر نهائي وغير قابل للتعديل', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                        if (_existing!.hash != null) Text('SHA-256: ${_existing!.hash}', style: const TextStyle(fontSize: 10, color: Colors.grey)),
                      ],
                    ),
                  ),
                ),
                ..._buildSummary(),
              ],
            )
          : ListView(
              padding: const EdgeInsets.all(12),
              children: [
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(_occurred == null ? 'تاريخ التسليم' : 'التاريخ: ${_occurred!.toIso8601String().substring(0, 10)}'),
                  trailing: const Icon(Icons.calendar_today, size: 18),
                  onTap: () async {
                    final picked = await showDatePicker(
                        context: context, firstDate: DateTime(2020), lastDate: DateTime(2035));
                    if (picked != null) setState(() => _occurred = picked);
                  },
                ),
                ..._rooms.asMap().entries.map((entry) {
                  final ri = entry.key;
                  final room = entry.value;
                  return Card(
                    child: Padding(
                      padding: const EdgeInsets.all(10),
                      child: Column(
                        children: [
                          Row(
                            children: [
                              Expanded(
                                child: DropdownButton<String>(
                                  value: room.name,
                                  isExpanded: true,
                                  underline: const SizedBox.shrink(),
                                  items: roomNames
                                      .map((n) => DropdownMenuItem(value: n, child: Text(_roomLabel(n))))
                                      .toList(),
                                  onChanged: (v) => setState(() => _rooms[ri] = HandoverRoom(name: v ?? room.name, items: room.items)),
                                ),
                              ),
                              TextButton.icon(
                                onPressed: () => setState(() {
                                  final items = [...room.items, HandoverItem(label: '', condition: 'good')];
                                  _rooms[ri] = HandoverRoom(name: room.name, items: items);
                                }),
                                icon: const Icon(Icons.add, size: 16),
                                label: const Text('بند'),
                              ),
                            ],
                          ),
                          ...room.items.asMap().entries.map((it) {
                            final ii = it.key;
                            final item = it.value;
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 6),
                              child: Row(
                                children: [
                                  Expanded(
                                    flex: 3,
                                    child: TextFormField(
                                      initialValue: item.label,
                                      decoration: const InputDecoration(isDense: true, labelText: 'البند'),
                                      onChanged: (v) {
                                        final items = [...room.items];
                                        items[ii] = HandoverItem(label: v, condition: item.condition, note: item.note);
                                        _rooms[ri] = HandoverRoom(name: room.name, items: items);
                                      },
                                    ),
                                  ),
                                  const SizedBox(width: 6),
                                  Expanded(
                                    flex: 2,
                                    child: DropdownButton<String>(
                                      value: item.condition,
                                      isExpanded: true,
                                      underline: const SizedBox.shrink(),
                                      items: [
                                        const DropdownMenuItem(value: null, child: Text('—')),
                                        ...conditionLabelsAr.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value, style: const TextStyle(fontSize: 12)))),
                                      ],
                                      onChanged: (v) {
                                        final items = [...room.items];
                                        items[ii] = HandoverItem(label: item.label, condition: v, note: item.note);
                                        _rooms[ri] = HandoverRoom(name: room.name, items: items);
                                      },
                                    ),
                                  ),
                                  IconButton(
                                    icon: const Icon(Icons.close, size: 16, color: Colors.red),
                                    onPressed: () {
                                      final items = [...room.items]..removeAt(ii);
                                      _rooms[ri] = HandoverRoom(name: room.name, items: items);
                                    },
                                  ),
                                ],
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                  );
                }),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(10),
                    child: Column(
                      children: [
                        const Text('قراءات العدادات', style: TextStyle(fontWeight: FontWeight.bold)),
                        for (final m in _meters.keys)
                          TextField(
                            controller: _meters[m],
                            keyboardType: TextInputType.number,
                            decoration: InputDecoration(labelText: meterLabelsAr[m]),
                          ),
                        TextField(controller: _keys, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'عدد المفاتيح')),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Row(
                  children: [
                    Expanded(
                      child: DropdownButton<String>(
                        value: _mediaRoom,
                        isExpanded: true,
                        items: roomNames.map((n) => DropdownMenuItem(value: n, child: Text(_roomLabel(n)))).toList(),
                        onChanged: (v) => setState(() => _mediaRoom = v ?? 'living_room'),
                      ),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: _busy ? null : _pickAndUpload,
                      icon: const Icon(Icons.photo_camera, size: 18),
                      label: const Text('صورة'),
                    ),
                  ],
                ),
                if (_uploadPct > 0 && _uploadPct < 100) LinearProgressIndicator(value: _uploadPct / 100),
                TextField(
                  controller: _comment,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'ملاحظة للمراجعة'),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text('$_error', style: const TextStyle(color: Colors.red, fontSize: 13)),
                  ),
                const SizedBox(height: 16),
                FilledButton.icon(
                  onPressed: _busy ? null : _confirm,
                  icon: const Icon(Icons.lock, size: 16),
                  label: Text(_busy ? '…' : 'تأكيد المحضر برمز تحقق'),
                ),
                const SizedBox(height: 8),
                const Text('التأكيد برمز تحقق من الطرفين يجعل المحضر نهائياً.', style: TextStyle(fontSize: 11, color: Colors.grey)),
              ],
            ),
    );
  }

  List<Widget> _buildSummary() {
    return [
      const SizedBox(height: 8),
      for (final room in _rooms) ...[
        Text(_roomLabel(room.name), style: const TextStyle(fontWeight: FontWeight.bold)),
        ...room.items.map((i) => Text('• ${i.label}: ${conditionLabelsAr[i.condition] ?? '—'} ${i.note}', style: const TextStyle(fontSize: 13))),
      ],
      const SizedBox(height: 8),
      for (final m in _meters.keys)
        if (_meters[m]!.text.isNotEmpty) Text('${meterLabelsAr[m]}: ${_meters[m]!.text}', style: const TextStyle(fontSize: 13)),
      if (_keys.text.isNotEmpty) Text('المفاتيح: ${_keys.text}', style: const TextStyle(fontSize: 13)),
    ];
  }
}
