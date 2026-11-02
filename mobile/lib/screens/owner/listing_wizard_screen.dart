// Add/Edit listing wizard: basics → specs → location → photos (real uploads
// with progress) → description → review & submit. Same rules as web (BR-5/6/7,
// content rules,3–15 photos ≤1.5MB server-side re-encode).
import 'dart:io';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'dart:convert';

import 'package:image_picker/image_picker.dart';
import 'package:maplibre_gl/maplibre_gl.dart';

import '../../api/api_client.dart';
import 'dashboard_screen.dart';

class ListingWizardScreen extends StatefulWidget {
  const ListingWizardScreen({super.key, this.editId});
  final String? editId;

  @override
  State<ListingWizardScreen> createState() => _ListingWizardScreenState();
}

class _ListingWizardScreenState extends State<ListingWizardScreen> {
  final api = ApiClient();
  final _picker = ImagePicker();
  int _step = 0;
  String? _listingId;
  bool _loading = true;
  bool _busy = false;
  String? _error;

  // form
  final _title = TextEditingController();
  final _rent = TextEditingController();
  final _deposit = TextEditingController(text: '1');
  final _area = TextEditingController();
  final _bedrooms = TextEditingController(text: '2');
  final _bathrooms = TextEditingController(text: '1');
  final _floor = TextEditingController();
  final _address = TextEditingController();
  final _lat = TextEditingController(text: '30.0444');
  final _lng = TextEditingController(text: '31.2357');
  final _desc = TextEditingController();
  final _minTerm = TextEditingController(text: '1');
  String _propertyType = 'apartment';
  String _furnished = 'unfurnished';
  bool _elevator = false;

  // photos: local files pending upload (reorderable), then uploaded ids
  final List<XFile> _pending = [];
  final List<Map<String, dynamic>> _uploaded = [];
  final List<double> _progress = [];
  String? _govId;
  String? _cityId;
  List<Map<String, dynamic>> _govs = [];
  List<Map<String, dynamic>> _cities = [];

  @override
  void initState() {
    super.initState();
    _boot();
  }

  Future<void> _boot() async {
    try {
      final govs = await api.get('/locations?level=governorate') as List;
      if (mounted) setState(() => _govs = govs.whereType<Map<String, dynamic>>().toList());
      if (widget.editId != null) {
        final d = await api.get('/listings/${widget.editId}') as Map<String, dynamic>;
        if (!mounted) return;
        setState(() {
          _listingId = widget.editId;
          _title.text = (d['title'] ?? '') as String;
          _rent.text = '${d['rent_monthly']}';
          _deposit.text = '${d['deposit_months']}';
          _area.text = '${d['area_m2']}';
          _bedrooms.text = '${d['bedrooms']}';
          _bathrooms.text = '${d['bathrooms']}';
          _floor.text = d['floor']?.toString() ?? '';
          _address.text = (d['address_text'] ?? '') as String;
          _lat.text = '${(d['geo'] as Map<String, dynamic>)['latitude']}';
          _lng.text = '${(d['geo'] as Map<String, dynamic>)['longitude']}';
          _desc.text = (d['description'] ?? '') as String;
          _minTerm.text = '${d['min_term_minutes'] ?? d['min_term_months'] ?? 1}';
          _propertyType = (d['property_type'] ?? 'apartment') as String;
          _furnished = (d['furnished'] ?? 'unfurnished') as String;
          _elevator = (d['has_elevator'] ?? false) as bool;
          _govId = d['governorate_id'] as String?;
          _cityId = d['city_id'] as String?;
          _loading = false;
        });
        await _loadCities();
        final media = ((d['media'] as List?) ?? []).whereType<Map<String, dynamic>>();
        if (mounted) {
          setState(() {
            for (final m in media) {
              _uploaded.add({'id': m['id'], 'thumb_url': m['thumb_url'] ?? m['url'], 'url': m['url']});
            }
          });
        }
      } else {
        if (mounted) setState(() => _loading = false);
      }
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _loading = false; });
    }
  }

  Future<void> _loadCities() async {
    if (_govId == null) return;
    try {
      final cities = await api.get('/locations?parent_id=$_govId') as List;
      if (mounted) setState(() => _cities = cities.whereType<Map<String, dynamic>>().toList());
    } catch (_) {}
  }

  String _name(Map<String, dynamic> l, String locale) =>
      (locale == 'ar' ? l['name_ar'] : l['name_en']) as String;

  bool _validate(int step) {
    switch (step) {
      case 0:
        return _title.text.trim().length >= 3 && (int.tryParse(_rent.text) ?? 0) >= 100;
      case 1:
        return (double.tryParse(_area.text) ?? 0) > 0;
      case 2:
        return _govId != null &&
            _cityId != null &&
            _address.text.trim().length >= 3 &&
            (double.tryParse(_lat.text) ?? 0) >= 21.5 &&
            (double.tryParse(_lat.text) ?? 0) <= 32.0 &&
            (double.tryParse(_lng.text) ?? 0) >= 24.0 &&
            (double.tryParse(_lng.text) ?? 0) <= 37.5;
      case 3:
        return (_uploaded.length + _pending.length) >= 3;
      case 4:
        return _desc.text.trim().length >= 10;
      default:
        return true;
    }
  }

  void _toast(String msg) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<bool> _ensureId() async {
    if (_listingId != null) return true;
    final payload = _payload();
    try {
      final created = await api.post('/listings', data: payload) as Map<String, dynamic>;
      if (mounted) setState(() => _listingId = created['id'] as String);
      return true;
    } catch (e) {
      _toast('$e');
      return false;
    }
  }

  Map<String, dynamic> _payload() => {
        'title': _title.text.trim(),
        'property_type': _propertyType,
        'rental_type': 'residential',
        'furnished': _furnished,
        'rent_monthly': int.parse(_rent.text),
        'deposit_months': int.tryParse(_deposit.text) ?? 1,
        'area_m2': double.parse(_area.text),
        'bedrooms': int.tryParse(_bedrooms.text) ?? 0,
        'bathrooms': int.tryParse(_bathrooms.text) ?? 0,
        'floor': int.tryParse(_floor.text),
        'has_elevator': _elevator,
        'amenities': <String, bool>{},
        'description': _desc.text.trim(),
        'governorate_id': _govId,
        'city_id': _cityId,
        'address_text': _address.text.trim(),
        'latitude': double.parse(_lat.text),
        'longitude': double.parse(_lng.text),
        'min_term_months': int.tryParse(_minTerm.text) ?? 1,
      };

  Future<bool> _saveDraft() async {
    if (_listingId == null) return _ensureId();
    try {
      await api.patch('/listings/$_listingId', data: _payload());
      return true;
    } catch (e) {
      _toast('$e');
      return false;
    }
  }

  Future<void> _addPhotos() async {
    final picked = await _picker.pickMultiImage(imageQuality: 85);
    if (picked.isEmpty) return;
    final room = maxPhotos - (_uploaded.length + _pending.length);
    setState(() => _pending.addAll(picked.take(room < 0 ? 0 : room)));
    // upload everything now (progress per file)
    await _uploadPending();
  }

  static const maxPhotos = 15;

  Future<void> _uploadPending() async {
    if (_pending.isEmpty) return;
    if (!await _ensureId()) return;
    setState(() => _busy = true);
    while (_pending.isNotEmpty) {
      final file = _pending.first;
      final idx = 0;
      setState(() { _progress.add(0); });
      try {
        final res = await api.upload(
          '/listings/$_listingId/media',
          file: FilePart(file.path, file.name),
          fields: {'media_type': 'photo'},
          onProgress: (sent, total) {
            if (mounted && idx < _progress.length) {
              setState(() => _progress[idx] = total > 0 ? sent / total : 0);
            }
          },
        ) as Map<String, dynamic>;
        setState(() {
          _pending.removeAt(0);
          if (_progress.isNotEmpty) _progress.removeAt(0);
          _uploaded.add({'id': res['id'], 'thumb_url': res['thumb_url'] ?? res['url'], 'url': res['url']});
        });
      } catch (e) {
        _toast('فشل رفع ${file.name}: $e');
        setState(() { if (_progress.isNotEmpty) _progress.removeAt(0); });
        break;
      }
    }
    if (mounted) setState(() => _busy = false);
  }

  Future<void> _submit() async {
    if (!await _saveDraft()) return;
    setState(() => _busy = true);
    try {
      await api.post('/listings/$_listingId/submit', data: {});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('تم الإرسال للمراجعة ✓')));
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const OwnerDashboardScreen()));
      }
    } catch (e) {
      _toast('$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    if (_error != null) {
      return Scaffold(
        appBar: AppBar(title: const Text('تعذّر تحميل البيانات')),
        body: Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(_error!, textAlign: TextAlign.center),
                const SizedBox(height: 16),
                FilledButton(
                  onPressed: () {
                    setState(() { _error = null; _loading = true; });
                    _boot();
                  },
                  child: const Text('إعادة المحاولة'),
                ),
              ],
            ),
          ),
        ),
      );
    }
    return Scaffold(
      appBar: AppBar(title: Text(widget.editId == null ? 'إعلان جديد' : 'تعديل الإعلان')),
      body: Stepper(
        currentStep: _step,
        onStepTapped: (i) => setState(() => _step = i),
        onStepContinue: () {
          if (!_validate(_step)) {
            _toast('أكمل الحقول المطلوبة');
            return;
          }
          setState(() => _step = (_step + 1).clamp(0, 5));
        },
        onStepCancel: () => setState(() => _step = (_step - 1).clamp(0, 5)),
        steps: [
          Step(title: const Text('الأساسيات'), isActive: _step >= 0, content: _basics()),
          Step(title: const Text('المواصفات'), isActive: _step >= 1, content: _specs()),
          Step(title: const Text('الموقع'), isActive: _step >= 2, content: _location()),
          Step(title: const Text('الصور'), isActive: _step >= 3, content: _photos()),
          Step(title: const Text('الوصف'), isActive: _step >= 4, content: _description()),
          Step(
            title: const Text('المراجعة'),
            isActive: _step >= 5,
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('${_title.text}\n${_rent.text} جنيه/شهر · ${_area.text} م² · ${_bedrooms.text} غرف'),
                Text(_address.text),
                Text('الصور: ${_uploaded.length + _pending.length}'),
                const SizedBox(height: 8),
                FilledButton(
                  onPressed: _busy ? null : _submit,
                  child: Text(_busy ? '…' : 'إرسال للمراجعة'),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _field(TextEditingController c, String label, {TextInputType? type, int? maxLines}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: TextField(
        controller: c,
        keyboardType: type,
        maxLines: maxLines ?? 1,
        decoration: InputDecoration(labelText: label, isDense: true, border: const OutlineInputBorder()),
      ),
    );
  }

  Widget _basics() => Column(
        children: [
          _field(_title, 'عنوان الإعلان *'),
          _field(_rent, 'الإيجار الشهري *', type: TextInputType.number),
          _field(_deposit, 'التأمين (أشهر)', type: TextInputType.number),
          DropdownButtonFormField<String>(
            initialValue: _propertyType,
            decoration: const InputDecoration(labelText: 'نوع العقار', border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: 'apartment', child: Text('شقة')),
              DropdownMenuItem(value: 'studio', child: Text('استوديو')),
              DropdownMenuItem(value: 'villa', child: Text('فيلا')),
              DropdownMenuItem(value: 'room', child: Text('غرفة')),
              DropdownMenuItem(value: 'shop', child: Text('محل')),
              DropdownMenuItem(value: 'office', child: Text('مكتب')),
              DropdownMenuItem(value: 'clinic', child: Text('عيادة')),
            ],
            onChanged: (v) => setState(() => _propertyType = v ?? 'apartment'),
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _furnished,
            decoration: const InputDecoration(labelText: 'التأثيث', border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: 'furnished', child: Text('مفروش')),
              DropdownMenuItem(value: 'unfurnished', child: Text('غير مفروش')),
              DropdownMenuItem(value: 'semi', child: Text('شبه مفروش')),
            ],
            onChanged: (v) => setState(() => _furnished = v ?? 'unfurnished'),
          ),
        ],
      );

  Widget _specs() => Column(
        children: [
          _field(_area, 'المساحة (م²) *', type: TextInputType.number),
          Row(
            children: [
              Expanded(child: _field(_bedrooms, 'غرف النوم', type: TextInputType.number)),
              const SizedBox(width: 8),
              Expanded(child: _field(_bathrooms, 'دورات المياه', type: TextInputType.number)),
            ],
          ),
          Row(
            children: [
              Expanded(child: _field(_floor, 'الطابق', type: TextInputType.number)),
              const SizedBox(width: 8),
              Expanded(child: _field(_minTerm, 'أقل مدة (أشهر)', type: TextInputType.number)),
            ],
          ),
          CheckboxListTile(
            value: _elevator,
            onChanged: (v) => setState(() => _elevator = v ?? false),
            title: const Text('مصعد'),
            contentPadding: EdgeInsets.zero,
          ),
        ],
      );

  Widget _location() => Column(
        children: [
          DropdownButtonFormField<String>(
            initialValue: _govId,
            decoration: const InputDecoration(labelText: 'المحافظة *', border: OutlineInputBorder()),
            items: [
              const DropdownMenuItem(value: null, child: Text('—')),
              for (final g in _govs) DropdownMenuItem(value: g['id'] as String, child: Text(_name(g, 'ar'))),
            ],
            onChanged: (v) async {
              setState(() { _govId = v; _cityId = null; _cities = []; });
              await _loadCities();
            },
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            initialValue: _cityId,
            decoration: const InputDecoration(labelText: 'المدينة *', border: OutlineInputBorder()),
            items: [
              const DropdownMenuItem(value: null, child: Text('—')),
              for (final c in _cities) DropdownMenuItem(value: c['id'] as String, child: Text(_name(c, 'ar'))),
            ],
            onChanged: (v) => setState(() => _cityId = v),
          ),
          const SizedBox(height: 10),
          _field(_address, 'العنوان بالتفصيل *'),
          Row(
            children: [
              Expanded(child: _field(_lat, 'خط العرض', type: TextInputType.number)),
              const SizedBox(width: 8),
              Expanded(child: _field(_lng, 'خط الطول', type: TextInputType.number)),
            ],
          ),
          const Text('اضغط على الخريطة بالأسفل أو أدخل الإحداثيات يدوياً (حدود مصر).', style: TextStyle(fontSize: 12, color: Colors.black54)),
          const SizedBox(height: 8),
          SizedBox(height: 180, child: _MiniMap(key: const ValueKey('listing-mini-map'), lat: double.tryParse(_lat.text) ?? 30.0444, lng: double.tryParse(_lng.text) ?? 31.2357, onPick: (la, ln) => setState(() { _lat.text = la.toStringAsFixed(6); _lng.text = ln.toStringAsFixed(6); }))),
        ],
      );

  Widget _photos() => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('الصور (${_uploaded.length + _pending.length}/15) —3 على الأقل', style: Theme.of(context).textTheme.labelLarge),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final m in _uploaded)
                Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(10),
                      child: SizedBox(
                        width: 72,
                        height: 72,
                        child: CachedNetworkImage(imageUrl: m['thumb_url'] ?? m['url'], fit: BoxFit.cover,
                            errorWidget: (_, __, ___) => const ColoredBox(color: Color(0xFFF5F5F4))),
                      ),
                    ),
                    Positioned(
                      top: 0,
                      right: 0,
                      child: GestureDetector(
                        onTap: () async {
                          try {
                            await api.delete('/listings/$_listingId/media/${m['id']}');
                            if (mounted) setState(() => _uploaded.remove(m));
                          } catch (e) {
                            _toast('$e');
                          }
                        },
                        child: const CircleAvatar(radius: 10, backgroundColor: Colors.red, child: Icon(Icons.close, size: 12, color: Colors.white)),
                      ),
                    ),
                  ],
                ),
              for (final f in _pending)
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: SizedBox(width: 72, height: 72, child: Image.file(File(f.path), fit: BoxFit.cover)),
                ),
              if (_progress.isNotEmpty)
                SizedBox(
                  width: 72,
                  height: 72,
                  child: Center(child: CircularProgressIndicator(value: _progress.isEmpty ? null : _progress.first)),
                ),
            ],
          ),
          const SizedBox(height: 10),
          FilledButton.tonalIcon(
            onPressed: _busy ? null : _addPhotos,
            icon: const Icon(Icons.add_a_photo),
            label: const Text('اختر صور'),
          ),
        ],
      );

  Widget _description() => _field(_desc, 'الوصف *', maxLines: 6);
}

class _MiniMap extends StatefulWidget {
  const _MiniMap({super.key, required this.lat, required this.lng, required this.onPick});
  final double lat;
  final double lng;
  final void Function(double, double) onPick;

  @override
  State<_MiniMap> createState() => _MiniMapState();
}

class _MiniMapState extends State<_MiniMap> {
  static const _style = {
    'version': 8,
    'sources': {
      'base': {
        'type': 'raster',
        'tiles': [String.fromEnvironment('MAP_TILES_URL', defaultValue: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png')],
        'tileSize': 256,
      },
    },
    'layers': [
      {'id': 'base', 'type': 'raster', 'source': 'base'},
    ],
  };

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: MapLibreMap(
        styleString: jsonEncode(_style),
        initialCameraPosition: CameraPosition(target: LatLng(widget.lat, widget.lng), zoom: 13),
        onMapClick: (_, coordinates) {
          widget.onPick(coordinates.latitude, coordinates.longitude);
        },
      ),
    );
  }
}
