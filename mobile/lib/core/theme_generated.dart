// GENERATED FILE — do not edit. Source: design/tokens.json
// Regenerate: node scripts/build-tokens.mjs
//
// The Flutter mirror of the web palette: identical values, identical token
// names. Every derived step is documented in design/tokens.json with the
// contrast reason it exists.

import 'dart:ui' show Color;

/// Palette — light values first, then the dark set (same token names).
class AppColors {
  AppColors._();

  // ── light ──
  static const Color brand = Color(0xFF16273B);
  static const Color brandDeep = Color(0xFF0E1728);
  static const Color network = Color(0xFF243553);
  static const Color gold = Color(0xFFBDA77E);
  static const Color goldLight = Color(0xFFE3D2A8);
  static const Color goldDark = Color(0xFF8F7A52);
  static const Color goldInk = Color(0xFF6F5D3A);
  static const Color onDark = Color(0xFFE8E2D4);
  static const Color goldText = Color(0xFF0E1728);
  static const Color bg = Color(0xFFF7F5F0);
  static const Color surface = Color(0xFFFFFFFF);
  static const Color surface2 = Color(0xFFEFEBE1);
  static const Color muted = Color(0xFF5B6472);
  static const Color border = Color(0x1A16273B);
  static const Color borderStrong = Color(0x2916273B);
  static const Color track = Color(0x1216273B);
  static const Color focus = Color(0xFF6F5D3A);
  static const Color verified = Color(0xFF6F5D3A);
  static const Color verifiedStrong = Color(0xFF16273B);
  static const Color verifiedBg = Color(0x2EBDA77E);
  static const Color verifiedBorder = Color(0x6B6F5D3A);
  static const Color sidebar = Color(0xFF16273B);
  static const Color sidebarText = Color(0xFFE8E2D4);
  static const Color sidebarActive = Color(0xFFBDA77E);
  static const Color sidebarActiveBg = Color(0x24BDA77E);
  static const Color sidebarHover = Color(0xFF243553);
  static const Color sidebarMuted = Color(0xA3E8E2D4);
  static const Color goldTint8 = Color(0x14BDA77E);
  static const Color goldTint12 = Color(0x1FBDA77E);
  static const Color goldTint14 = Color(0x24BDA77E);
  static const Color success = Color(0xFF1B5E3A);
  static const Color successFill = Color(0xFF1B5E3A);
  static const Color successBg = Color(0xFFEAF3ED);
  static const Color warn = Color(0xFF8A5A12);
  static const Color warnBg = Color(0xFFFBF3E4);
  static const Color danger = Color(0xFFA32A22);
  static const Color dangerFill = Color(0xFFA32A22);
  static const Color dangerBg = Color(0xFFFBEEED);
  static const Color info = Color(0xFF1E4A7A);
  static const Color infoBg = Color(0xFFECF1F8);
  static const Color neutral = Color(0xFF4A5666);
  static const Color neutralBg = Color(0xFFEEF1F4);
  static const Color whatsapp = Color(0xFF25D366);
  static const Color heroChipBg = Color(0x6B0E1728);
  static const Color scrim = Color(0x940E1728);

  // ── dark ──
  static const Color darkBrand = Color(0xFFE8E2D4);
  static const Color darkBrandDeep = Color(0xFF0E1728);
  static const Color darkNetwork = Color(0xFF243553);
  static const Color darkGold = Color(0xFFBDA77E);
  static const Color darkGoldLight = Color(0xFFE3D2A8);
  static const Color darkGoldInk = Color(0xFFE3D2A8);
  static const Color darkBg = Color(0xFF0E1728);
  static const Color darkSurface = Color(0xFF17293F);
  static const Color darkSurface2 = Color(0xFF1C3049);
  static const Color darkMuted = Color(0xFFA3ADB9);
  static const Color darkBorder = Color(0x17E8E2D4);
  static const Color darkBorderStrong = Color(0x29E8E2D4);
  static const Color darkTrack = Color(0x14E8E2D4);
  static const Color darkFocus = Color(0xFFE3D2A8);
  static const Color darkVerified = Color(0xFFBDA77E);
  static const Color darkVerifiedBg = Color(0x29BDA77E);
  static const Color darkVerifiedBorder = Color(0x73BDA77E);
  static const Color darkSidebar = Color(0xFF0C1727);
  static const Color darkSidebarActive = Color(0xFFBDA77E);
  static const Color darkGoldTint8 = Color(0x1ABDA77E);
  static const Color darkGoldTint12 = Color(0x24BDA77E);
  static const Color darkGoldTint14 = Color(0x2EBDA77E);
  static const Color darkSuccess = Color(0xFF6FD3A2);
  static const Color darkSuccessFill = Color(0xFF6FD3A2);
  static const Color darkSuccessBg = Color(0x296FD3A2);
  static const Color darkWarn = Color(0xFFE4B263);
  static const Color darkWarnBg = Color(0x29E4B263);
  static const Color darkDanger = Color(0xFFF2938A);
  static const Color darkDangerFill = Color(0xFFF2938A);
  static const Color darkDangerBg = Color(0x29F2938A);
  static const Color darkInfo = Color(0xFF8FB6E8);
  static const Color darkInfoBg = Color(0x298FB6E8);
  static const Color darkNeutral = Color(0xFFA9B4C2);
  static const Color darkNeutralBg = Color(0x29A9B4C2);
  static const Color darkScrim = Color(0xA8060B14);

  /// Brand gradient: light → gold → dark, top-inline-start → bottom-inline-end.
  static const List<Color> goldGradient = <Color>[
    Color(0xFFE3D2A8),
    Color(0xFFBDA77E),
    Color(0xFF8F7A52),
  ];

  // ── aliases used across screens (each is a token, never a new colour) ──
  static const Color ink = brand;
  static const Color inkStrong = brandDeep;
  static const Color darkInk = onDark;
  static const Color darkInkStrong = Color(0xFFF7F4EE); // on-dark lifted for headings
  static const Color darkGoldText = gold;
  static const Color darkGoldTint = darkGoldTint14;
  static const Color scrimColor = scrim;
  static const Color overlayScrim = Color(0xBF0E1728);
  static const Color overlayMid = Color(0x660E1728);
  static const Color shadowSoft = Color(0x330E1728); // navy-tinted, never grey
}

/// Motion — meaning-driven, transform/opacity only.
class AppMotion {
  AppMotion._();

  static const Duration durFast = Duration(milliseconds: 120);
  static const Duration durBase = Duration(milliseconds: 220);
  static const Duration durSlow = Duration(milliseconds: 420);
  static const String easeOut = "cubic-bezier(0.22, 1, 0.36, 1)";
  static const String easeInOut = "cubic-bezier(0.65, 0, 0.35, 1)";
  static const double rise = 10;
  static const String pressScale = "0.985";
  static const double lift = -4;
  static const Duration stagger = Duration(milliseconds: 60);

  static const Curve easeOutCurve = Cubic(0.22, 1, 0.36, 1);
  static const Curve easeInOutCurve = Cubic(0.65, 0, 0.35, 1);
  static const Curve easeSpringCurve = Cubic(0.34, 1.3, 0.64, 1);
  static const Duration instant = Duration(milliseconds: 80);
  static const Duration hero = Duration(milliseconds: 900);
}

/// Geometry — one radius language across web, admin and mobile.
class AppShape {
  AppShape._();

  static const double radiusField = 12;
  static const double radiusCard = 18;
  static const double radiusSheet = 28;
  static const double radiusPill = 999;
  static const double radiusMark = 12.5;

  static const double markRadius = 12.5;
  static const double tapMin = 48; // Material minimum
  static const double iconStroke = 1.75;
  static const double gutter = 16;
}
