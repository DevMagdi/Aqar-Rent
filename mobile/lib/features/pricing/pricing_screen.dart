// Public pricing — every number comes from GET /api/v1/pricing (DB-backed),
// never hard-coded. Arabic-first with full English mirroring.
import 'package:flutter/material.dart';

import '../../api/api_client.dart';
import '../../core/i18n.dart';
import '../../core/theme.dart';
import '../../core/widgets.dart';
import '../legal/legal_notice.dart';

class PricingScreen extends StatefulWidget {
  const PricingScreen({super.key});
  @override
  State<PricingScreen> createState() => _PricingScreenState();
}

class _PricingScreenState extends State<PricingScreen> {
  final api = ApiClient();
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _load();
  }

  Future<Map<String, dynamic>> _load() async =>
      (await api.cachedGet('/pricing')) as Map<String, dynamic>;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(s('pricing'))),
      body: FutureBuilder<Map<String, dynamic>>(
        future: _future,
        builder: (context, snap) => AsyncView<Map<String, dynamic>>(
          snapshot: snap,
          onRetry: () => setState(() => _future = _load()),
          builder: (d) => ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            children: [
              _Hero(),
              const SizedBox(height: 16),
              _SectionTitle(s('weekly_ad'), '1'),
              _WeeklyCard(d['weekly_ad'] as Map<String, dynamic>),
              const SizedBox(height: 20),
              _SectionTitle(s('packages'), '2'),
              ...((d['packages'] as List?) ?? []).whereType<Map<String, dynamic>>().map(_packageCard),
              const SizedBox(height: 20),
              _SectionTitle(s('subscriptions'), '3'),
              _AudienceLabel(s('owner_plans')),
              ...((d['subscriptions'] as List?) ?? [])
                  .whereType<Map<String, dynamic>>()
                  .where((p) => p['audience'] == 'individual')
                  .map(_planCard),
              _AudienceLabel(s('office_plans')),
              ...((d['subscriptions'] as List?) ?? [])
                  .whereType<Map<String, dynamic>>()
                  .where((p) => p['audience'] == 'office')
                  .map(_planCard),
              const SizedBox(height: 18),
              const LegalNotice(compact: false),
            ],
          ),
        ),
      ),
    );
  }

  String _name(Map<String, dynamic> m) =>
      (AppStrings.isArabic ? m['name_ar'] : m['name_en'] ?? m['name_ar'] ?? m['name'] ?? '') as String;

  Widget _packageCard(Map<String, dynamic> p) => Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: ListTile(
          contentPadding: const EdgeInsets.all(14),
          leading: CircleAvatar(
            backgroundColor: Theme.of(context).brightness == Brightness.dark ? AppColors.darkGoldTint : AppColors.goldTint14,
            child: Text('${p['weeks']}', style: TextStyle(fontWeight: FontWeight.w900, color: Theme.of(context).colorScheme.onSurface)),
          ),
          title: Text(_name(p), style: const TextStyle(fontWeight: FontWeight.w800)),
          subtitle: Text('${p['weeks']} ${s('per_week')} · ${s('discount')} ${p['discount_pct']}%'),
          trailing: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('${p['total']} ${s('egp')}', style: TextStyle(fontWeight: FontWeight.w900, color: Theme.of(context).colorScheme.onSurface)),
              if ((p['discount'] as num? ?? 0) > 0)
                Text('${p['subtotal']}', style: TextStyle(fontSize: 11, decoration: TextDecoration.lineThrough, color: appMutedColor(context))),
              if (p['is_featured'] == true)
                Text('${s('featured_plan')}', style: TextStyle(fontSize: 10, color: AppTheme.statusColor('warn', dark: Theme.of(context).brightness == Brightness.dark))),
            ],
          ),
        ),
      );

  Widget _planCard(Map<String, dynamic> p) => Card(
        margin: const EdgeInsets.only(bottom: 10),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(child: Text(_name(p), style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 15))),
                  Text('${p['monthly_price_egp']} ${s('egp')} / ${s('per_month')}',
                      style: TextStyle(fontWeight: FontWeight.w900, color: Theme.of(context).colorScheme.onSurface)),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                '${AppStrings.isArabic ? 'حتى' : 'Up to'} ${p['listing_limit']} ${AppStrings.isArabic ? 'إعلان' : 'listings'} · '
                '${p['seats']} ${AppStrings.isArabic ? 'مستخدم' : 'seat(s)'}',
                style: TextStyle(fontSize: 12, color: appMutedColor(context)),
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 4,
                children: ((p['features'] as Map<String, dynamic>?) ?? {})
                    .entries
                    .where((e) => e.value == true)
                    .map((e) => Chip(
                          visualDensity: VisualDensity.compact,
                          label: Text(e.key, style: const TextStyle(fontSize: 10)),
                        ))
                    .toList(),
              ),
            ],
          ),
        ),
      );
}

class _Hero extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(22),
          gradient: LinearGradient(
            colors: Theme.of(context).brightness == Brightness.dark
                ? [AppColors.darkGoldTint, AppColors.darkSurface]
                : [AppColors.goldTint12, AppColors.verifiedBg],
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(s('pricing'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w900)),
            const SizedBox(height: 8),
            Text(s('no_rent_money'), style: const TextStyle(fontSize: 12.5, height: 1.6)),
            const SizedBox(height: 12),
            Wrap(spacing: 6, runSpacing: 6, children: [
              _pill(AppStrings.isArabic ? 'بدون عمولة' : 'No commission', context),
              _pill(AppStrings.isArabic ? 'لا تأمين' : 'No deposits held', context),
              _pill(AppStrings.isArabic ? 'الوسيط اختياري' : 'Broker-optional', context),
            ]),
          ],
        ),
      );

  Widget _pill(String text, BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          color: Theme.of(context).brightness == Brightness.dark ? AppColors.darkSurface2 : AppColors.surface,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(text, style: const TextStyle(fontSize: 10.5, fontWeight: FontWeight.w700)),
      );
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title, this.number);
  final String title;
  final String number;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(children: [
          CircleAvatar(radius: 13, backgroundColor: AppTheme.brand, child: Text(number, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w900))),
          const SizedBox(width: 10),
          Text(title, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w900)),
        ]),
      );
}

class _WeeklyCard extends StatelessWidget {
  const _WeeklyCard(this.weekly);
  final Map<String, dynamic> weekly;
  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('${weekly['price_egp']} ${s('egp')}', style: TextStyle(fontSize: 30, fontWeight: FontWeight.w900, color: Theme.of(context).colorScheme.onSurface)),
              const SizedBox(height: 4),
              Text('${AppStrings.isArabic ? 'إعلان واحد ·' : 'One listing ·'} ${weekly['duration_days']} ${AppStrings.isArabic ? 'أيام' : 'days'}',
                  style: TextStyle(fontSize: 12, color: appMutedColor(context))),
            ],
          ),
        ),
      );
}

class _AudienceLabel extends StatelessWidget {
  const _AudienceLabel(this.label);
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(2, 14, 2, 8),
        child: Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w900, color: appMutedColor(context))),
      );
}
