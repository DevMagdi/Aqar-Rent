// Aqar Rent premium theme — SINGLE SOURCE OF TRUTH for mobile colours.
// Byte-verified against web tokens by web/src/styles/tokens.test.ts.
// Identity: Mantiq Navy #16273B + Mantiq Gold #BDA77E, navy/gold only.
// Light in the base constants; dark in AppColors.dark*.
import 'package:flutter/material.dart';

class AppColors {
  AppColors._();

  /* ── Brand: the two hues from the Mantiq logo ── */
  static const brand = Color(0xFF16273B); // Mantiq Navy — ink and chrome
  static const brandDeep = Color(0xFF0E1728); // Mantiq Navy Deep — darkest / dark canvas
  static const network = Color(0xFF1E3349); // derived navy +1: hover/raised navy
  static const gold = Color(0xFFBDA77E); // Mantiq Gold — the single accent
  static const goldLight = Color(0xFFD8C7A4); // derived gold +1: gradients, gold on navy
  static const goldDark = Color(0xFF86693C); // derived gold −1: 5.12:1 text on white
  static const onDark = Color(0xFFEDE9E0); // derived warm white: 12.49:1 on navy
  static const goldText = brandDeep; // label on a gold surface (never white)

  /* ── Verified = GOLD (the trust mark), never a second hue ── */
  static const verified = goldDark; // icon + 12px label on light surfaces
  static const verifiedStrong = brandDeep; // navy label inside a gold pill
  static const verifiedBg = Color(0xFFF3EFE8); // gold 18% over white
  static const verifiedBorder = Color(0x6B86693C); // gold 42% outline

  /* ── Surfaces (light) ── */
  static const bg = Color(0xFFFAF9F5);
  static const surface = Color(0xFFFFFFFF);
  static const surface2 = Color(0xFFF3F0E9);
  static const ink = brand;
  static const muted = Color(0xFF5B6472);
  static const border = Color(0xFFE4E1D9); // derived rgba(22,39,59,.10)
  static const track = Color(0xFFECEAE3); // derived rgba(22,39,59,.07)
  static const goldTint12 = Color(0xFFF7F2E8); // gold 12% on white
  static const goldTint14 = Color(0xFFF5EFE4); // gold 14% on white

  /* ── Status (functional, AA-proven under navy/gold) ── */
  static const success = Color(0xFF1B5E3A);
  static const successBg = Color(0xFFEAF3ED);
  static const warn = Color(0xFF8A5A12);
  static const warnBg = Color(0xFFFBF3E4);
  static const danger = Color(0xFFA32A22);
  static const dangerBg = Color(0xFFFBEEED);
  static const info = Color(0xFF1E4A7A);
  static const infoBg = Color(0xFFECF1F8);
  static const neutral = Color(0xFF4A5666);
  static const neutralBg = Color(0xFFEEF1F4);

  static const whatsapp = Color(0xFF25D366); // official integration colour

  /* ── Neutral overlays (scrims, not brand colours) ── */
  static const overlayScrim = Color(0xBF000000);
  static const overlayMid = Color(0x66000000);
  static const shadowSoft = Color(0x40000000);
  static const scrim = Color(0x8C0E1728); // navy scrim for sheets/dialogs

  /* ── Dark mode ── */
  static const darkBg = Color(0xFF0E1728);
  static const darkSurface = Color(0xFF17293F);
  static const darkSurface2 = Color(0xFF1C3049);
  static const darkInk = Color(0xFFEDE9E0);
  static const darkInkStrong = Color(0xFFF7F4EE);
  static const darkMuted = Color(0xFFA3ADB9); // 6.48:1 on the dark surface
  static const darkBorder = Color(0x1AEDE9E0); // rgba(237,233,224,.10)
  static const darkTrack = Color(0xFF233750);
  static const darkSidebar = Color(0xFF0C1727);
  static const darkGoldText = gold; // 6.31:1 on the dark surface
  static const darkGoldTint = Color(0xFF2A3242); // gold 16% on the dark surface
  static const darkSuccess = Color(0xFF6FD3A2);
  static const darkSuccessBg = Color(0xFF1B3329);
  static const darkWarn = Color(0xFFE4B263);
  static const darkWarnBg = Color(0xFF372D1C);
  static const darkDanger = Color(0xFFF2938A);
  static const darkDangerBg = Color(0xFF3A2220);
  static const darkInfo = Color(0xFF8FB6E8);
  static const darkInfoBg = Color(0xFF1B2A3D);
}

/// Motion tokens mirror web/src/styles/tokens.css. Entrances stay restrained,
/// serve meaning, animate transform/opacity only, and always check
/// MediaQuery.disableAnimations.
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

/// Geometry that must match the web tokens (radius scale) plus mobile-only
/// touch-target minimums (48dp ≥ the 44px web minimum).
class AppShape {
  AppShape._();

  static const double radiusCard = 20;
  static const double radiusShell = 28;
  static const double radiusField = 14;
  static const double tapMin = 48; // Material minimum touch target
  static const double gutter = 16;
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

  /* ── Compatibility aliases (screens reference AppTheme.*): mapped to the
     navy/gold identity; the trust accent is gold. ── */
  static const Color brand = AppColors.brand;
  static const Color brandDark = AppColors.brandDeep;
  static const Color accent = AppColors.gold;
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
    const accent = AppColors.gold;
    const onAccent = AppColors.brandDeep; // never white on gold
    final textTheme = _textTheme(ink);
    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      scaffoldBackgroundColor: scaffold,
      colorScheme: ColorScheme(
        brightness: brightness,
        primary: accent,
        onPrimary: onAccent,
        secondary: isDark ? AppColors.darkInk : AppColors.brand,
        onSecondary: isDark ? AppColors.darkBg : AppColors.onDark,
        tertiary: isDark ? AppColors.darkGoldText : AppColors.goldDark,
        onTertiary: AppColors.brandDeep,
        error: danger,
        onError: isDark ? AppColors.brandDeep : Colors.white,
        surface: surface,
        onSurface: ink,
        outline: outline,
      ),
      textTheme: textTheme,
      // Dynamic Type: text never clips at 200% — let it scale and reflow.
      typography: Typography.material2021(platform: TargetPlatform.android),
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
          borderRadius: BorderRadius.circular(AppShape.radiusCard),
          side: BorderSide(color: outline),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: accent,
          foregroundColor: onAccent, // gold + deep navy (never white)
          minimumSize: const Size(0, AppShape.tapMin),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppShape.radiusField)),
          textStyle: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: isDark ? AppColors.darkGoldText : AppColors.goldDark,
          minimumSize: const Size(0, AppShape.tapMin),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: ink,
          side: BorderSide(color: outline),
          minimumSize: const Size(0, AppShape.tapMin),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppShape.radiusField)),
          textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          minimumSize: const Size(AppShape.tapMin, AppShape.tapMin),
          foregroundColor: ink,
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: surface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppShape.radiusField),
          borderSide: BorderSide(color: outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppShape.radiusField),
          borderSide: BorderSide(color: outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppShape.radiusField),
          borderSide: BorderSide(color: isDark ? AppColors.gold : AppColors.goldDark, width: 2),
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
        height: 72, // 48dp targets + label, comfortable label spacing
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? (isDark ? AppColors.gold : AppColors.goldDark)
                : muted,
          ),
        ),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: surface,
        modalBarrierColor: AppColors.scrim,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppShape.radiusShell)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        barrierColor: AppColors.scrim,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppShape.radiusCard)),
        titleTextStyle: textTheme.titleLarge,
        contentTextStyle: textTheme.bodyMedium,
      ),
      snackBarTheme: SnackBarThemeData(
        backgroundColor: isDark ? AppColors.darkSurface2 : AppColors.brandDeep,
        contentTextStyle: const TextStyle(color: AppColors.onDark, fontSize: 14),
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppShape.radiusField)),
      ),
      dividerTheme: DividerThemeData(color: outline, space: 1),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: isDark ? AppColors.gold : AppColors.goldDark),
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
        'info' => dark ? AppColors.darkInfo : AppColors.info,
        _ => dark ? AppColors.darkMuted : AppColors.neutral,
      };

  /// The verified / trust accent — gold on every surface, in both modes.
  static Color verifiedColor({required bool dark}) => dark ? AppColors.gold : AppColors.verified;
}
