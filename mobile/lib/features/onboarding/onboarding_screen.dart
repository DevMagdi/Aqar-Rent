// First-run onboarding: 3 Arabic-first pages with English equivalents,
// persisted locally. Smooth page transitions and RTL-aware layout.
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../core/i18n.dart';
import '../../core/theme.dart';

const _seenKey = 'aqar.onboarding.seen';

Future<bool> onboardingSeen() async =>
    (await SharedPreferences.getInstance()).getBool(_seenKey) ?? false;

Future<void> markOnboardingSeen() async =>
    (await SharedPreferences.getInstance()).setBool(_seenKey, true);

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key, required this.onDone});
  final VoidCallback onDone;

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _page = PageController();
  int _index = 0;
  static const _pages = [
    ('onboarding_1_title', 'onboarding_1_body', Icons.handshake_outlined),
    ('onboarding_2_title', 'onboarding_2_body', Icons.verified_user_outlined),
    ('onboarding_3_title', 'onboarding_3_body', Icons.description_outlined),
  ];

  Future<void> _finish() async {
    await markOnboardingSeen();
    widget.onDone();
  }

  @override
  void dispose() {
    _page.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Directionality(
      textDirection: AppStrings.direction,
      child: Scaffold(
        body: SafeArea(
          child: Column(
            children: [
              Align(
                alignment: AlignmentDirectional.topEnd,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextButton(
                        onPressed: () => LocaleController.instance.toggle(),
                        child: Text(AppStrings.isArabic ? 'EN' : 'ع'),
                      ),
                      TextButton(onPressed: _finish, child: Text(s('skip'))),
                    ],
                  ),
                ),
              ),
              Expanded(
                child: PageView.builder(
                  controller: _page,
                  itemCount: _pages.length,
                  onPageChanged: (i) => setState(() => _index = i),
                  itemBuilder: (context, i) {
                    final (titleKey, bodyKey, icon) = _pages[i];
                    return AnimatedSwitcher(
                      duration: const Duration(milliseconds: 280),
                      child: Padding(
                        key: ValueKey(i),
                        padding: const EdgeInsets.symmetric(horizontal: 28),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            TweenAnimationBuilder<double>(
                              tween: Tween(begin: 0.8, end: 1),
                              duration: const Duration(milliseconds: 420),
                              curve: Curves.easeOutBack,
                              builder: (_, scale, child) => Transform.scale(scale: scale, child: child),
                              child: Container(
                                width: 132,
                                height: 132,
                                decoration: BoxDecoration(
                                  color: AppTheme.brand.withValues(alpha: 0.10),
                                  borderRadius: BorderRadius.circular(36),
                                ),
                                child: Icon(icon, size: 64, color: AppTheme.brand),
                              ),
                            ),
                            const SizedBox(height: 34),
                            Text(s(titleKey), textAlign: TextAlign.center, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w900)),
                            const SizedBox(height: 14),
                            Text(s(bodyKey), textAlign: TextAlign.center, style: const TextStyle(fontSize: 14, height: 1.7, color: Colors.black54)),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(_pages.length, (i) {
                  final active = i == _index;
                  return AnimatedContainer(
                    duration: const Duration(milliseconds: 220),
                    margin: const EdgeInsets.symmetric(horizontal: 4),
                    width: active ? 22 : 8,
                    height: 8,
                    decoration: BoxDecoration(
                      color: active ? AppTheme.brand : Colors.black26,
                      borderRadius: BorderRadius.circular(8),
                    ),
                  );
                }),
              ),
              const SizedBox(height: 24),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 28),
                child: FilledButton(
                  onPressed: () {
                    if (_index == _pages.length - 1) {
                      _finish();
                    } else {
                      _page.nextPage(duration: const Duration(milliseconds: 320), curve: Curves.easeInOut);
                    }
                  },
                  child: Text(_index == _pages.length - 1 ? s('start') : s('next')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
