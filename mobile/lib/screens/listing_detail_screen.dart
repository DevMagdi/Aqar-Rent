// Listing detail: gallery, specs, amenities, verified badge, favorite/share,
// login-gated Call/WhatsApp (contact event logged server-side).
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../core/theme.dart';
import '../core/widgets.dart';

class ListingDetailScreen extends StatefulWidget {
  const ListingDetailScreen({super.key, required this.listingId});
  final String listingId;

  @override
  State<ListingDetailScreen> createState() => _ListingDetailScreenState();
}

class _ListingDetailScreenState extends State<ListingDetailScreen> {
  final api = ApiClient();
  ListingDetail? _d;
  String? _error;
  bool _fav = false;
  String? _phone; // revealed after login + contact event
  int _galleryIndex = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await api.get('/listings/${widget.listingId}') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() => _d = ListingDetail.fromJson(d));
      try {
        final favs = await api.get('/favorites?limit=100') as Map<String, dynamic>;
        final ids = ((favs['items'] as List?) ?? []).whereType<Map<String, dynamic>>().map((e) => e['id']);
        if (mounted) setState(() => _fav = ids.contains(widget.listingId));
      } catch (_) {}
    } catch (e) {
      if (mounted) setState(() => _error = '$e');
    }
  }

  Future<void> _toggleFav() async {
    if (!await ApiClient.hasSession()) {
      _toast('سجّل الدخول أولاً');
      return;
    }
    try {
      if (_fav) {
        await api.delete('/favorites/${widget.listingId}');
      } else {
        await api.post('/favorites/${widget.listingId}', data: {});
      }
      if (mounted) setState(() => _fav = !_fav);
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _contact(String channel) async {
    if (_phone != null) {
      await _open(channel);
      return;
    }
    if (!await ApiClient.hasSession()) {
      _toast('سجّل الدخول لعرض رقم المالك');
      return;
    }
    try {
      final res = await api.get('/listings/${widget.listingId}/contact?channel=$channel') as Map<String, dynamic>;
      if (!mounted) return;
      setState(() => _phone = res['phone'] as String?);
      await _open(channel);
    } catch (e) {
      _toast('$e');
    }
  }

  Future<void> _open(String channel) async {
    final phone = _phone;
    if (phone == null) return;
    final uri = channel == 'whatsapp'
        ? Uri.parse('https://wa.me/${phone.replaceFirst(RegExp(r'^0'), '20')}?text=${Uri.encodeComponent('مرحباً، بخصوص إعلانك على عقار رينت')}')
        : Uri(scheme: 'tel', path: phone);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _toast(String msg) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _share() async {
    final url = '${Uri.base.origin}/ar/rent/x/x/${widget.listingId}';
    await Clipboard.setData(ClipboardData(text: url));
    _toast('تم نسخ الرابط');
  }

  @override
  Widget build(BuildContext context) {
    if (_error != null) return Scaffold(appBar: AppBar(), body: Center(child: Text('$_error')));
    final d = _d;
    if (d == null) return const Scaffold(body: Center(child: CircularProgressIndicator()));
    final photos = d.media;
    return Scaffold(
      appBar: AppBar(title: Text(d.title, maxLines: 1, overflow: TextOverflow.ellipsis)),
      body: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          // gallery
          GestureDetector(
            onTap: photos.isEmpty
                ? null
                : () => showDialog<void>(
                      context: context,
                      builder: (_) => Dialog(
                        child: InteractiveViewer(
                          child: CachedNetworkImage(imageUrl: photos[_galleryIndex].url, fit: BoxFit.contain),
                        ),
                      ),
                    ),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(14),
              child: SizedBox(
                height: 240,
                child: photos.isEmpty
                    ? const ColoredBox(color: AppColors.track, child: Center(child: Icon(Icons.home, size: 48, color: AppColors.muted)))
                    : Stack(
                        fit: StackFit.expand,
                        children: [
                          Hero(
                            tag: "listing-${widget.listingId}",
                            child: CachedNetworkImage(
                              imageUrl: photos[_galleryIndex].thumbUrl ?? photos[_galleryIndex].url,
                              fit: BoxFit.cover,
                              memCacheWidth: 900,
                              placeholder: (_, __) => const ColoredBox(color: AppColors.track),
                              errorWidget: (_, __, ___) => const ColoredBox(color: AppColors.track),
                            ),
                          ),
                          if (photos.length > 1)
                            Positioned(
                              bottom: 8,
                              right: 8,
                              child: Row(
                                children: [
                                  IconButton.filled(
                                    onPressed: () => setState(() => _galleryIndex = (_galleryIndex - 1 + photos.length) % photos.length),
                                    icon: const Icon(Icons.chevron_left, size: 18),
                                    style: IconButton.styleFrom(backgroundColor: Colors.black54),
                                  ),
                                  IconButton.filled(
                                    onPressed: () => setState(() => _galleryIndex = (_galleryIndex + 1) % photos.length),
                                    icon: const Icon(Icons.chevron_right, size: 18),
                                    style: IconButton.styleFrom(backgroundColor: Colors.black54),
                                  ),
                                ],
                              ),
                            ),
                          Positioned(bottom: 8, left: 8, child: Text('${_galleryIndex + 1} / ${photos.length}', style: const TextStyle(color: Colors.white, shadows: [Shadow(blurRadius: 4, color: Colors.black)]))),
                        ],
                      ),
              ),
            ),
          ),
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  TrustBadge(level: d.trustLevel),
                  if (d.isFeatured)
                    Padding(
                      padding: const EdgeInsets.only(left: 8),
                      child: Row(mainAxisSize: MainAxisSize.min, children: const [
                        Icon(Icons.star_rounded, size: 14, color: AppColors.goldDark),
                        SizedBox(width: 3),
                        Text('إعلان مميز', style: TextStyle(color: AppColors.ink, fontSize: 12, fontWeight: FontWeight.w800)),
                      ]),
                    ),
                ]),
                if (d.trustLabelAr != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(d.trustLabelAr!, style: const TextStyle(fontSize: 12, color: AppColors.teal))),
                if (d.trustNoteAr != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(d.trustNoteAr!, style: const TextStyle(fontSize: 10.5, color: Colors.black54))),
                if (d.officeNameAr != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text('🏢 ${d.officeNameAr}', style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700))),
              ],
            ),
          ),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(d.title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
              ),
              Text('${d.rentMonthly} جنيه/شهر', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: AppColors.goldDark, fontSize: 24, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 6),
          Text(d.addressText, style: const TextStyle(color: Colors.black54)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              Chip(label: Text('${d.areaM2.toStringAsFixed(0)} م²')),
              Chip(label: Text('${d.bedrooms} غرف')),
              Chip(label: Text('${d.bathrooms} حمام')),
              Chip(label: Text(d.propertyType)),
              Chip(label: Text(d.furnished)),
              if (d.hasElevator) const Chip(label: Text('مصعد')),
              if (d.verifiedBadge)
                const Chip(
                  avatar: Icon(Icons.verified, size: 16, color: AppColors.success),
                  label: Text('مالك موثّق'),
                  backgroundColor: AppColors.successBg,
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (d.description.isNotEmpty) ...[
            Text('الوصف', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(d.description),
            const SizedBox(height: 12),
          ],
          Row(
            children: [
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _contact('call'),
                  icon: const Icon(Icons.call),
                  label: Text(_phone == null ? 'اتصال' : _phone!),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: FilledButton.icon(
                  onPressed: () => _contact('whatsapp'),
                  icon: const Icon(Icons.chat),
                  label: const Text('واتساب'),
                  style: FilledButton.styleFrom(backgroundColor: const AppColors.whatsapp),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _toggleFav,
                  icon: Icon(_fav ? Icons.favorite : Icons.favorite_border, color: _fav ? AppColors.danger : null),
                  label: Text(_fav ? 'في المفضلة' : 'أضف للمفضلة'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(child: OutlinedButton.icon(onPressed: _share, icon: const Icon(Icons.share), label: const Text('مشاركة'))),
            ],
          ),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}
