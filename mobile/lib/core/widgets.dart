// Shared UI kit: shimmer skeletons, empty/error states, async view, trust badges.
import 'package:flutter/material.dart';

import 'i18n.dart';
import 'theme.dart';

class ShimmerBox extends StatefulWidget {
  const ShimmerBox({super.key, this.width = double.infinity, this.height = 16, this.radius = 10});
  final double width;
  final double height;
  final double radius;
  @override
  State<ShimmerBox> createState() => _ShimmerBoxState();
}

class _ShimmerBoxState extends State<ShimmerBox> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _c,
      builder: (_, __) => Container(
        width: widget.width,
        height: widget.height,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(widget.radius),
          color: Color.lerp(
            const Color(0xFFE7E5E4),
            const Color(0xFFF5F5F4),
            _c.value,
          ),
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
              Icon(icon, size: 42, color: Colors.black26),
              const SizedBox(height: 12),
              Text(title ?? s('empty_generic'), style: const TextStyle(fontWeight: FontWeight.w800)),
              if (hint != null) ...[
                const SizedBox(height: 6),
                Text(hint!, textAlign: TextAlign.center, style: const TextStyle(fontSize: 12, color: Colors.black54)),
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
              const Icon(Icons.wifi_off_rounded, size: 40, color: Colors.redAccent),
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
        duration: const Duration(milliseconds: 250),
        child: offline
            ? MaterialBanner(
                key: const ValueKey('offline'),
                backgroundColor: AppTheme.amber.withValues(alpha: 0.14),
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
    if (!verified && compact) return const SizedBox.shrink();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color: verified ? AppTheme.teal : const Color(0xFFF5F5F4),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(verified ? Icons.verified : Icons.info_outline,
              size: 13, color: verified ? Colors.white : Colors.black54),
          const SizedBox(width: 5),
          Text(
            verified ? s('verified_owner') : level,
            style: TextStyle(
              fontSize: 10.5,
              fontWeight: FontWeight.w800,
              color: verified ? Colors.white : Colors.black54,
            ),
          ),
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
    if (snapshot.connectionState == ConnectionState.waiting) return const CardSkeleton();
    if (snapshot.hasError) return ErrorView(message: '${snapshot.error}', onRetry: onRetry);
    final data = snapshot.data;
    if (data == null || (isEmpty?.call(data) ?? false)) return const EmptyView();
    return builder(data as T);
  }
}
