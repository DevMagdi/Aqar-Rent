// Lightweight Arabic-first / English i18n. No code generation, no build step,
// no missing strings: every key has an explicit bilingual value.
import 'package:flutter/material.dart';

class LocaleController extends ChangeNotifier {
  LocaleController._();
  static final LocaleController instance = LocaleController._();

  Locale _locale = const Locale('ar');
  Locale get locale => _locale;
  bool get isArabic => _locale.languageCode == 'ar';

  void setLocale(Locale value) {
    if (_locale == value) return;
    _locale = value;
    notifyListeners();
  }

  void toggle() => setLocale(isArabic ? const Locale('en') : const Locale('ar'));
}

const Map<String, Map<String, String>> _kStrings = {
  'brand': {'ar': 'عقار رينت', 'en': 'Aqar Rent'},
  'tagline': {
    'ar': 'منصة الإيجار الأكثر شفافية في مصر — تواصل مباشر مع المالك أو مكتب موثّق',
    'en': "Egypt's most transparent rental platform — deal with owners or verified offices",
  },
  'welcome': {'ar': 'أهلاً بك في عقار رينت', 'en': 'Welcome to Aqar Rent'},
  'onboarding_1_title': {'ar': 'تواصل مباشر… أو عبر مكتب', 'en': 'Direct… or through an office'},
  'onboarding_1_body': {
    'ar': 'اختر ما يناسبك: المالك مباشرة بلا عمولة على الإيجار، أو مكتب عقاري موثّق يدير وحداته ووسطاءه.',
    'en': 'Your choice: contact the owner directly with no rent commission, or work with a verified office managing its units and agents.',
  },
  'onboarding_2_title': {'ar': 'ثقة واضحة، لا وعود مبهمة', 'en': 'Clear trust, no vague promises'},
  'onboarding_2_body': {
    'ar': 'مستويات توثيق ظاهرة للجميع: هاتف، هوية، مستندات ملكية، وتحقق مميز اختياري. مراجعة مستندات من فريقنا وليست فحصاً حكومياً.',
    'en': 'Visible trust levels: phone, identity, ownership documents and optional premium verification. Document review by our team, not a government check.',
  },
  'onboarding_3_title': {'ar': 'عقود ومحاضر تسليم منظمة', 'en': 'Organised contracts & handovers'},
  'onboarding_3_body': {
    'ar': 'اتفاق خاص مؤكّد برمزين، ملف PDF عربي، تحقق برمز QR، ومحاضر تسليم بالصور وقراءات العدادات — المنصة لا تحتفظ بالإيجار أو التأمين.',
    'en': 'A private agreement confirmed by two OTPs, an Arabic PDF, QR verification, and handover records with photos and meter readings — the platform never holds rent or deposits.',
  },
  'skip': {'ar': 'تخطي', 'en': 'Skip'},
  'next': {'ar': 'التالي', 'en': 'Next'},
  'start': {'ar': 'ابدأ الآن', 'en': 'Get started'},
  'language': {'ar': 'اللغة', 'en': 'Language'},
  'retry': {'ar': 'إعادة المحاولة', 'en': 'Retry'},
  'offline': {'ar': 'لا يوجد اتصال — نعرض آخر نسخة محفوظة', 'en': 'Offline — showing the last cached data'},
  'error_generic': {'ar': 'حدث خطأ، حاول مرة أخرى', 'en': 'Something went wrong, please retry'},
  'empty_generic': {'ar': 'لا توجد بيانات هنا بعد', 'en': 'Nothing here yet'},
  'loading': {'ar': 'جارٍ التحميل…', 'en': 'Loading…'},
  'login': {'ar': 'تسجيل الدخول', 'en': 'Log in'},
  'login_phone': {'ar': 'رقم الهاتف', 'en': 'Phone number'},
  'login_hint': {'ar': 'أدخل رقم هاتفك وسنرسل لك رمز تحقق عبر SMS', 'en': 'Enter your phone and we will text you a verification code'},
  'login_send': {'ar': 'إرسال الرمز', 'en': 'Send code'},
  'login_confirm': {'ar': 'تأكيد رقم الهاتف', 'en': 'Confirm your phone'},
  'login_code': {'ar': 'رمز التحقق', 'en': 'Verification code'},
  'login_verify': {'ar': 'تأكيد', 'en': 'Verify'},
  'login_resend': {'ar': 'إعادة إرسال الرمز', 'en': 'Resend code'},
  'login_resend_in': {'ar': 'إعادة الإرسال بعد', 'en': 'Resend in'},
  'login_dev_code': {'ar': 'رمز التجربة (بيئة تطوير فقط):', 'en': 'Dev code (development only):'},
  'biometric_title': {'ar': 'افتح عقار رينت', 'en': 'Unlock Aqar Rent'},
  'biometric_body': {'ar': 'استخدم بصمتك أو Face ID للمتابعة بأمان', 'en': 'Use your fingerprint or Face ID to continue securely'},
  'biometric_use': {'ar': 'فتح بالبصمة', 'en': 'Unlock with biometrics'},
  'biometric_fallback': {'ar': 'المتابعة برمز التحقق', 'en': 'Continue with OTP'},
  'nav_home': {'ar': 'الرئيسية', 'en': 'Home'},
  'nav_search': {'ar': 'بحث', 'en': 'Search'},
  'quick_filters': {'ar': 'تصفّح حسب النوع', 'en': 'Browse by type'},
  'spec_apartment': {'ar': 'شقة', 'en': 'Apartment'},
  'spec_studio': {'ar': 'استوديو', 'en': 'Studio'},
  'spec_villa': {'ar': 'فيلا', 'en': 'Villa'},
  'spec_room': {'ar': 'غرفة', 'en': 'Room'},
  'nav_favorites': {'ar': 'المفضلة', 'en': 'Saved'},
  'favorite_add': {'ar': 'أضف للمفضلة', 'en': 'Add to favorites'},
  'favorite_remove': {'ar': 'إزالة من المفضلة', 'en': 'Remove from favorites'},
  'login_required': {'ar': 'سجّل الدخول أولاً', 'en': 'Please log in first'},
  'contact_phone_login': {'ar': 'سجّل الدخول لعرض رقم المالك', 'en': 'Log in to reveal the owner’s phone number'},
  'contact_greeting': {'ar': 'مرحباً، بخصوص إعلانك على عقار رينت', 'en': 'Hello, I’m contacting you about your Aqar Rent listing'},
  'share_copied': {'ar': 'تم نسخ الرابط', 'en': 'Link copied'},
  'featured': {'ar': 'إعلان مميز', 'en': 'Featured listing'},
  'owner': {'ar': 'المالك', 'en': 'Owner'},
  'description': {'ar': 'الوصف', 'en': 'Description'},
  'share': {'ar': 'مشاركة', 'en': 'Share'},
  'call': {'ar': 'اتصال', 'en': 'Call'},
  'whatsapp': {'ar': 'واتساب', 'en': 'WhatsApp'},
  'area_unit': {'ar': 'م²', 'en': 'm²'},
  'rooms_suffix': {'ar': 'غرف', 'en': 'bedrooms'},
  'bathrooms_suffix': {'ar': 'حمام', 'en': 'bathrooms'},
  'elevator': {'ar': 'مصعد', 'en': 'Elevator'},
  'nav_contracts': {'ar': 'عقودي', 'en': 'My Contracts'},
  'nav_notifications': {'ar': 'إشعارات', 'en': 'Alerts'},
  'nav_profile': {'ar': 'حسابي', 'en': 'Account'},
  'pricing': {'ar': 'الأسعار والباقات', 'en': 'Pricing & plans'},
  'weekly_ad': {'ar': 'الإعلان الأسبوعي', 'en': 'Weekly ad'},
  'packages': {'ar': 'باقات متعددة الأسابيع', 'en': 'Multi-week packages'},
  'subscriptions': {'ar': 'الاشتراكات الشهرية', 'en': 'Monthly subscriptions'},
  'per_week': {'ar': 'أسبوع', 'en': 'weeks'},
  'per_month': {'ar': 'شهر', 'en': 'month'},
  'egp': {'ar': 'ج.م', 'en': 'EGP'},
  'discount': {'ar': 'خصم', 'en': 'discount'},
  'featured_plan': {'ar': 'مميز', 'en': 'Featured'},
  'owner_plans': {'ar': 'للمالكين (٣ وحدات فأكثر)', 'en': 'For owners (3+ units)'},
  'office_plans': {'ar': 'للمكاتب العقارية', 'en': 'For real-estate offices'},
  'no_rent_money': {
    'ar': 'لا نحصّل الإيجار أو التأمين، ولا نتقاضى عمولة على الإيجار، ولا نحتفظ بأموال بين الطرفين.',
    'en': 'We never collect rent or deposits, take no rent commission and hold no money between the parties.',
  },
  'trust_title': {'ar': 'مستوى التوثيق', 'en': 'Trust level'},
  'trust_note': {
    'ar': 'مراجعة مستندات بواسطة فريق عقار رينت — ليست فحصاً حكومياً ولا تُثبت الملكية رسمياً.',
    'en': 'Documents reviewed by the Aqar Rent team — not a government check and not proof of official title.',
  },
  'verified_owner': {'ar': 'مالك موثّق', 'en': 'Verified owner'},
  'office_workspace': {'ar': 'لوحة المكتب', 'en': 'Office workspace'},
  'office_tagline': {'ar': 'أفضل من واتساب + إكسل لإدارة الإيجار', 'en': 'Better than WhatsApp + Excel for rental management'},
  'office_create': {'ar': 'أنشئ صفحة مكتبك', 'en': 'Create your office profile'},
  'office_name_ar': {'ar': 'اسم المكتب (عربي)', 'en': 'Office name (Arabic)'},
  'office_name_en': {'ar': 'اسم المكتب (إنجليزي)', 'en': 'Office name (English)'},
  'office_cr': {'ar': 'رقم السجل التجاري', 'en': 'Commercial register'},
  'office_city': {'ar': 'المدينة', 'en': 'City'},
  'office_phone': {'ar': 'هاتف المكتب', 'en': 'Office phone'},
  'office_save': {'ar': 'إنشاء المكتب', 'en': 'Create office'},
  'team': {'ar': 'الفريق', 'en': 'Team'},
  'leads': {'ar': 'العملاء المحتملون', 'en': 'Leads'},
  'new_lead': {'ar': 'عميل جديد', 'en': 'New lead'},
  'tenant_name': {'ar': 'اسم العميل', 'en': 'Tenant name'},
  'tenant_phone': {'ar': 'رقم الهاتف', 'en': 'Phone'},
  'budget': {'ar': 'الميزانية', 'en': 'Budget'},
  'note': {'ar': 'ملاحظة', 'en': 'Note'},
  'add': {'ar': 'إضافة', 'en': 'Add'},
  'stage': {'ar': 'المرحلة', 'en': 'Stage'},
  'conversion': {'ar': 'نسبة التحويل', 'en': 'Conversion'},
  'follow_ups': {'ar': 'متابعات مستحقة', 'en': 'Follow-ups due'},
  'commission_note': {
    'ar': 'العمولة بين المكتب والمالك اتفاق خاص؛ المنصة لا تحصّلها ولا تتوسط فيها.',
    'en': 'Any office↔owner commission is private; the platform never collects it.',
  },
  'legal_title': {'ar': 'إطار قانوني واضح', 'en': 'Clear legal framing'},
  'legal_body': {
    'ar': 'العقود المتاحة «اتفاقات خاصة» بين الطرفين، ليست عقوداً موثّقة ولا مسجّلة حكومياً وليست سندات تنفيذية، ولا تُغني عن التسجيل أو التوثيق الرسمي. لا توجد حالياً منصة حكومية رقمية لتسجيل الإيجار في مصر تُعادل «إيجار» السعودية. قيمة المنصة هي تنظيم المستندات، التأكيد المزدوج، ملف PDF ورمز التحقق.',
    'en': 'Contracts are PRIVATE AGREEMENTS between the parties — not notarized, not officially registered, not executive instruments, and no substitute for official registration. As of 2026 Egypt has no official digital rental registry equivalent to Saudi Ejar. Our value is organised records, dual confirmation, an Arabic PDF and QR verification.',
  },
  'legal_private_only': {'ar': 'اتفاق خاص — ليس سنداً تنفيذياً', 'en': 'Private agreement — not an executive instrument'},
  'contracts': {'ar': 'العقود والتسليم', 'en': 'Contracts & handover'},
  'save': {'ar': 'حفظ', 'en': 'Save'},
  'account_name': {'ar': 'الاسم', 'en': 'Name'},
  'cancel': {'ar': 'إلغاء', 'en': 'Cancel'},
  'logout': {'ar': 'تسجيل الخروج', 'en': 'Log out'},
  'settings': {'ar': 'الإعدادات', 'en': 'Settings'},
  'about': {'ar': 'من نحن', 'en': 'About'},
  'terms': {'ar': 'الشروط', 'en': 'Terms'},
  'privacy': {'ar': 'الخصوصية', 'en': 'Privacy'},
  'support': {'ar': 'الدعم', 'en': 'Support'},
  'version': {'ar': 'الإصدار', 'en': 'Version'},
};

class AppStrings {
  AppStrings._();
  static final Map<String, String> _fallbacks = {
    for (final entry in _kStrings.entries) entry.key: entry.value['ar']!,
  };

  static String of(String key) {
    final lang = LocaleController.instance.locale.languageCode;
    return _kStrings[key]?[lang] ?? _kStrings[key]?['ar'] ?? _fallbacks[key] ?? key;
  }

  static TextDirection get direction =>
      LocaleController.instance.isArabic ? TextDirection.rtl : TextDirection.ltr;

  static bool get isArabic => LocaleController.instance.isArabic;
}

String s(String key) => AppStrings.of(key);

/// Rebuild subtree when locale changes; used in tests and settings screen.
class LocaleBuilder extends StatelessWidget {
  const LocaleBuilder({super.key, required this.builder});
  final Widget Function(BuildContext context) builder;
  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: LocaleController.instance,
        builder: (context, _) => builder(context),
      );
}
