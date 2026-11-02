// End-to-end smoke: cold start → onboarding → login → shell routes.
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:aqar_rent_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('cold start shows onboarding and completes into the OTP login', (tester) async {
    app.main();
    await tester.pumpAndSettle(const Duration(seconds: 3));
    expect(find.text('تواصل مباشر… أو عبر مكتب'), findsOneWidget);
    await tester.tap(find.text('تخطي'));
    await tester.pumpAndSettle(const Duration(seconds: 2));
    expect(find.text('رقم الهاتف'), findsWidgets);
    expect(find.text('إرسال الرمز'), findsOneWidget);
  });
}
