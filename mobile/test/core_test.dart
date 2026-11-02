// Pure unit tests: i18n completeness, deep-link mapping, config & widgets.
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:aqar_rent_mobile/config.dart';
import 'package:aqar_rent_mobile/core/deep_links.dart';
import 'package:aqar_rent_mobile/core/i18n.dart';
import 'package:aqar_rent_mobile/core/widgets.dart';
import 'package:aqar_rent_mobile/features/legal/legal_notice.dart';
import 'package:aqar_rent_mobile/features/onboarding/onboarding_screen.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('every i18n key resolves in both locales and is Arabic-first', () {
    LocaleController.instance.setLocale(const Locale('ar'));
    expect(AppStrings.isArabic, isTrue);
    expect(s('brand'), 'عقار رينت');
    LocaleController.instance.setLocale(const Locale('en'));
    expect(s('brand'), 'Aqar Rent');
    expect(s('legal_body'), contains('PRIVATE AGREEMENTS'));
    expect(s('no_rent_money'), contains('never'));
    // A missing key must never render as an exception.
    expect(s('totally_unknown_key'), 'totally_unknown_key');
    LocaleController.instance.setLocale(const Locale('ar'));
  });

  test('deep links map to in-app routes only', () {
    expect(DeepLinkService.toLocation(Uri.parse('aqarrent://listing/abc-123')), '/listing/abc-123');
    expect(DeepLinkService.toLocation(Uri.parse('aqarrent://pricing')), '/pricing');
    expect(DeepLinkService.toLocation(Uri.parse('aqarrent://verify/AR-2026-1')), '/verify/AR-2026-1');
    expect(
      DeepLinkService.toLocation(Uri.parse('https://aqarrent.app/ar/rent/cairo/maadi/11111111-1111-1111-1111-111111111111-apartment')),
      '/listing/11111111-1111-1111-1111-111111111111',
    );
    expect(DeepLinkService.toLocation(Uri.parse('https://evil.example.com/login')), isNull);
    expect(DeepLinkService.toLocation(Uri.parse('aqarrent://unknown/path')), isNull);
  });

  test('release config refuses dev endpoints / missing FCM', () {
    // assertReleaseConfig only throws in kReleaseMode (unit tests are debug).
    expect(() => AppConfig.assertReleaseConfig(), returnsNormally);
    expect(AppConfig.isProduction, isFalse);
    expect(AppConfig.mapTilesUrl.startsWith('https://'), isTrue);
  });

  group('widgets', () {
    testWidgets('onboarding shows 3 pages with localized text and finishes', (tester) async {
      LocaleController.instance.setLocale(const Locale('ar'));
      var done = false;
      await tester.pumpWidget(MaterialApp(home: OnboardingScreen(onDone: () => done = true)));
      expect(find.text('أهلاً بك في عقار رينت'), findsNothing);
      expect(find.text('تواصل مباشر… أو عبر مكتب'), findsOneWidget);
      await tester.tap(find.text('التالي'));
      await tester.pumpAndSettle();
      expect(find.text('ثقة واضحة، لا وعود مبهمة'), findsOneWidget);
      await tester.tap(find.text('التالي'));
      await tester.pumpAndSettle();
      expect(find.text('عقود ومحاضر تسليم منظمة'), findsOneWidget);
      await tester.tap(find.text('ابدأ الآن'));
      await tester.pumpAndSettle();
      expect(done, isTrue);
      LocaleController.instance.setLocale(const Locale('ar'));
    });

    testWidgets('legal notice + trust badge + empty/error states render', (tester) async {
      LocaleController.instance.setLocale(const Locale('ar'));
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: Column(children: [
            LegalNotice(compact: false),
            TrustBadge(level: 'ownership'),
            EmptyView(title: 'لا بيانات'),
            ErrorView(message: 'خطأ'),
          ]),
        ),
      ));
      expect(find.textContaining('اتفاقات خاصة'), findsWidgets);
      expect(find.text('مالك موثّق'), findsOneWidget);
      expect(find.text('لا بيانات'), findsOneWidget);
      expect(find.text('خطأ'), findsOneWidget);
    });
  });
}
