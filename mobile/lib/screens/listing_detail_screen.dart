// Listing detail: gallery, specs, amenities, verified badge, favorite/share,
// login-gated Call/WhatsApp (contact event logged server-side).
import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';

import '../api/api_client.dart';
import '../models/models.dart';
import '../core/theme.dart';
import '../core/i18n.dart';
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

  String _formatNumber(num value) => NumberFormat.decimalPattern(AppStrings.isArabic ? 'ar_EG' : 'en_EG').format(value);

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
      _toast(s('login_required'));
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
      _toast(s('contact_phone_login'));
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
        ? Uri.parse('https://wa.me/${phone.replaceFirst(RegExp(r'^0'), '20')}?text=${Uri.encodeComponent(s('contact_greeting'))}')
        : Uri(scheme: 'tel', path: phone);
    await launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  void _toast(String msg) {
    if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _share() async {
    final url = '${Uri.base.origin}/ar/rent/x/x/${widget.listingId}';
    await Clipboard.setData(ClipboardData(text: url));
    _toast(s('share_copied'));
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
        padding: const EdgeInsetsDirectional.fromSTEB(12, 12, 12, 104),
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
              borderRadius: BorderRadius.circular(20),
              child: SizedBox(
                height: 250,
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
                              end: 8,
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
                          PositionedDirectional(
                            start: 12,
                            top: 12,
                            child: DecoratedBox(
                              decoration: BoxDecoration(color: Colors.black.withValues(alpha: .62), borderRadius: BorderRadius.circular(999)),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                                child: Text('${_galleryIndex + 1} / ${photos.length}', style: const TextStyle(color: AppColors.goldLight, fontSize: 12, fontWeight: FontWeight.w700)),
                              ),
                            ),
                          ),
                          PositionedDirectional(
                            end: 12,
                            top: 12,
                            child: Material(
                              color: Colors.black.withValues(alpha: .62),
                              shape: const CircleBorder(),
                              child: IconButton(
                                tooltip: s(_fav ? 'favorite_remove' : 'favorite_add'),
                                onPressed: _toggleFav,
                                icon: Icon(_fav ? Icons.favorite : Icons.favorite_border, color: _fav ? AppColors.danger : AppColors.goldLight),
                                constraints: const BoxConstraints.tightFor(width: 44, height: 44),
                              ),
                            ),
                          ),
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
                      padding: const EdgeInsetsDirectional.only(start: 8),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.star_rounded, size: 14, color: AppColors.goldDark),
                        const SizedBox(width: 3),
                        Text(s('featured'), style: const TextStyle(color: AppColors.ink, fontSize: 12, fontWeight: FontWeight.w800)),
                      ]),
                    ),
                ]),
                if (d.trustLabelAr != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(d.trustLabelAr!, style: const TextStyle(fontSize: 12, color: AppColors.teal))),
                if (d.trustNoteAr != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(d.trustNoteAr!, style: TextStyle(fontSize: 11, color: Theme.of(context).colorScheme.onSurface.withValues(alpha: .68)))),
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
              Text('${_formatNumber(d.rentMonthly)} ${s('egp')} / ${s('per_month')}', style: Theme.of(context).textTheme.titleMedium?.copyWith(color: AppColors.goldDark, fontSize: 24, fontWeight: FontWeight.w800)),
            ],
          ),
          const SizedBox(height: 6),
          Text(d.addressText, style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: .68))),
          const SizedBox(height: 12),
          Card(
            child: ListTile(
              leading: const CircleAvatar(backgroundColor: AppColors.tealBg, child: Icon(Icons.person_outline, color: AppColors.tealInk)),
              title: Text(d.ownerName ?? (d.verifiedBadge ? s('verified_owner') : s('owner')), style: const TextStyle(fontWeight: FontWeight.w700)),
              subtitle: TrustBadge(level: d.trustLevel, compact: true),
              minLeadingWidth: 44,
            ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              Chip(label: Text('${_formatNumber(d.areaM2.round())} ${s('area_unit')}')),
              Chip(label: Text('${_formatNumber(d.bedrooms)} ${s('rooms_suffix')}')),
              Chip(label: Text('${_formatNumber(d.bathrooms)} ${s('bathrooms_suffix')}')),
              Chip(label: Text(d.propertyType)),
              Chip(label: Text(d.furnished)),
              if (d.hasElevator) Chip(label: Text(s('elevator'))),
              if (d.verifiedBadge)
                const Chip(
                  avatar: Icon(Icons.verified, size: 16, color: AppColors.success),
                  label: Text(s('verified_owner')),
                  backgroundColor: AppColors.successBg,
                ),
            ],
          ),
          const SizedBox(height: 12),
          if (d.description.isNotEmpty) ...[
            Text(s('description'), style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(d.description),
            const SizedBox(height: 12),
          ],
          Align(
            alignment: AlignmentDirectional.centerStart,
            child: TextButton.icon(onPressed: _share, icon: const Icon(Icons.share), label: Text(s('share'))),
          ),
          const SizedBox(height: 16),
        ],
      ),
      bottomNavigationBar: d == null
          ? null
          : SafeArea(
              top: false,
              child: Container(
                padding: const EdgeInsetsDirectional.fromSTEB(14, 10, 14, 10),
                decoration: BoxDecoration(color: Theme.of(context).colorScheme.surface, border: Border(top: BorderSide(color: Theme.of(context).dividerColor)), boxShadow: const [BoxShadow(color: Colors.black12, blurRadius: 16, offset: Offset(0, -4))]),
                child: Row(
                  children: [
                    Expanded(
                      flex: 5,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${_formatNumber(d.rentMonthly)} ${s('egp')}', style: const TextStyle(fontFamily: 'ElMessiriArabic', fontSize: 21, fontWeight: FontWeight.w700, height: 1.15)),
                          Text(s('per_month'), style: TextStyle(color: Theme.of(context).colorScheme.onSurface.withValues(alpha: .68), fontSize: 11)),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 4,
                      child: SizedBox(
                        height: 48,
                        child: FilledButton.icon(
                          onPressed: () => _contact('whatsapp'),
                          icon: const Icon(Icons.chat, size: 18),
                          label: Text(s('whatsapp')),
                          style: FilledButton.styleFrom(backgroundColor: AppColors.whatsapp, foregroundColor: AppColors.brandDeep, padding: const EdgeInsets.symmetric(horizontal: 8)),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      flex: 3,
                      child: SizedBox(
                        height: 48,
                        child: FilledButton.icon(
                          onPressed: () => _contact('call'),
                          icon: const Icon(Icons.call, size: 17),
                          label: Text(s('call')),
                          style: FilledButton.styleFrom(backgroundColor: AppColors.brandDeep, foregroundColor: AppColors.onDark, padding: const EdgeInsets.symmetric(horizontal: 6)),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
