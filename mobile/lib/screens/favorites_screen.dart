import 'package:flutter/material.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../widgets/listing_card.dart';
import 'listing_detail_screen.dart';

class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});
  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  final api = ApiClient();
  List<SearchItem> _items = [];
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
      final res = await api.get('/favorites?limit=50') as Map<String, dynamic>;
      final items = ((res['items'] as List?) ?? []).whereType<Map<String, dynamic>>().map(SearchItem.fromJson).toList();
      if (mounted) setState(() { _items = items; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) return Center(child: Text('$_error'));
    if (_items.isEmpty) {
      return const Center(child: Padding(padding: EdgeInsets.all(24), child: Text('لم تضف أي إعلان للمفضلة بعد')));
    }
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView.separated(
        padding: const EdgeInsets.all(12),
        itemCount: _items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (context, i) {
          final item = _items[i];
          return ListingCard(
            item: item,
            badge: item.availableFrom == null ? 'متاح الآن' : null,
            onTap: () => Navigator.push(
              context,
              MaterialPageRoute(builder: (_) => ListingDetailScreen(listingId: item.id)),
            ),
          );
        },
      ),
    );
  }
}
