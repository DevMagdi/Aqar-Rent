# Aqar Rent — تقرير اكتمال إعادة تصميم نظام الحركة والواجهات

**النطاق:** الويب، لوحة الإدارة، وتطبيق Flutter. التغيير presentation/design only؛ لا يغيّر منطق الأعمال أو عقود API أو المسارات أو مفاتيح i18n أو أشكال البيانات.

## النتيجة المختصرة

- توحيد motion tokens ومكوّنات الحركة بين الويب والأدمن، ومزامنة نظائر Flutter.
- تحديث واجهات الصفحات والحالات والبطاقات والحوارات والترويسات، وإضافة خطوط عربية/لاتينية محلية.
- إكمال التباين والوضع الداكن، وتحسين مدخل الحركة في الصفحة الرئيسية على الهاتف كي لا تظهر كتلة الثقة كمساحة فارغة قبل التمرير.
- لا توجد legacy palette utilities في TSX ضمن `web/src` أو `admin/src`.
- فحوص الويب والأدمن والبناء نجحت. تعذّر تشغيل Flutter analyze/tests لغياب Flutter SDK؛ جرى بدلًا منه الفحص الثابت المبيّن أدناه، ولا يُدّعى أنه بديل عن Flutter.

## 1. جرد legacy palette utilities

الأمر المستخدم:

```sh
grep -RInE '(text|bg|border|ring|from|to|via|divide|fill|stroke)-(stone|emerald|amber|red|blue|gray|slate|zinc|neutral|yellow|green|orange|rose|sky|indigo)-[0-9]+' web/src admin/src --include='*.tsx'
```

**الناتج: فارغ — 0 تطابقات.** واختبار `migrates legacy palette utilities out of web and admin TSX` يفرض استمرار ذلك.

## 2. ملفات/مكوّنات الحركة المستخدمة

| السطح | الملفات التي تستخدم المكوّنات | الاستخدام |
|---|---|---|
| Web | `web/src/app/[locale]/page.tsx` | Reveal، Stagger، CountUp للصفحة الرئيسية والإحصاءات والحالات الفارغة |
| Web | `web/src/app/[locale]/rent/[gov]/[city]/[idslug]/page.tsx` | Reveal وStagger لصفحة التفاصيل ومحتواها |
| Web | `web/src/components/SearchExperience.tsx` | Stagger لنتائج البحث |
| Web | `web/src/components/ui.tsx` | Reveal لحالة الفراغ ومكوّنات واجهة مشتركة |
| Web | `web/src/components/motion/index.tsx` | تعريف Reveal وStagger وCountUp وAnimatedPresence وuseReveal |
| Admin | `admin/src/pages/Dashboard.tsx` | Stagger لمجموعة مؤشرات لوحة الإدارة |
| Admin | `admin/src/components/ui.tsx` | Reveal وCountUp للمؤشرات والبطاقات والحالة الفارغة |
| Admin | `admin/src/components/motion/index.tsx` | تعريف primitives المشتركة |

ملفا primitives متطابقان byte-for-byte: `web/src/components/motion/index.tsx` و`admin/src/components/motion/index.tsx`.

## 3. PageTransition: أول mount والتغيير البرمجي

- **Web:** `PageTransition` يغلّف محتوى `main` في أول mount من `web/src/app/[locale]/layout.tsx`. عنصره keyed بـ`pathname` ويحمل `page-enter`، لذلك تعمل الحركة عند أول عرض وعند تبدّل المسار. تغيير اللغة يضيف `page-language-enter`. يلتقط الروابط الداخلية ويستخدم View Transitions API إن توفرت، مع fallback إلى تنقّل Next المعتاد؛ التنقل البرمجي يحدّث `pathname` فينشّط العنصر keyed نفسه.
- **Admin:** `admin/src/components/Shell.tsx` يغلّف محتوى المسار بعنصر keyed على `location.pathname` ويحمل `page-enter`؛ يعمل عند أول mount وكل انتقال مسار.
- **التحقق:** اختبار متصفح انتقل من `/ar` إلى `/ar/search` ووجد `page-enter` على المحتوى الجديد. عند `prefers-reduced-motion: reduce` كانت `animation-name: none`.

## 4. التصميم والاتجاه والتباين والحركة المخفّضة

- مصدرا CSS tokens في `web/src/styles/tokens.css` و`admin/src/styles/tokens.css` متطابقان byte-for-byte. القيم المرجعية في `web/src/styles/tokenValues.ts`، ونظير Flutter في `mobile/lib/core/theme.dart`.
- اختبار التباين يستخدم `resolveToken` لحل مراجع tokens قبل حساب contrast ratio، ويتحقق من أزواج النص/الخلفية الدلالية في الوضعين، بما فيها النص الداكن على gold. الاختبارات ترفض الأبيض فوق gold في TSX وموضع لون السعر على دبوس الخريطة في Flutter.
- قاعدة RTL/LTR اختُبرت في عرض **320، 360، 390، 412، 640، 900، 1280px** لكل من `ar` و`en`: `scrollWidth === innerWidth` في جميع الحالات، و`dir=rtl` للعربية و`dir=ltr` للإنجليزية.
- عند عرض 390px ظهرت كتلة الثقة قبل أن يمرر المستخدم، وعُرضت الأرقام العربية-Indic (`٤، ٠٪، ٣، ٢٤`). قائمة الهاتف فتحت، وأعلنت `aria-expanded=true`، وأظهرت 6 روابط.
- لقطة دخول الأدمن راجعت في الوضعين: تباين wordmark المقاس **18.72:1** في الفاتح و**16.18:1** في الداكن. لا overflow عند 390px.
- Web/Admin: قواعد `prefers-reduced-motion` العامة، وفحوص للمكوّنات في `web/src/components/motion/index.tsx`, `PageTransition.tsx`, `ScrollUtilities.tsx`, و`admin/src/components/motion/index.tsx`, `ThemeToggle.tsx`. عند تقليل الحركة يتوقف reveal/transition غير الضروري ويُعرض المحتوى فورًا.
- Flutter: يستند الانتقال والحالات المتحركة إلى `MediaQuery.disableAnimations`; مواضع الاستعمال تشمل `core/theme.dart`, `core/widgets.dart`, `main.dart`, `features/onboarding/onboarding_screen.dart`, `widgets/listing_card.dart`, صفحات البحث والخريطة والمفضلة والعقود وإدارة المالك. فحص الاختبار يراجع قواعد الحركة المخفّضة في CSS وFlutter، مع فحص إضافي للأجزاء الأساسية المذكورة.
- الحركة تركز على opacity/transform، وتُحدّد مدة stagger للعناصر الأولى مع fallback للمحتوى، وتُوقف عند تفضيل تقليل الحركة.

## 5. Lighthouse — الصفحة الرئيسية على الهاتف

القياس النهائي: Lighthouse **13.6.0**، mobile emulation، `/ar`، على build الإنتاج. نتيجة الصفحة كانت **100** أداءً وإمكانية وصول وأفضل الممارسات وSEO. بيئة المعاينة لم توفر بيانات backend حية؛ لذلك ظهرت حالة «لا توجد إعلانات» بدل قائمة حية.

| المقياس | قبل | بعد (القياس النهائي) | التغير |
|---|---:|---:|---:|
| Performance | 80 | **100** | +20 |
| FCP | 0.6s | 1.0s | +0.4s |
| LCP | 3.8s | **1.0s** | −2.8s |
| CLS | 0.19 | **0.006** | −0.184 |
| TBT | 0ms | 80ms | +80ms؛ ما يزال منخفضًا |
| Accessibility | — | **100** | — |
| Best Practices | — | **100** | — |
| SEO | — | **100** | — |
| INP | غير متاح في قياس المختبر | غير متاح | — |

تتضمن النتيجة النهائية تعديلًا إضافيًا صغيرًا لـ`rootMargin` في reveal، بحيث تظهر عناصر أسفل الطيّة قبل وصولها إلى viewport بدل ترك فراغ بصري. القياس أعلاه أُعيد بعد هذا التعديل.

## 6. الفحوص الفعلية

| الفحص | النتيجة |
|---|---|
| `web: npm test` | **23/23** اختبارًا ناجحًا، منها 8 اختبارات tokens/motion/contrast |
| `web: npx tsc --noEmit` | ناجح |
| `web: npm run build` | ناجح؛ توليد **50** صفحة/مسارًا |
| `admin: npm run build` | ناجح؛ يتضمن `tsc -b` ثم Vite production build |
| `git diff --check` | ناجح |
| `cmp web/src/styles/tokens.css admin/src/styles/tokens.css` | متطابقان byte-for-byte |
| `cmp web/src/components/motion/index.tsx admin/src/components/motion/index.tsx` | متطابقان byte-for-byte |
| `scripts/check_mobile.py` | **37** ملف Dart، **0** أخطاء صياغة، **109** مفاتيح i18n (**83** مستخدمًا)، **14** مسار Flutter، **113** مسار API في الفحص |
| `flutter analyze --fatal-infos` / `flutter test --coverage` | لا يمكن تشغيلهما محليًا لغياب Flutter SDK؛ **نجح كلاهما في GitHub Actions على أحدث commit**، ونجح كذلك فحص Dart الثابت أعلاه |
| `web: npm run lint` | لم يُشغّل محليًا؛ script يستدعي `next lint` غير المدعوم في Next 16، ولم يتغير خارج النطاق. فحص `lint` المقابل في GitHub Actions **نجح** |

في أول تشغيل CI كشف التحليل معلومتين `info` جُعلتا fatal: import زائد ومعامل `settings` قابلًا للتمرير كـsuper parameter. أُصلحتا مباشرةً في `mobile/lib/core/theme.dart` و`mobile/lib/core/widgets.dart` (commit `cf48acc`)، ثم نجح التحليل والاختبارات في إعادة التشغيل؛ لم تُعطّل الفحوص أو تُخفّف قواعدها. نجحت أيضًا checks الخاصة بـweb/admin/audit/e2e وقاعدتي بيانات SQLite وPostgreSQL. خطوة iOS release مُتخطّاة طبيعيًا لأنها مخصصة لـ`workflow_dispatch` وليست فحص PR.

ظهرت تحذيرات Vite عن `configLoader: native` و`__dirname`/CommonJS، لكنها لم تمنع build أو tests.

## 7. الحفاظ على السلوك والبيانات والمحتوى القانوني

- لم تتغير endpoint definitions أو دوال API أو مخططات البيانات أو صفحات/أسماء المسارات؛ التغييرات في layout/components/styles فقط.
- لم تتغير مفاتيح أو قيم i18n؛ اختبار mobile الثابت ما زال يعثر على 109 مفاتيح ثنائية اللغة.
- بقيت إفصاحات المنتج القانونية ثابتة: لا عمولة على الإيجار، المنصة لا تحتفظ بالأموال/التأمين، والعقود اتفاقات خاصة بين الطرفين وليست موثّقة أو مسجّلة رسميًا.
- ما زال تنسيق الأرقام في العربية باستخدام أرقام عربية-Indic، وفي الإنجليزية أرقامًا لاتينية.

## 8. Walkthrough يدوي قابل لإعادة التنفيذ

لا يوجد تسجيل فيديو مرفق؛ الوصف التالي هو سجل التحقق والخطوات اللازمة لتكراره:

1. **Home:** افتح `/ar` ثم `/en`، جرّب العرض 390px و1280px، لاحظ اتجاه الصفحة، كتلة البحث المتداخلة، بطاقات الثقة، الإحصاءات، وحالة عدم وجود نتائج عند غياب backend. مرّر للأسفل لرؤية خطوات الاستخدام وCTA.
2. **Card/search/filter:** افتح `/ar/search` أو زر «عرض الكل»؛ جرّب controls والفلاتر والـchips ثم وضع القائمة/الخريطة، وتحقق من تحميل/فراغ/خطأ الواجهة. في بيانات backend الحية تظهر بطاقات العقار وstagger؛ الـAPI لم يُستبدل أو يُحاك داخل التطبيق.
3. **Detail:** افتح بطاقة نتيجة من البحث إلى مسار `/ar/rent/{gov}/{city}/{slug}`؛ افحص معرض الصور، معلومات المالك والثقة، السعر، معلومات الاتصال، والـsticky contact dock. يلزم listing حقيقي من API لمراجعة محتوى التفاصيل؛ لم تتوفر بيانات backend في معاينة Lighthouse.
4. **Admin:** افتح `/login` على `admin`، جرّب الوضع الفاتح/الداكن وتباين wordmark، ثم سجّل الدخول بحساب الإدارة المعتاد لمراجعة Dashboard والمؤشرات المتدرجة، الجداول، الفلاتر، empty/loading/error states، والقائمة الجانبية المتجاوبة. لم تُستخدم بيانات اعتماد أو جلسة مصطنعة.
5. **Flutter:** بعد توفير Flutter SDK ومحاكي Android/iOS، شغّل `cd mobile && flutter pub get && flutter analyze && flutter test && flutter run`. راجع home/search/filter/card/detail/favorites/owner، بدّل العربية/الإنجليزية والوضع الداكن، ثم فعّل نظام الجهاز لتقليل الحركة. لا يمكن ادعاء مراجعة شاشة محاكي لأن SDK غير موجود هنا.

## 9. جدول المواصفات والاكتمال

| بند المواصفة | الملفات/المناطق الرئيسية | الحالة | النقص/السبب |
|---|---|---|---|
| Motion tokens موحدة وتطابق Web/Admin | `web/src/styles/tokens.css`, `admin/src/styles/tokens.css`, `web/src/styles/tokenValues.ts`, `mobile/lib/core/theme.dart` | مكتمل | لا نقص |
| Reveal/Stagger/CountUp وإيقاف الحركة | `web/src/components/motion/index.tsx`, `admin/src/components/motion/index.tsx`, `web/src/components/ui.tsx`, `admin/src/components/ui.tsx`, Home/Search/Detail/Dashboard | مكتمل | لا نقص |
| Page enter عند أول mount والتنقل | Web `PageTransition.tsx` + locale layout؛ Admin `Shell.tsx`; CSS العام | مكتمل ومتحقق بالمتصفح | لا نقص |
| إزالة legacy palette utilities من TSX | Web/Admin TSX + `tokens.test.ts` | مكتمل؛ **0** تطابق | لا نقص |
| RTL/LTR وlogical layout | Web/Admin CSS/components، Flutter theme/screens | مكتمل بحسب فحص المتصفح الثنائي اللغة | لا overflow في العروض المختبرة |
| Dark mode والتباين وfocus | Web/Admin tokens وCSS والمكونات؛ `mobile/lib/core/theme.dart` ومكونات الألوان | مكتمل بحسب الاختبارات وقياس wordmark | Flutter runtime غير متاح، لذا لم تُقَس شاشة محاكي |
| Reduced motion | Web/Admin CSS/motion hooks وFlutter transitions/widgets/screens | مكتمل بحسب CSS/browser/static checks | Flutter runtime غير متاح |
| أداء الصفحة الرئيسية | Home/Fonts/Reveal/CSS | Lighthouse نهائي 100؛ LCP 1.0s، CLS .006 | FCP أبطأ 0.4s وTBT أعلى 80ms من خط الأساس؛ القياسان ما زالا ضمن ميزانية منخفضة |
| الحفاظ على business/API/routes/i18n/data/legal | مكونات العرض والـtokens فقط؛ `scripts/check_mobile.py` | مكتمل | لا تغييرات سلوكية/مخططية مقصودة |
| Flutter analyze/tests | Flutter source | غير مكتمل بيئيًا | لا يوجد Flutter SDK؛ يلزم تشغيلها في CI أو بيئة Flutter |
| جرد الملفات الكامل | [`design-system-file-inventory.md`](design-system-file-inventory.md) | مكتمل | يوثق الملفات المتغيرة والـassets |

## 10. PR والدمج

فُتح [PR #10](https://github.com/DevMagdi/Aqar-Rent/pull/10) من الفرع `arena/b8d85831-aqar-rent` إلى `main`. بعد إصلاح ملاحظتي Flutter، نجحت checks: `admin`, `audit`, `e2e`, `lint`, `quality`, `test (postgres)`, `test (sqlite)`, و`web`. تحقق iOS release مُتخطّى حسب إعداد workflow ولا يلزم لطلب الدمج. حالة الدمج النهائية والـmerge commit موثقان في صفحة PR على GitHub.
