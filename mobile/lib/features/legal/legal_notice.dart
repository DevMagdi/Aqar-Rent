// Honest legal framing shown on pricing, contracts and verification screens.
import 'package:flutter/material.dart';

import '../../core/i18n.dart';
import '../../core/theme.dart';

class LegalNotice extends StatelessWidget {
  const LegalNotice({super.key, this.compact = true});
  final bool compact;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppTheme.amber.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.amber.withValues(alpha: 0.35)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              const Text('⚖️', style: TextStyle(fontSize: 14)),
              const SizedBox(width: 8),
              Expanded(child: Text(s('legal_title'), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 12.5))),
            ]),
            const SizedBox(height: 6),
            Text(
              compact ? s('legal_private_only') : s('legal_body'),
              style: const TextStyle(fontSize: 11, height: 1.6, color: AppColors.warn),
            ),
          ],
        ),
      );
}
