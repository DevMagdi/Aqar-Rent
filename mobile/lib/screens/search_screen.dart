// Search: query bar, filter sheet (spec parity with web), results list,
// and a map tab sharing the same filter state.
import 'package:flutter/material.dart';

import '../core/widgets.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import 'listing_detail_screen.dart';
import 'map_screen.dart';
import '../widgets/listing_card.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});
  @override
  SearchScreenState createState() => SearchScreenState();
}

class SearchScreenState extends State<SearchScreen> {
  final api = ApiClient();
  final _q = TextEditingController();
  final Map<String, dynamic> _filters = {}; // backend query params
  List<SearchItem> _items = [];
  String? _cursor;
  bool _loading = false;
  bool _mapMode = false;
  String? _error;
  bool _searchAfterCurrent = false;

  void applyQuickFilter(String type) {
    setState(() {
      _filters['property_type'] = type;
      _cursor = null;
    });
    _search(reset: true);
  }

  @override
  void initState() {
    super.initState();
    _search(reset: true);
  }

  String get _query {
    final p = <String, String>{'limit': '20'};
    if (_q.text.trim().isNotEmpty) p['q'] = _q.text.trim();
    _filters.forEach((k, v) {
      if (v != null && '$v'.isNotEmpty) p[k] = '$v';
    });
    if (_cursor != null) p['cursor'] = _cursor!;
    return Uri(queryParameters: p).query;
  }

  Future<void> _search({bool reset = false}) async {
    if (_loading) {
      if (reset) _searchAfterCurrent = true;
      return;
    }
    setState(() { _loading = true; if (reset) _error = null; });
    try {
      final res = await api.get('/listings?$_query') as Map<String, dynamic>;
      final items = ((res['items'] as List?) ?? []).whereType<Map<String, dynamic>>().map(SearchItem.fromJson).toList();
      if (!mounted) return;
      setState(() {
        _items = reset ? items : [..._items, ...items];
        _cursor = res['next_cursor'] as String?;
        _loading = false;
      });
      if (_searchAfterCurrent) {
        _searchAfterCurrent = false;
        await _search(reset: true);
      }
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _loading = false; });
      if (mounted && _searchAfterCurrent) {
        _searchAfterCurrent = false;
        await _search(reset: true);
      }
    }
  }

  Future<void> _openFilters() async {
    final result = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      builder: (_) => FilterSheet(initial: Map<String, dynamic>.from(_filters)),
    );
    if (result != null) {
      setState(() => _filters
        ..clear()
        ..addAll(result));
      await _search(reset: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _q,
                  textInputAction: TextInputAction.search,
                  onSubmitted: (_) => _search(reset: true),
                  decoration: InputDecoration(
                    hintText: 'ابحث عن منطقة أو وصف…',
                    prefixIcon: const Icon(Icons.search),
                    isDense: true,
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(14)),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filledTonal(
                onPressed: _openFilters,
                icon: Badge(
                  isLabelVisible: _filters.values.where((v) => v != null && '$v'.isNotEmpty).isNotEmpty,
                  child: const Icon(Icons.tune),
                ),
                tooltip: 'الفلاتر',
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          child: Row(
            children: [
              SegmentedButton<bool>(
                segments: const [
                  ButtonSegment(value: false, label: Text('قائمة'), icon: Icon(Icons.list)),
                  ButtonSegment(value: true, label: Text('خريطة'), icon: Icon(Icons.map_outlined)),
                ],
                selected: {_mapMode},
                onSelectionChanged: (s) => setState(() => _mapMode = s.first),
              ),
              const Spacer(),
              if (_items.isNotEmpty)
                Text('${_items.length}${_cursor != null ? '+' : ''} نتيجة',
                    style: Theme.of(context).textTheme.bodySmall),
            ],
          ),
        ),
        Expanded(
          child: _error != null
              ? ErrorView(message: _error!, onRetry: _search)
              : _mapMode
                  ? MapScreen(items: _items)
                  : _items.isEmpty && _loading
                      ? const CardSkeleton()
                      : _items.isEmpty
                          ? const EmptyView(title: 'لا توجد نتائج مطابقة')
                          : ListView.separated(
                              padding: const EdgeInsets.all(12),
                              itemCount: _items.length + (_cursor != null ? 1 : 0),
                              separatorBuilder: (_, __) => const SizedBox(height: 10),
                              itemBuilder: (context, i) {
                                if (i == _items.length) {
                                  return TextButton(
                                    onPressed: _loading ? null : () => _search(),
                                    child: Text(_loading ? '…' : 'المزيد'),
                                  );
                                }
                                final item = _items[i];
                                return ListingCard(
                                  staggerIndex: i,
                                  item: item,
                                  onTap: () => Navigator.push(
                                    context,
                                    AqarPageRoute(disableAnimations: MediaQuery.of(context).disableAnimations, builder: (_) => ListingDetailScreen(listingId: item.id)),
                                  ),
                                );
                              },
                            ),
        ),
      ],
    );
  }
}

class FilterSheet extends StatefulWidget {
  const FilterSheet({super.key, required this.initial});
  final Map<String, dynamic> initial;

  @override
  State<FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends State<FilterSheet> {
  late Map<String, dynamic> f;

  @override
  void initState() {
    super.initState();
    f = Map<String, dynamic>.from(widget.initial);
  }

  Widget _num(String key, String label) {
    return TextField(
      keyboardType: TextInputType.number,
      decoration: InputDecoration(labelText: label, isDense: true, border: const OutlineInputBorder()),
      controller: TextEditingController(text: f[key]?.toString() ?? ''),
      onChanged: (v) => f[key] = v,
    );
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom, left: 16, right: 16, top: 16),
      child: Wrap(
        runSpacing: 12,
        children: [
          Row(
            children: [
              Text('الفلاتر', style: Theme.of(context).textTheme.titleMedium),
              const Spacer(),
              TextButton(onPressed: () => Navigator.pop(context, {}), child: const Text('مسح')),
            ],
          ),
          Row(children: [Expanded(child: _num('min_price', 'الحد الأدنى')), const SizedBox(width: 8), Expanded(child: _num('max_price', 'الحد الأقصى'))]),
          Row(children: [Expanded(child: _num('bedrooms', 'غرف النوم')), const SizedBox(width: 8), Expanded(child: _num('bathrooms', 'دورات المياه'))]),
          DropdownButtonFormField<String>(
            initialValue: f['property_type'] as String?,
            decoration: const InputDecoration(labelText: 'نوع العقار', isDense: true, border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: null, child: Text('—')),
              DropdownMenuItem(value: 'apartment', child: Text('شقة')),
              DropdownMenuItem(value: 'studio', child: Text('استوديو')),
              DropdownMenuItem(value: 'villa', child: Text('فيلا')),
              DropdownMenuItem(value: 'room', child: Text('غرفة')),
              DropdownMenuItem(value: 'shop', child: Text('محل')),
              DropdownMenuItem(value: 'office', child: Text('مكتب')),
              DropdownMenuItem(value: 'clinic', child: Text('عيادة')),
            ],
            onChanged: (v) => f['property_type'] = v,
          ),
          DropdownButtonFormField<String>(
            initialValue: f['furnished'] as String?,
            decoration: const InputDecoration(labelText: 'التأثيث', isDense: true, border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: null, child: Text('—')),
              DropdownMenuItem(value: 'furnished', child: Text('مفروش')),
              DropdownMenuItem(value: 'unfurnished', child: Text('غير مفروش')),
              DropdownMenuItem(value: 'semi', child: Text('شبه مفروش')),
            ],
            onChanged: (v) => f['furnished'] = v,
          ),
          DropdownButtonFormField<String>(
            initialValue: f['sort'] as String? ?? 'newest',
            decoration: const InputDecoration(labelText: 'الترتيب', isDense: true, border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: 'newest', child: Text('الأحدث')),
              DropdownMenuItem(value: 'price_asc', child: Text('السعر: من الأقل')),
              DropdownMenuItem(value: 'price_desc', child: Text('السعر: من الأعلى')),
              DropdownMenuItem(value: 'area', child: Text('المساحة')),
            ],
            onChanged: (v) => f['sort'] = v,
          ),
          SizedBox(
            width: double.infinity,
            child: FilledButton(
              onPressed: () => Navigator.pop(context, f),
              child: const Text('تطبيق'),
            ),
          ),
        ],
      ),
    );
  }
}
