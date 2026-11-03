// Aqar Rent premium theme — SINGLE SOURCE OF TRUTH for mobile colours.
// Byte-verified against web tokens by web/src/styles/tokens.test.ts.
// Light in the base constants; dark in AppColors.dark* (spec: #0B1220/#141C2B).
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  /* ── Brand (unified with web tokens) ── */
  static const brand = Color(0xFF0F1C2E); // primary ink
  static const brandDeep = Color(0xFF0B1220); // deepest navy / dark bg
  static const network = Color(0xFF1D2D45); // nav hover
  static const gold = Color(0xFFC9A86C); // refined warm gold (accent)
  static const goldLight = Color(0xFFE7D6AF); // gradients
  static const goldDark = Color(0xFF9C814E); // focus/graphics on light
  static const onDark = Color(0xFFEAE7E0); // text on navy

  /* ── Trust / secondary ── */
  static const teal = Color(0xFF0D9488);
  static const tealInk = Color(0xFF0B726A); // teal text on light (5.8:1)
  static const tealBg = Color(0xFFE6F5F3);

  /* ── Surfaces (light) ── */
  static const bg = Color(0xFFF8F7F4);
  static const surface = Color(0xFFFFFFFF);
  static const surface2 = Color(0xFFF2F0EA);
  static const ink = brand;
  static const muted = Color(0xFF5C6570);
  static const border = Color(0xFFE3E6EB); // derived rgba(15,28,46,.10)
  static const track = Color(0xFFE9EAEE); // derived rgba(15,28,46,.08)
  static const goldTint12 = Color(0xFFF9F4E9); // gold12% on white
  static const goldTint14 = Color(0xFFF8F2E5); // gold14% on white

  /* ── Status (functional, AA-proven) ── */
  static const success = Color(0xFF1B5E3A);
  static const successBg = Color(0xFFEEF6F0);
  static const warn = Color(0xFF8A5A12);
  static const warnBg = Color(0xFFFDF6EA);
  static const danger = Color(0xFFA32A22);
  static const dangerBg = Color(0xFFFDF0EF);
  static const info = Color(0xFF1F4E8C);
  static const infoBg = Color(0xFFEDF2F9);
  static const neutral = Color(0xFF17565F);
  static const neutralBg = Color(0xFFECF3F4);

  static const whatsapp = Color(0xFF25D366); // official integration colour

  /* ── Neutral overlays (not brand colours — scrim + soft shadow) ── */
  static const overlayScrim = Color(0xBF000000); // image gradient scrim (bottom)
  static const overlayMid = Color(0x66000000); // gradient mid stop
  static const shadowSoft = Color(0x40000000); // badge/card soft shadow

  /* ── Dark mode (spec: bg #0B1220, surface #141C2B) ── */
  static const darkBg = Color(0xFF0B1220);
  static const darkSurface = Color(0xFF111B2D);
  static const darkSurface2 = Color(0xFF16233A);
  static const darkInk = Color(0xFFEAE7E0); // AA on dark surfaces
  static const darkInkStrong = Color(0xFFF5F8FC);
  static const darkMuted = Color(0xFF9AA4B2); //6.8:1
  static const darkBorder = Color(0x17EAE7E0); // rgba(234,231,224,.09)
  static const darkTrack = Color(0xFF1E2738); // derived
  static const darkSidebar = Color(0xFF101A2C);
  static const darkGoldText = Color(0xFFC9A86C); // aligned gold accent
  static const darkGoldTint = Color(0xFF2B2A25); // gold14% on dark surface
  static const darkSuccess = Color(0xFF5CD6A0);
  static const darkSuccessBg = Color(0xFF17352B);
  static const darkWarn = Color(0xFFE9B44C);
  static const darkWarnBg = Color(0xFF3A2F1A);
  static const darkDanger = Color(0xFFF28B82);
  static const darkDangerBg = Color(0xFF3A2222);
  static const darkTeal = Color(0xFF2DD4BF);
}

/// Motion tokens mirror web/src/styles/tokens.css. Keep entrances restrained and GPU-friendly.
class AppMotion {
  AppMotion._();

  static const Duration instant = Duration(milliseconds: 80);
  static const Duration fast = Duration(milliseconds: 160);
  static const Duration base = Duration(milliseconds: 280);
  static const Duration slow = Duration(milliseconds: 480);
  static const Duration hero = Duration(milliseconds: 900);
  static const Duration stagger = Duration(milliseconds: 60);
  static const double rise = 16;
  static const Cubic easeOut = Cubic(0.22, 1, 0.36, 1);
  static const Cubic easeInOut = Cubic(0.65, 0, 0.35, 1);
  static const Cubic easeSpring = Cubic(0.34, 1.3, 0.64, 1);
}

class AqarPageTransitionsBuilder extends PageTransitionsBuilder {
  const AqarPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(PageRoute<T> route, BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) {
    if (MediaQuery.of(context).disableAnimations) return child;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final begin = rtl ? const Offset(-0.035, 0) : const Offset(0.035, 0);
    final curve = CurvedAnimation(parent: animation, curve: AppMotion.easeOut, reverseCurve: AppMotion.easeOut);
    return FadeTransition(opacity: animation, child: SlideTransition(position: Tween<Offset>(begin: begin, end: Offset.zero).animate(curve), child: child));
  }
}

Color appMutedColor(BuildContext context) => Theme.of(context).brightness == Brightness.dark ? AppColors.darkMuted : AppColors.muted;

/// Global theme mode: follows the system by default, overridable in-app.
final ValueNotifier<ThemeMode> appThemeMode = ValueNotifier(ThemeMode.system);

class AppTheme {
  AppTheme._();

  /* ── Phase-5 compatibility aliases (their screens reference AppTheme.*):
     mapped to premium values that stay WCAG-AA both as text on light and as
     backgrounds behind white text — navy/teal-ink/warn instead of the old
     terracotta palette (removed per the premium overhaul). ── */
  static const Color brand = AppColors.brand; // was terracotta — now primary navy
  static const Color brandDark = AppColors.brandDeep;
  static const Color teal = AppColors.tealInk; // 5.8:1 text · 5.4:1 under white
  static const Color amber = AppColors.warn;

  static ThemeData light() => _base(
        brightness: Brightness.light,
        scaffold: AppColors.bg,
        surface: AppColors.surface,
        ink: AppColors.ink,
        muted: AppColors.muted,
        outline: AppColors.border,
        success: AppColors.success,
        danger: AppColors.danger,
      );

  static ThemeData dark() => _base(
        brightness: Brightness.dark,
        scaffold: AppColors.darkBg,
        surface: AppColors.darkSurface,
        ink: AppColors.darkInk,
        muted: AppColors.darkMuted,
        outline: AppColors.darkBorder,
        success: AppColors.darkSuccess,
        danger: AppColors.darkDanger,
      );

  static ThemeData _base({
    required Brightness brightness,
    required Color scaffold,
    required Color surface,
    required Color ink,
    required Color muted,
    required Color outline,
    required Color success,
    required Color danger,
  }) {
    final isDark = brightness == Brightness.dark;
    final accent = isDark ? AppColors.gold : AppColors.gold;
    final onAccent = AppColors.brand; // never white on gold (spec)
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: scaffold,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: accent,
        onPrimary: onAccent,
        secondary: isDark ? AppColors.darkTeal : AppColors.tealInk,
        onSecondary: isDark ? AppColors.brandDeep : Colors.white,
        error: danger,
        onError: isDark ? AppColors.brandDeep : Colors.white,
        surface: surface,
        onSurface: ink,
        outline: outline,
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: scaffold,
        foregroundColor: ink,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          fontFamily: "ElMessiriArabic",
          fontSize: 17,
          fontWeight: FontWeight.w700,
          color: ink,
        ),
      ),
      cardTheme: CardThemeData(
        color: surface,
        elevation: 0,
        shadowColor: Colors.transparent,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(18),
          side: BorderSide(color: outline),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: onAccent, // gold + deep navy (never white)
          minimumSize: const Size(0, 46),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: ink,
          side: BorderSide(color: outline),
          minimumSize: const Size(0, 46),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.goldDark, width: 2),
        ),
        labelStyle: TextStyle(color: muted, fontSize: 14),
        hintStyle: TextStyle(color: muted, fontSize: 14),
      ),
      chipTheme: ChipThemeData(
        backgroundColor: isDark ? AppColors.darkSurface2 : AppColors.surface2,
        selectedColor: isDark ? AppColors.darkGoldTint : AppColors.goldTint14,
        labelStyle: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: ink),
        side: BorderSide(color: outline),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(999)),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: surface,
        indicatorColor: isDark ? AppColors.darkGoldTint : AppColors.goldTint14,
        elevation: 0,
        height: 68,
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? (isDark ? AppColors.gold : AppColors.goldDark)
                : muted,
          ),
        ),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      ),
      dividerTheme: DividerThemeData(color: outline, space: 1),
      textTheme: _textTheme(ink),
      splashFactory: InkSparkle.splashFactory,
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: AqarPageTransitionsBuilder(),
          TargetPlatform.iOS: AqarPageTransitionsBuilder(),
          TargetPlatform.linux: AqarPageTransitionsBuilder(),
          TargetPlatform.macOS: AqarPageTransitionsBuilder(),
          TargetPlatform.windows: AqarPageTransitionsBuilder(),
        },
      ),
    );
  }

  static TextTheme _textTheme(Color ink) {
    final base = Typography.englishLike2021.apply(
      bodyColor: ink,
      displayColor: ink,
      fontFamily: "IBMPlexSansArabic",
    );
    TextStyle display(TextStyle? s) => (s ?? const TextStyle()).copyWith(fontFamily: "ElMessiriArabic", height: 1.25);
    return base.copyWith(
      displayLarge: display(base.displayLarge),
      displayMedium: display(base.displayMedium),
      displaySmall: display(base.displaySmall),
      headlineLarge: display(base.headlineLarge),
      headlineMedium: display(base.headlineMedium),
      headlineSmall: display(base.headlineSmall),
      titleLarge: display(base.titleLarge),
      titleMedium: display(base.titleMedium),
      titleSmall: display(base.titleSmall),
    );
  }

  /// Status helpers (semantic, mode-aware).
  static Color statusColor(String kind, {required bool dark}) => switch (kind) {
        'success' => dark ? AppColors.darkSuccess : AppColors.success,
        'warn' => dark ? AppColors.darkWarn : AppColors.warn,
        'danger' => dark ? AppColors.darkDanger : AppColors.danger,
        _ => dark ? AppColors.darkTeal : AppColors.teal,
      };
}
