// Cinematic listing card (shared: search + favorites).
// -16:10 image with bottom gradient + dominant price overlay
// - title → location → refined meta hierarchy
// - premium gradient badges, press scale, Hero for shared-element detail
import 'package:flutter/material.dart';

import '../core/theme.dart';
import '../core/widgets.dart';
import '../models/models.dart';

class ListingCard extends StatefulWidget {
  const ListingCard({super.key, required this.item, required this.onTap, this.badge});

  final SearchItem item;
  final VoidCallback onTap;
  /// Optional premium badge (e.g. "متاح الآن"); rendered as a gradient chip.
  final String? badge;

  @override
  State<ListingCard> createState() => _ListingCardState();
}

class _ListingCardState extends State<ListingCard> {
  bool _pressed = false;

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final dark = Theme.of(context).brightness == Brightness.dark;
    final radius = BorderRadius.circular(22); // spec: cards20–24
    final url = item.thumbUrl;

    return AnimatedScale(
      scale: _pressed ? 0.985 : 1.0,
      duration: const Duration(milliseconds: 150),
      curve: Curves.easeOut,
      child: GestureDetector(
        onTapDown: (_) => setState(() => _pressed = true),
        onTapCancel: () => setState(() => _pressed = false),
        onTapUp: (_) => setState(() => _pressed = false),
        onTap: widget.onTap,
        child: Container(
          decoration: BoxDecoration(
            color: dark ? AppColors.darkSurface : AppColors.surface,
            borderRadius: radius,
            border: Border.all(color: dark ? AppColors.darkBorder : AppColors.border),
            boxShadow: [
              BoxShadow(
                color: (dark ? Colors.black : AppColors.brand).withValues(alpha: dark ? 0.35 : 0.06),
                blurRadius: 24,
                offset: const Offset(0, 10),
                spreadRadius: -6,
              ),
              BoxShadow(
                color: (dark ? Colors.black : AppColors.brand).withValues(alpha: 0.05),
                blurRadius: 2,
                offset: const Offset(0, 1),
              ),
            ],
          ),
          clipBehavior: Clip.antiAlias,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── hero image16:10 + gradient + price ──
              AspectRatio(
                aspectRatio: 16 / 10,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    Hero(
                      tag: "listing-${item.id}",
                      child: url == null
                          ? Container(
                              color: dark ? AppColors.darkTrack : AppColors.track,
                              alignment: Alignment.center,
                              child: Icon(Icons.home_rounded, size: 44, color: dark ? AppColors.darkMuted : AppColors.muted),
                            )
                          : Image.network(
                              url,
                              fit: BoxFit.cover,
                              errorBuilder: (_, __, ___) => Container(
                                color: dark ? AppColors.darkTrack : AppColors.track,
                                alignment: Alignment.center,
                                child: Icon(Icons.home_rounded, size: 44, color: dark ? AppColors.darkMuted : AppColors.muted),
                              ),
                            ),
                    ),
                    // bottom gradient for price readability
                    const DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                          colors: [Colors.transparent, AppColors.overlayMid, AppColors.overlayScrim],
                          stops: [0.0, 0.55, 1.0],
                        ),
                      ),
                      child: SizedBox.expand(),
                    ),
                    PositionedDirectional(
                      start: 12,
                      bottom: 10,
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            "${item.rentMonthly}",
                            style: TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              color: Colors.white,
                              shadows: const [Shadow(blurRadius: 4, color: Colors.black54)],
                            ),
                          ),
                          Padding(
                            padding: const EdgeInsetsDirectional.only(bottom: 3, start: 4),
                            child: Text(
                              "EGP/شهر",
                              style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: Colors.white.withValues(alpha: 0.9),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (widget.badge != null)
                      PositionedDirectional(
                        end: 10,
                        top: 10,
                        child: _PremiumBadge(label: widget.badge!, gold: !dark),
                      ),
                  ],
                ),
              ),
              // ── content ──
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      item.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 15.5,
                        height: 1.35,
                        fontWeight: FontWeight.w700,
                        color: dark ? AppColors.darkInk : AppColors.ink,
                      ),
                    ),
                    const SizedBox(height: 5),
                    // Phase5 trust / featured / office row
                    if (item.trustLevel != null || item.isFeatured || (item.officeNameAr?.isNotEmpty ?? false))
                      Padding(
                        padding: const EdgeInsets.only(bottom: 5),
                        child: Row(
                          children: [
                            if (item.trustLevel != null) TrustBadge(level: item.trustLevel!, compact: true),
                            if (item.isFeatured) ...[
                              const SizedBox(width: 6),
                              const Icon(Icons.star_rounded, size: 15, color: AppColors.goldDark),
                            ],
                            if (item.officeNameAr != null && item.officeNameAr!.isNotEmpty) ...[
                              const SizedBox(width: 6),
                              Flexible(
                                child: Text(
                                  "🏢 ${item.officeNameAr}",
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(fontSize: 11, color: dark ? AppColors.darkMuted : AppColors.muted),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ),
                    Row(
                      children: [
                        Icon(Icons.location_on_outlined, size: 14, color: dark ? AppColors.darkMuted : AppColors.muted),
                        const SizedBox(width: 3),
                        Expanded(
                          child: Text(
                            item.addressText ?? "",
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 13, color: dark ? AppColors.darkMuted : AppColors.muted),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 9),
                    Container(height: 1, color: dark ? AppColors.darkTrack : AppColors.track),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 6,
                      runSpacing: 6,
                      children: [
                        _MetaPill(label: "${item.areaM2.toStringAsFixed(0)} م²", dark: dark),
                        _MetaPill(label: "🛏 ${item.bedrooms}", dark: dark),
                        _MetaPill(label: "🛁 ${item.bathrooms}", dark: dark),
                        _MetaPill(
                          label: item.furnished == "furnished" ? "مفروش" : item.furnished == "semi" ? "شبه مفروش" : "غير مفروش",
                          dark: dark,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MetaPill extends StatelessWidget {
  const _MetaPill({required this.label, required this.dark});
  final String label;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: dark ? AppColors.darkTrack : AppColors.track,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11.5,
          fontWeight: FontWeight.w600,
          color: dark ? AppColors.darkMuted : AppColors.muted,
        ),
      ),
    );
  }
}

/// Premium badge: gradient chip (never flat, never white-on-gold).
class _PremiumBadge extends StatelessWidget {
  const _PremiumBadge({required this.label, required this.gold});
  final String label;
  final bool gold;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: gold
              ? [AppColors.gold, AppColors.goldLight]
              : [AppColors.teal, AppColors.tealInk],
        ),
        borderRadius: BorderRadius.circular(999),
        boxShadow: const [
          BoxShadow(color: AppColors.shadowSoft, blurRadius: 6, offset: Offset(0, 2)),
        ],
      ),
      child: Text(
        gold ? "✦ $label" : "✓ $label",
        style: const TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w800,
          color: AppColors.brand, // deep navy on gold — never white
        ),
      ),
    );
  }
}
