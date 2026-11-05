// Shared UI kit: shimmer skeletons, empty/error states, async view, trust badges.
import 'dart:async';

import 'package:flutter/material.dart';

import 'i18n.dart';
import 'theme.dart';

/// Dynamic Type policy for the whole app.
///
/// Flutter scales text with the OS setting; at 200% the layout must reflow, not
/// clip. We clamp to the accessibility maximum (2.0×) and mark the app so that
/// text does not get *smaller* than the user asked for either.
extension AqarTextScale on BuildContext {
  static const double maxScale = 2.0;

  TextScaler get aqarTextScaler {
    final scale = MediaQuery.textScalerOf(this).clamp(minScaleFactor: 1.0, maxScaleFactor: maxScale);
    return scale;
  }
}

class AqarPageRoute<T> extends PageRouteBuilder<T> {
  AqarPageRoute({required WidgetBuilder builder, super.settings, bool disableAnimations = false}) : super(
    pageBuilder: (context, _, __) => builder(context),
    transitionDuration: disableAnimations ? Duration.zero : AppMotion.base,
    reverseTransitionDuration: disableAnimations ? Duration.zero : AppMotion.fast,
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      if (MediaQuery.of(context).disableAnimations) return child;
      final rtl = Directionality.of(context) == TextDirection.rtl;
      final offset = rtl ? const Offset(-0.035, 0) : const Offset(0.035, 0);
      final curved = CurvedAnimation(parent: animation, curve: AppMotion.easeOutCurve, reverseCurve: AppMotion.easeOutCurve);
      return FadeTransition(
        opacity: animation,
        child: SlideTransition(position: Tween<Offset>(begin: offset, end: Offset.zero).animate(curved), child: child),
      );
    },
  );
}

class MotionReveal extends StatefulWidget {
  const MotionReveal({super.key, required this.child, this.index = 0});
  final Widget child;
  final int index;

  @override
  State<MotionReveal> createState() => _MotionRevealState();
}

class _MotionRevealState extends State<MotionReveal> {
  bool _visible = false;
  bool _scheduled = false;
  Timer? _timer;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (MediaQuery.of(context).disableAnimations) {
      _timer?.cancel();
      if (!_visible) setState(() => _visible = true);
    } else if (!_scheduled) {
      _scheduled = true;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        final delay = Duration(milliseconds: widget.index.clamp(0, 5).toInt() * AppMotion.stagger.inMilliseconds);
        _timer = Timer(delay, () { if (mounted) setState(() => _visible = true); });
      });
    }
  }

  @override
  void dispose() { _timer?.cancel(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final reduce = MediaQuery.of(context).disableAnimations;
    final duration = reduce ? Duration.zero : AppMotion.base;
    return AnimatedOpacity(
      opacity: _visible ? 1 : 0,
      duration: duration,
      curve: AppMotion.easeOutCurve,
      child: AnimatedSlide(
        offset: _visible || reduce ? Offset.zero : const Offset(0, 0.04),
        duration: duration,
        curve: AppMotion.easeOutCurve,
        child: widget.child,
      ),
    );
  }
}

class ShimmerBox extends StatefulWidget {
  const ShimmerBox({super.key, this.width = double.infinity, this.height = 16, this.radius = 10});
  final double width;
  final double height;
  final double radius;
  @override
  State<ShimmerBox> createState() => _ShimmerBoxState();
}

class _ShimmerBoxState extends State<ShimmerBox> with SingleTickerProviderStateMixin {
  late final AnimationController _c;
  bool? _reduced;

  @override
  void initState() {
    super.initState();
    _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1100));
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final reduced = MediaQuery.of(context).disableAnimations;
    if (_reduced == reduced) return;
    _reduced = reduced;
    if (reduced) { _c.stop(); _c.value = 0; } else { _c.repeat(reverse: true); }
  }

  @override
  void dispose() { _c.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    if (_reduced ?? false) {
      return Container(width: widget.width, height: widget.height, decoration: BoxDecoration(color: dark ? AppColors.darkTrack : AppColors.track, borderRadius: BorderRadius.circular(widget.radius)));
    }
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) => Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(widget.radius),
          color: Color.lerp(dark ? AppColors.darkBorder : AppColors.border, dark ? AppColors.darkTrack : AppColors.track, _c.value),
        ),
      ),
    );
  }
}

class CardSkeleton extends StatelessWidget {
  const CardSkeleton({super.key, this.count = 3});
  final int count;
  @override
  Widget build(BuildContext context) => ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: count,
        separatorBuilder: (_, __) => const SizedBox(height: 12),
        itemBuilder: (_, __) => Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                ShimmerBox(height: 150, radius: 16),
                SizedBox(height: 12),
                ShimmerBox(width: 180, height: 16),
                SizedBox(height: 8),
                ShimmerBox(width: 120, height: 12),
              ],
            ),
          ),
        ),
      );
}

class EmptyView extends StatelessWidget {
  const EmptyView({super.key, this.title, this.hint, this.icon = Icons.inbox_outlined, this.action});
  final String? title;
  final String? hint;
  final IconData icon;
  final Widget? action;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 42, color: Theme.of(context).brightness == Brightness.dark ? AppColors.darkMuted : AppColors.muted),
              const SizedBox(height: 12),
              Text(title ?? s('empty_generic'), style: const TextStyle(fontWeight: FontWeight.w800)),
              if (hint != null) ...[
                const SizedBox(height: 6),
                Text(hint!, textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: Theme.of(context).brightness == Brightness.dark ? AppColors.darkMuted : AppColors.muted)),
              ],
              if (action != null) ...[const SizedBox(height: 16), action!],
            ],
          ),
        ),
      );
}

class ErrorView extends StatelessWidget {
  const ErrorView({super.key, required this.message, this.onRetry});
  final String message;
  final VoidCallback? onRetry;
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.wifi_off_rounded, size: 40, color: AppColors.danger),
              const SizedBox(height: 10),
              Text(message, textAlign: TextAlign.center),
              if (onRetry != null) ...[
                const SizedBox(height: 14),
                FilledButton(onPressed: onRetry, child: Text(s('retry'))),
              ],
            ],
          ),
        ),
      );
}

class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, required this.offline});
  final bool offline;
  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
        duration: MediaQuery.of(context).disableAnimations ? Duration.zero : AppMotion.fast,
        child: offline
            ? MaterialBanner(
                key: const ValueKey('offline'),
                backgroundColor: Theme.of(context).brightness == Brightness.dark ? AppColors.darkWarnBg : AppColors.warnBg,
                content: Text(s('offline'), style: const TextStyle(fontSize: 12)),
                leading: const Icon(Icons.cloud_off, size: 18),
                actions: const [SizedBox.shrink()],
              )
            : const SizedBox.shrink(key: ValueKey('online')),
      );
}


/// The Aqar Rent mark — the brand-kit geometry, drawn with one [Path].
///
/// Hexagon (`24,2 43,13 43,35 24,46 5,35 5,13` on a 48 grid) filled with the
/// gold gradient, with the house roof, house body and keyhole **subtracted** —
/// the house is the surface behind the logo, exactly like the SVG mask in
/// `brand/Aqar-Rent-Brand-Kit/` and `<MarkGlyph />` on the web. One stroke
/// weight for roof and body, rounded caps and joins.
class AqarMark extends StatelessWidget {
  const AqarMark({super.key, this.size = 36, this.tile = false, this.gold = true});
  final double size;
  /// Rounded navy plate behind the mark (favicon-style contexts).
  final bool tile;
  /// `false` → a single ink colour (print, engraving, one-colour surfaces).
  final bool gold;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(painter: _AqarMarkPainter(tile: tile, gold: gold)),
    );
  }
}

class _AqarMarkPainter extends CustomPainter {
  _AqarMarkPainter({required this.tile, required this.gold});
  final bool tile;
  final bool gold;

  /// 48-grid units. Roof and body share one weight, as in the brand kit.
  static const double _stroke = 3.1;

  @override
  void paint(Canvas canvas, Size size) {
    final u = size.width / 48;
    final rect = Offset.zero & size;

    if (tile) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(rect, Radius.circular(AppShape.radiusMark * u)),
        Paint()..color = AppColors.brandDeep,
      );
    }

    // Hexagon: exactly the brand-kit geometry (same points as the SVG).
    final hex = Path()
      ..moveTo(24 * u, 2 * u)
      ..lineTo(43 * u, 13 * u)
      ..lineTo(43 * u, 35 * u)
      ..lineTo(24 * u, 46 * u)
      ..lineTo(5 * u, 35 * u)
      ..lineTo(5 * u, 13 * u)
      ..close();

    // The house: roof curve, body with rounded shoulders, keyhole.
    final roof = Path()
      ..moveTo(10.5 * u, 22.6 * u)
      ..lineTo(24 * u, 11.6 * u)
      ..lineTo(37.5 * u, 22.6 * u);
    final bodyPath = Path()
      ..moveTo(15.1 * u, 22.4 * u)
      ..lineTo(15.1 * u, 30.6 * u)
      ..cubicTo(15.1 * u, 32.04 * u, 16.26 * u, 33.2 * u, 17.7 * u, 33.2 * u)
      ..lineTo(30.3 * u, 33.2 * u)
      ..cubicTo(31.74 * u, 33.2 * u, 32.9 * u, 32.04 * u, 32.9 * u, 30.6 * u)
      ..lineTo(32.9 * u, 22.4 * u);
    final keyhole = Path()..addOval(Rect.fromCircle(center: Offset(24 * u, 30.4 * u), radius: 2.6 * u));

    final inkColor = tile ? AppColors.brandDeep : AppColors.brand;
    final plate = Paint()
      ..style = PaintingStyle.fill
      ..isAntiAlias = true
      ..color = inkColor;
    if (gold) {
      plate.shader = const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [AppColors.goldLight, AppColors.gold, AppColors.goldDark],
        stops: [0.0, 0.5, 1.0],
      ).createShader(rect);
    }

    final cut = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = _stroke * u
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..isAntiAlias = true;

    if (gold) {
      // True negative space: paint the hexagon into a layer, then erase the
      // house out of it. Whatever is behind the widget shows through, which is
      // the same behaviour as the SVG `mask` on web.
      canvas.saveLayer(rect, Paint());
      canvas.drawPath(hex, plate);
      cut.blendMode = BlendMode.clear;
      canvas.drawPath(roof, cut);
      canvas.drawPath(bodyPath, cut);
      canvas.drawPath(keyhole, Paint()..blendMode = BlendMode.clear..isAntiAlias = true);
      canvas.restore();
      return;
    }

    // One-colour rendering (print, engraving, monochrome surfaces).
    canvas.drawPath(hex, plate);
    canvas.drawPath(roof, cut..color = inkColor);
    canvas.drawPath(bodyPath, cut);
    canvas.drawPath(keyhole, Paint()..color = inkColor);
  }

  @override
  bool shouldRepaint(covariant _AqarMarkPainter oldDelegate) =>
      oldDelegate.tile != tile || oldDelegate.gold != gold;
}

/// Wordmark + mark lockup used in the app bar.
class AqarLockup extends StatelessWidget {
  const AqarLockup({super.key, this.showWordmark = true, this.size = 32});
  final bool showWordmark;
  final double size;

  @override
  Widget build(BuildContext context) {
    final ink = Theme.of(context).brightness == Brightness.dark ? AppColors.darkInk : AppColors.ink;
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AqarMark(size: size),
        if (showWordmark) ...[
          const SizedBox(width: 10),
          Text(
            s('brand'),
            style: TextStyle(
              fontFamily: 'ElMessiriArabic',
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: ink,
            ),
          ),
        ],
      ],
    );
  }
}

class TrustBadge extends StatelessWidget {
  const TrustBadge({super.key, required this.level, this.compact = false});
  final String level;
  final bool compact;
  @override
  Widget build(BuildContext context) {
    final verified = level == 'ownership' || level == 'premium';
    final dark = Theme.of(context).brightness == Brightness.dark;
    // Verified = a gold pill with deep-navy text (7.67:1) in both modes.
    final foreground = verified ? AppColors.brandDeep : (dark ? AppColors.darkMuted : AppColors.muted);
    final background = verified ? AppColors.gold : (dark ? AppColors.darkTrack : AppColors.track);
    if (!verified && compact) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(AppShape.radiusCard)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(verified ? Icons.verified : Icons.info_outline, size: 13, color: foreground),
          const SizedBox(width: 5),
          Text(verified ? s('verified_owner') : level, style: TextStyle(fontSize: 10.5, fontWeight: FontWeight.w800, color: foreground)),
        ],
      ),
    );
  }
}

/// Handles loading / error / empty / data in one place (no scattered `if`s).
class AsyncView<T> extends StatelessWidget {
  const AsyncView({
    super.key,
    required this.snapshot,
    required this.builder,
    this.isEmpty,
    this.onRetry,
  });
  final AsyncSnapshot<T> snapshot;
  final Widget Function(T data) builder;
  final bool Function(T data)? isEmpty;
  final VoidCallback? onRetry;

  @override
  Widget build(BuildContext context) {
    final data = snapshot.data;
    final reduce = MediaQuery.of(context).disableAnimations;
    final Widget child;
    if (snapshot.connectionState == ConnectionState.waiting) {
      child = const CardSkeleton(key: ValueKey('loading'));
    } else if (snapshot.hasError) {
      child = ErrorView(key: const ValueKey('error'), message: '${snapshot.error}', onRetry: onRetry);
    } else if (data == null || (isEmpty?.call(data) ?? false)) {
      child = const EmptyView(key: ValueKey('empty'));
    } else {
      child = KeyedSubtree(key: const ValueKey('data'), child: builder(data as T));
    }
    return AnimatedSwitcher(
      duration: reduce ? Duration.zero : AppMotion.base,
      switchInCurve: AppMotion.easeOutCurve,
      child: child,
    );
  }
}
