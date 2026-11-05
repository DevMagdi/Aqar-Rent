// Aqar Rent theme — the *generated* palette is the only place colours exist.
//
//   design/tokens.json  ──(node scripts/build-tokens.mjs)──▶  theme_generated.dart
//                                                              ↑ re-exported here
//
// Nothing in this file declares a hex: AppColors/AppMotion/AppShape come from
// the generator, so web, admin, Android XML and Flutter can never drift.
import 'package:flutter/material.dart';

import 'theme_generated.dart';

export 'theme_generated.dart' show AppColors, AppMotion, AppShape;

class AqarPageTransitionsBuilder extends PageTransitionsBuilder {
  const AqarPageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(PageRoute<T> route, BuildContext context, Animation<double> animation, Animation<double> secondaryAnimation, Widget child) {
    if (MediaQuery.of(context).disableAnimations) return child;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final begin = rtl ? const Offset(-0.035, 0) : const Offset(0.035, 0);
    final curve = CurvedAnimation(parent: animation, curve: AppMotion.easeOutCurve, reverseCurve: AppMotion.easeOutCurve);
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
          // buttons are pills on web and admin too — one shape language
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppShape.radiusPill)),
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
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppShape.radiusPill)),
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
          borderRadius: BorderRadius.vertical(top: Radius.circular(AppShape.radiusSheet)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: surface,
        barrierColor: AppColors.scrim,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppShape.radiusSheet)),
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
    // Tabular figures: prices in a list must line up in a column, and a KPI
    // that changes 8→9 must not shift its neighbours.
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
