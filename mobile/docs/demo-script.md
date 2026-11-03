# Store screenshots & demo video script — عقار رينت

The Flutter SDK is not installed in the code sandbox (only GitHub/npm/PyPI hosts
are reachable), so **binary screenshots and the video must be captured on CI or
a developer machine with Flutter + simulators**. This document is the exact,
reproducible capture plan — no invented "screenshot" images are committed.

## 1. Capture commands

```bash
cd mobile
flutter create . --org com.aqarrent --platforms android,ios --project-name aqar_rent_mobile
flutter pub get
flutter run --dart-define=ENVIRONMENT=dev --dart-define=API_BASE=http://10.0.2.2:8000 -d <device>
# In another terminal (device connected / simulator booted):
flutter screenshot -d <device> -o docs/screenshots/01-home-ar.png

# iOS simulator, 6.7" and 6.1" sizes
xcrun simctl boot "iPhone 16 Pro Max"
xcrun simctl io booted screenshot docs/screenshots/01-home-ar.png

# Arabic + English, light + dark
flutter screenshot -d <device> -o docs/screenshots/02-home-en.png
```

Use the backend seed data (`make seed --demo`) so every screen has real listings,
a verified owner, an office, a confirmed contract and handover records. No
placeholder captions: each frame uses the actual in-app Arabic/English strings.

## 2. Store screenshot set (6 frames, Arabic-first)

| # | Frame | What must be visible | Why it sells |
|---|---|---|---|
| 1 | Home / search | Arabic hero, filter chips, listing cards with price, `✓ مالك موثّق` badge, `★ إعلان مميز` | Trust + transparency at first glance |
| 2 | Listing detail | Gallery, monthly rent, transparent trust panel (badges + "مراجعة مستندات وليست فحصاً حكومياً"), office link | The differentiation vs. WhatsApp listings |
| 3 | Map view | Cairo/Giza pins with prices, production tile attribution | Fast discovery on mid-range devices |
| 4 | Pricing | 500 EGP weekly ad, 2/4/8-week packages with discounts, Owner Plus + Office tiers, "لا نحصّل الإيجار أو التأمين" | Sustainable, honest business model |
| 5 | Contract + handover | Private-agreement legal notice, dual OTP confirmation, side-by-side check-in/out with meter readings | Real legal/evidence value, no fake official claims |
| 6 | Office workspace | Team list, lead pipeline (new → won), conversion KPI, commission note | "Better than WhatsApp + Excel" persona |

Duplicate the set in English (`en`) for the English store locales, plus one dark
mode frame. Google Play requires 2–8 phone screenshots (≥320px, 16:9 or 9:16);
App Store requires 6.7" and 6.1" sets.

## 3. Demo video script (75 seconds, Arabic VO, English subtitles)

| Time | Visual | Voice-over (Arabic) | On-screen caption |
|---|---|---|---|
| 00:00–00:07 | App icon → splash → onboarding swipe | «عقار رينت… الإيجار في مصر بوضوح، من غير عمولة على الإيجار.» |أسعار واضحة / transparent pricing |
| 00:07–00:16 | Search + filters + map pins | «دوّر على شقتك بالخريطة أو بالفلاتر… الأسعار شهرية بالجنيه، والموقع الدقيق بعد تسجيل الدخول.» | بحث وخريطة |
| 00:16–00:26 | Card + detail trust panel | «كل إعلان يعرض مستوى توثيق المالك: هاتف، هوية، مستندات ملكية… مراجعة من فريقنا، مش فحص حكومي.» | مالك موثّق |
| 00:26–00:36 | Pricing page, packages, office tiers | «إعلان أسبوعي ٥٠٠ جنيه، باقات بخصم، واشتراكات للمالكين والمكاتب. المنصة عمرها ما بتلمّ الإيجار أو التأمين.» | لا نحتفظ بأموال الإيجار |
| 00:36–00:48 | OTP login → contact reveal → contract wizard | «اتفق مباشرة مع المالك أو مكتب موثّق، واعمل عقد اتفاق خاص بتأكيد رمزين وملف PDF عليه QR.» | اتفاق خاص · ليس سنداً تنفيذياً |
| 00:48–00:60 | Handover check-in/out side-by-side | «سجّل التسليم بالصور وقراءات العدادات، وقارن الدخول بالخروج… دليل منظم للطرفين.» | محاضر تسليم |
| 00:60–00:70 | Office workspace KPIs | «وللمكاتب: فريق، عملاء محتملون، متابعات ولوحة أداء… أفضل من واتساب وإكسل.» | أول منصة للمكاتب والأفراد |
| 00:70–00:75 | Logo + store badge | «عقار رينت… ثقة واضحة، واختيار لك.» | عقار رينت · Aqar Rent |

**Production notes:** 1080×1920 (vertical) for social/Play, plus 16:9 for web;
VO by a native Egyptian Arabic narrator; subtitles in Arabic + English; no
music with unlicensed rights; show only seeded demo data (never real users).

## 4. Acceptance

- [ ] 6 Arabic PNGs + 6 English PNGs captured on physical/emulated devices
- [ ] Dark mode frame captured
- [ ] 75-second video exported with both subtitle tracks
- [ ] Captions verified against `docs/legal-notes.md` (no official-registry claim)
- [ ] Assets attached to the store listing and to the release PR artifacts
