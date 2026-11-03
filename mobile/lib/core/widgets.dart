// Shared UI kit: shimmer skeletons, empty/error states, async view, trust badges.
import 'dart:async';

import 'package:flutter/material.dart';

import 'i18n.dart';
import 'theme.dart';

class AqarPageRoute<T> extends PageRouteBuilder<T> {
  AqarPageRoute({required WidgetBuilder builder, super.settings, bool disableAnimations = false}) : super(
    pageBuilder: (context, _, __) => builder(context),
    transitionDuration: disableAnimations ? Duration.zero : AppMotion.base,
    reverseTransitionDuration: disableAnimations ? Duration.zero : AppMotion.fast,
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      if (MediaQuery.of(context).disableAnimations) return child;
      final rtl = Directionality.of(context) == TextDirection.rtl;
      final offset = rtl ? const Offset(-0.035, 0) : const Offset(0.035, 0);
      final curved = CurvedAnimation(parent: animation, curve: AppMotion.easeOut, reverseCurve: AppMotion.easeOut);
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
      curve: AppMotion.easeOut,
      child: AnimatedSlide(
        offset: _visible || reduce ? Offset.zero : const Offset(0, 0.04),
        duration: duration,
        curve: AppMotion.easeOut,
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

class TrustBadge extends StatelessWidget {
  const TrustBadge({super.key, required this.level, this.compact = false});
  final String level;
  final bool compact;
  @override
  Widget build(BuildContext context) {
    final verified = level == 'ownership' || level == 'premium';
    final dark = Theme.of(context).brightness == Brightness.dark;
    final foreground = verified ? (dark ? AppColors.brandDeep : AppColors.onDark) : (dark ? AppColors.darkMuted : AppColors.muted);
    final background = verified ? (dark ? AppColors.darkTeal : AppColors.tealInk) : (dark ? AppColors.darkTrack : AppColors.track);
    if (!verified && compact) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(20)),
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
      switchInCurve: AppMotion.easeOut,
      child: child,
    );
  }
}
