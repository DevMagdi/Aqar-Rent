// My trust level: transparent badges, documents reviewed, entitlements.
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../legal/legal_notice.dart';

class TrustScreen extends StatefulWidget {
  const TrustScreen({super.key});
  @override
  State<TrustScreen> createState() => _TrustScreenState();
}

class _TrustScreenState extends State<TrustScreen> {
  final api = ApiClient();
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<List<Map<String, dynamic>>> _load() async {
    final results = await Future.wait([
      api.cachedGet('/me/trust'),
      api.cachedGet('/me/entitlements'),
    ]);
    return results.whereType<Map<String, dynamic>>().toList();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(s('trust_title'))),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (context, snap) => AsyncView<List<Map<String, dynamic>>>(
          snapshot: snap,
          onRetry: () => setState(() => _future = _load()),
          builder: (rows) {
            final trust = rows.isEmpty ? const {} : rows[0];
            final entitlements = rows.length > 1 ? rows[1] : const {};
            final badges = (trust['badges'] as List?) ?? [];
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(18),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        TrustBadge(level: (trust['level'] ?? 'phone') as String),
                        const SizedBox(height: 12),
                        Text(
                          (AppStrings.isArabic ? trust['label_ar'] : trust['label_en'] ?? trust['label_ar'] ?? '') as String,
                          style: TextStyle(fontSize: 20, fontWeight: FontWeight.w900, color: Theme.of(context).brightness == Brightness.dark ? AppColors.darkTeal : AppColors.tealInk),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          (AppStrings.isArabic ? trust['note_ar'] : trust['note_en'] ?? s('trust_note')) as String,
                          style: TextStyle(fontSize: 12, height: 1.6, color: appMutedColor(context)),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                Text('${AppStrings.isArabic ? 'شارات التوثيق' : 'Trust badges'} (${badges.length})',
                    style: const TextStyle(fontWeight: FontWeight.w900)),
                const SizedBox(height: 8),
                for (final b in badges.whereType<Map<String, dynamic>>())
                  Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: ListTile(
                      leading: Icon(Icons.verified, color: Theme.of(context).brightness == Brightness.dark ? AppColors.darkTeal : AppColors.tealInk),
                      title: Text((AppStrings.isArabic ? b['label_ar'] : b['label_en'] ?? b['label_ar'] ?? '') as String,
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700)),
                      subtitle: Text(b['code'] as String? ?? '', style: const TextStyle(fontSize: 10)),
                    ),
                  ),
                const SizedBox(height: 12),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(s('subscriptions'), style: const TextStyle(fontWeight: FontWeight.w900)),
                        const SizedBox(height: 8),
                        Text(
                          '${AppStrings.isArabic ? 'حد الإعلانات' : 'Listing cap'}: ${entitlements['listing_cap'] ?? 5} · '
                          '${AppStrings.isArabic ? 'المقاعد' : 'Seats'}: ${entitlements['seat_limit'] ?? 1}',
                          style: const TextStyle(fontSize: 12),
                        ),
                        if (entitlements['subscription'] == null)
                          Padding(
                            padding: const EdgeInsets.only(top: 8),
                            child: Text(
                              AppStrings.isArabic
                                  ? 'لا يوجد اشتراك نشط — يمكنك شراء باقة من صفحة الأسعار.'
                                  : 'No active subscription — see the pricing page for plans.',
                              style: TextStyle(fontSize: 11, color: appMutedColor(context)),
                            ),
                          ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                const LegalNotice(),
              ],
            );
          },
        ),
      ),
    );
  }
}
