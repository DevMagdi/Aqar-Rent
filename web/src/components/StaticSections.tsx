// Complete, honest bilingual content for the public information pages.
// Arabic-first with full English equivalents; no placeholder / "coming soon" text.
import type { Locale } from "@/lib/types";

type Bi = Record<Locale, string>;

const tr = (ar: string, en: string, l: Locale) => (l === "ar" ? ar : en);

function Section({ l, ar, en, body }: { l: Locale; ar: string; en: string; body: Bi }) {
  return (
    <section>
      <h2>{tr(ar, en, l)}</h2>
      <p>{body[l]}</p>
    </section>
  );
}

function List({ l, ar, en, items }: { l: Locale; ar: string; en: string; items: [string, string][] }) {
  return (
    <section>
      <h2>{tr(ar, en, l)}</h2>
      <ul>
        {items.map(([a, e]) => (
          <li key={a}>{tr(a, e, l)}</li>
        ))}
      </ul>
    </section>
  );
}

export function AboutSections({ l }: { l: Locale }) {
  return (
    <>
      <Section
        l={l}
        ar="من نحن"
        en="Who we are"
        body={{
          ar: "عقار رينت منصة مصرية للإيجار تُتيح للأفراد نشر وحدهم مباشرة، وتُتيح للمكاتب العقارية إدارة وحدات الملاك وفرقها وعملائها في مكان واحد. المنصة لا تتوسط في الدفع بين المالك والمستأجر، ولا تحصّل الإيجار أو التأمين أو أي عمولة عليه.",
          en: "Aqar Rent is an Egyptian rental platform. Individuals list their units directly; real-estate offices manage owners' units, teams and leads in one workspace. The platform never intermediates rent payments and never collects rent, deposits or rent commission.",
        }}
      />
      <List
        l={l}
        ar="ما يميزنا"
        en="What makes us different"
        items={[
          ["اختيارك أنت: تواصل مباشرة مع المالك، أو تعامل مع مكتب عقاري موثّق.", "Your choice: contact the owner directly or work with a verified real-estate office."],
          ["مستويات توثيق شفافة: هاتف، هوية، مستندات ملكية، وتحقق مميز اختياري.", "Transparent trust levels: phone, identity, ownership documents and optional premium verification."],
          ["مستندات منظمة: عقود اتفاق خاص، محاضر تسليم، صور وقراءات عدادات، وبصمة نص.", "Organised records: private-agreement contracts, handovers, media evidence, meter readings and a text hash."],
          ["أسعار معلنة في صفحة واحدة: إعلان أسبوعي، باقات متعددة الأسابيع، واشتراكات للمالكين والمكاتب.", "One public pricing page: weekly ads, multi-week packages and owner/office subscriptions."],
        ]}
      />
      <Section
        l={l}
        ar="نموذج العمل"
        en="Business model"
        body={{
          ar: "يدفع المالك أو المكتب مقابل ظهور الإعلان، أو مقابل باقة/اشتراك يمنح حدوداً وأدوات أعلى. لا توجد عمولة على الإيجار، ولا تُودَع أي مبالغ خاصة بالعقد لدى المنصة. العمولة بين المكتب والمالك — إن وُجدت — اتفاق خاص يُسجّل اختيارياً داخل أدوات المكتب دون أن تحصّله المنصة.",
          en: "Owners or offices pay for listing visibility, packages or subscriptions that raise limits and add tools. There is no commission on rent and no rent/deposit money held by the platform. Any office↔owner commission is a private arrangement optionally recorded in the office tools — never collected by Aqar Rent.",
        }}
      />
    </>
  );
}

export function HowSections({ l }: { l: Locale }) {
  return (
    <>
      <Section
        l={l}
        ar="للمستأجر"
        en="For tenants"
        body={{
          ar: "ابحث بالخريطة أو بالفلاتر، راجع مستوى توثيق المالك أو المكتب على بطاقة الإعلان، ثم سجّل الدخول برمز تحقق لإظهار رقم التواصل والموقع الدقيق. يمكنك حفظ المفضلة، ومتابعة الإشعارات، وبدء عقد ومحاضر تسليم مع الطرف الآخر.",
          en: "Search on the map or with filters, check the owner/office trust level on the listing card, then sign in with an OTP to reveal contact details and the exact pin. Save favourites, follow notifications, and start a contract and handover records with the other party.",
        }}
      />
      <Section
        l={l}
        ar="للمالك الفرد"
        en="For individual owners"
        body={{
          ar: "أنشئ إعلاناً من معالج من ست خطوات، ارفع ٣ صور على الأقل، قدّم مستند ملكية أو مرفق، انتظر مراجعة الفريق، ثم اشترِ مدة الظهور. لوحة المالك تعرض المشاهدات والتواصلات والأيام المتبقية، مع إمكانية التجديد أو تحديد الوحدة كمؤجّرة.",
          en: "Create a listing with the 6-step wizard, upload at least 3 photos, submit an ownership/utility document, pass review, then buy visibility. The owner dashboard shows views, contacts and days left, with renew and mark-as-rented actions.",
        }}
      />
      <Section
        l={l}
        ar="للمكاتب العقارية"
        en="For real-estate offices"
        body={{
          ar: "أنشئ صفحة مكتب باسمك وبيانات السجل التجاري، ادعُ الوسطاء بأرقام هواتفهم، اربط كل وحدة بوسيط مسؤول، وتابع العملاء المحتملين عبر مراحل: جديد، تم التواصل، معاينة، عرض، تم الإغلاق. لوحة الأداء تعرض التحويل ومواعيد المتابعة ونصيب كل وسيط — بديل عملي عن واتساب وجداول إكسل.",
          en: "Create a branded office page with commercial-registration data, invite agents by phone, attach a responsible agent to every unit, and track leads through new / contacted / viewing / offer / won. The performance dashboard shows conversion, due follow-ups and per-agent results — a practical replacement for WhatsApp and spreadsheets.",
        }}
      />
    </>
  );
}

export function RulesSections({ l }: { l: Locale }) {
  return (
    <>
      <List
        l={l}
        ar="قواعد الإعلان"
        en="Listing rules"
        items={[
          ["صور حقيقية للوحدة نفسها (٣ إلى ١٥ صورة)، دون أرقام هواتف أو علامات مائية.", "Real photos of the actual unit (3–15), with no phone numbers or watermarks."],
          ["السعر شهري وبالجنيه المصري، ومبلغ التأمين مُعلن بوضوح.", "Price is monthly in EGP and the deposit is clearly stated."],
          ["الموقع والعنوان صحيحان ضمن حدود مصر، والموقع الدقيق يُكشف بعد تسجيل الدخول فقط.", "Location and address are accurate within Egypt; the exact pin is revealed only after login."],
          ["يُمنع تكرار الإعلان أو نشر وحدات للبيع أو إعلانات وسيطة مخفية.", "Duplicate listings, sale-only posts and hidden broker ads are not allowed."],
          ["أي مستند توثيق مزوّر يؤدي إلى رفض الحساب وإحالة البلاغات للمراجعة.", "Forged verification documents lead to account rejection and report review."],
        ]}
      />
      <Section
        l={l}
        ar="المراجعة والاعتراض"
        en="Review and appeals"
        body={{
          ar: "تُراجَع الإعلانات والمستندات يدوياً. عند الرفض نعرض سبباً مُهيكلاً وملاحظة المُراجع، ويمكنك تقديم اعتراض مرة واحدة يُعيد المستند للمراجعة. مستويات التوثيق معروضة للطرف الآخر بشفافية، ولا تعني أبداً فحصاً حكومياً.",
          en: "Listings and documents are reviewed manually. Rejections show a structured reason plus the reviewer's note, and you may file one appeal that reopens review. Trust levels are shown transparently and never imply a government check.",
        }}
      />
    </>
  );
}

export function TermsSections({ l }: { l: Locale }) {
  return (
    <>
      <Section
        l={l}
        ar="١. طبيعة الخدمة"
        en="1. Nature of the service"
        body={{
          ar: "عقار رينت منصة تقنية لعرض وحدات الإيجار وتنظيم مستنداتها. تتيح التواصل المباشر بين المالك والمستأجر، وتتيح كذلك للمكاتب العقارية الموثّقة إدارة وحدات الملاك. المنصة ليست مكتب عقارات، ولا طرفاً في عقد الإيجار، ولا تحصّل أو تحتفظ بالإيجار أو التأمين أو أي عمولة عليه.",
          en: "Aqar Rent is a technology platform for listing rentals and organising their records. It enables direct owner↔tenant contact and lets verified offices manage owners' units. It is not a brokerage, is not a party to any lease, and never collects or holds rent, deposits or rent commission.",
        }}
      />
      <Section
        l={l}
        ar="٢. العقود ومحاضر التسليم (إطار قانوني واضح)"
        en="2. Contracts and handovers (clear legal framing)"
        body={{
          ar: "قوالب العقود المتاحة (سكني مفروش / غير مفروش / تجاري) هي «اتفاقات خاصة» بين الطرفين موقّعة إلكترونياً بتأكيد مزدوج برمز تحقق (OTP) لكل طرف، مع بصمة SHA-256 للنص النهائي، وملف PDF عربي، وصفحة تحقق عامة عبر رمز QR. هذه المستندات ليست عقوداً موثّقة ولا مسجّلة لدى جهة حكومية، وليست سندات تنفيذية، ولا تُغني عن التسجيل أو التوثيق الرسمي أو أي إجراء يقتضيه القانون. لا توجد حالياً في مصر منصة حكومية رقمية لتسجيل الإيجار تُعادل «إيجار» السعودية، ولا تدّعي المنصة أي صلاحية رسمية أو تنفيذية. التحقق من الرقم المرجعي يفيد فقط بوجود السجل وسلامة بصمته، ولا يفيد بصحة الملكية أو التوثيق.",
          en: "Our lease templates (furnished / unfurnished / commercial) are PRIVATE AGREEMENTS between the parties, electronically confirmed with a separate OTP per party, sealed with a SHA-256 hash of the final terms, delivered as an Arabic PDF and verifiable via a public QR page. They are NOT notarized, NOT officially registered, NOT executive instruments, and do NOT replace official registration or notarization. As of 2026, Egypt has no official digital rental registry equivalent to Saudi Ejar; the platform claims no official or executive authority. Verifying a reference only proves the record exists and its hash matches — it does not prove title or notarization.",
        }}
      />
      <Section
        l={l}
        ar="٣. التحقق والمسؤولية"
        en="3. Verification and responsibility"
        body={{
          ar: "مستويات التوثيق (هاتف، هوية، مستندات ملكية، تحقق مميز) تعني مراجعة مستندات بواسطة فريق المنصة فقط. لا نتحقق من السجلات الحكومية، ولا نقدّم استشارة قانونية، ولا نضمن صحة أي إقرار من المستخدم. يقع على الطرفين التحقق من الملكية والصلاحية والتراخيص قبل التوقيع، ويوصى باستشارة محامٍ مصري.",
          en: "Trust levels (phone, identity, ownership documents, premium) only mean documents were reviewed by our team. We do not query government registries, provide legal advice, or guarantee any user representation. Both parties must verify title, authority and licences before signing; consulting an Egyptian lawyer is recommended.",
        }}
      />
      <Section
        l={l}
        ar="٤. الرسوم والاشتراكات"
        en="4. Fees and subscriptions"
        body={{
          ar: "الأسعار معلنة في صفحة الأسعار ومخزّنة في قاعدة البيانات: إعلان أسبوعي، باقات متعددة الأسابيع مع خصم وأولوية ظهور، واشتراكات شهرية للمالكين (وحدات أكثر وتحليلات) والمكاتب (فرق، صفحة بعلامة المكتب، عملاء محتملون، لوحة أداء). الدفع عبر بوابة دفع مرخّصة أو تحويل بنكي يُعتمد يدوياً؛ لا خصم تلقائي ولا احتفاظ ببيانات البطاقة. الاشتراك يمنح حدوداً وأدوات للإعلانات فقط.",
          en: "Prices are published on the pricing page and stored in the database: a weekly ad, discounted multi-week/priority packages, and monthly subscriptions for owners (higher limits, analytics) and offices (teams, branded page, leads, dashboards). Payment goes through a licensed gateway or a manually approved bank transfer; there is no auto-charge and no card storage. Subscriptions only add listing limits and tools.",
        }}
      />
      <Section
        l={l}
        ar="٥. الاستخدام المقبول والإنهاء"
        en="5. Acceptable use and termination"
        body={{
          ar: "يُمنع انتحال صفة مالك أو مكتب، أو نشر مستندات مزوّرة، أو التحايل على قواعد المحتوى، أو محاولة جمع بيانات المستخدمين. قد تُعلَّق الحسابات المخالفة، وتُحفظ السجلات المالية وفق المتطلبات القانونية. للمستخدم تصدير بياناته أو حذف حسابه من صفحة حسابي.",
          en: "Impersonating an owner/office, forged documents, content-rule evasion and scraping are prohibited. Violating accounts may be suspended; financial records are retained as legally required. Users can export or delete their data from My Account.",
        }}
      />
      <Section
        l={l}
        ar="٦. القانون الحاكم"
        en="6. Governing law"
        body={{
          ar: "تخضع هذه الشروط والخدمات لأحكام القانون المدني المصري والتشريعات المعمول بها في جمهورية مصر العربية، وتختص المحاكم المصرية بأي نزاع يتعلق بتشغيل المنصة، دون إخلال بحقوق طرفي عقد الإيجار فيما بينهما.",
          en: "These terms and the service are governed by Egyptian civil law and applicable legislation in the Arab Republic of Egypt; Egyptian courts have jurisdiction over platform disputes, without prejudice to the rights of the lease parties between themselves.",
        }}
      />
    </>
  );
}

export function PrivacySections({ l }: { l: Locale }) {
  return (
    <>
      <Section
        l={l}
        ar="١. ما نجمعه ولماذا"
        en="1. What we collect and why"
        body={{
          ar: "نجمع رقم الهاتف لتسجيل الدخول برمز تحقق، والاسم والبريد الاختياري للملف الشخصي، ومستندات التوثيق لمراجعتها، وبيانات الإعلانات والصور، وسجلات التواصل والتأكيدات، ورموز الإشعارات إن منحت الإذن. لا نجمع بيانات بطاقات الدفع أبداً؛ تتم معالجتها لدى بوابة الدفع المرخّصة.",
          en: "We collect a phone number for OTP login, optional name/email, verification documents for review, listing data and photos, contact/confirmation logs, and push tokens if you grant permission. We never collect card data; it is processed by the licensed payment gateway.",
        }}
      />
      <Section
        l={l}
        ar="٢. بيانات العقود والتسليم"
        en="2. Contract and handover data"
        body={{
          ar: "تُشفَّر أرقام البطاقات الوطنية في العقود عند الحفظ، وتُعرض مُقنّعة في الواجهة، ولا تُسجَّل في السجلات. تُحفظ بنود العقد وبصمتها وسجل التأكيدات (الطرف، الوقت، IP، الجهاز) ومحاضر التسليم ووسائطها لإثبات ما اتفق عليه الطرفان. رقم المرجع وصفحة التحقق العامة لا يكشفان أسماء الأطراف أو أرقامهم الوطنية. مستندات التوثيق تُحذف بعد ٩٠ يوماً من القرار النهائي ما لم يكن هناك بلاغ مفتوح، وسجلات التواصل بعد ١٢ شهراً.",
          en: "National IDs in contracts are encrypted at rest, masked in the API and never logged. Contract terms, their hash, the confirmation log (party, time, IP, device) and handover media are retained as evidence of what both parties agreed. The public reference/verification page never reveals names or national IDs. Verification documents are purged 90 days after a final decision unless a report is open; contact events after 12 months.",
        }}
      />
      <Section
        l={l}
        ar="٣. المشاركة والحقوق"
        en="3. Sharing and your rights"
        body={{
          ar: "لا نبيع بياناتك ولا نشاركها مع أطراف ثالثة إلا مع مزوّدي الخدمة الضروريين (استضافة، تخزين، بوابة دفع، رسائل SMS، إشعارات، تتبّع أخطاء) أو وفق التزام قانوني. يمكنك تصدير بياناتك كاملة أو حذف حسابك من صفحة حسابي؛ تُحوَّل البيانات الشخصية إلى بيانات مجهولة الهوية وتُحفظ السجلات المالية فقط عند اللزوم القانوني.",
          en: "We never sell your data and share it only with necessary processors (hosting, storage, payment gateway, SMS, push, error tracking) or where legally required. You can export all your data or delete your account from My Account; personal data is anonymized and only legally required financial records remain.",
        }}
      />
      <Section
        l={l}
        ar="٤. الأمان"
        en="4. Security"
        body={{
          ar: "تُخزَّن المستندات الخاصة في مساحة تخزين منفصلة بروابط موقّعة قصيرة العمر، وتُطبَّق حدود معدلات على طلبات رمز التحقق والإعلانات والتواصل والمستندات، مع تدقيق كامل لعمليات الدفع وتنبيهات عند فشل الويب هوك. سجلات النظام تُخفي أرقام الهواتف والرموز والبطاقات الوطنية.",
          en: "Private documents live in a separate bucket behind short-lived signed URLs; rate limits apply to OTP, listings, contact reveals, documents and leads. Every payment state change is audit-logged and webhook failures raise alerts. System logs redact phone numbers, tokens and national IDs.",
        }}
      />
      <Section
        l={l}
        ar="٥. تواصل مسؤول حماية البيانات"
        en="5. Contact"
        body={{
          ar: "لأي طلب يتعلق بالخصوصية أو تصحيح البيانات استخدم صفحة الدعم؛ نرد خلال المدد القانونية المعمول بها في قانون حماية البيانات الشخصية المصري.",
          en: "For privacy requests or data corrections use the Support page; we respond within the timelines of the Egyptian Personal Data Protection Law.",
        }}
      />
    </>
  );
}

export function SupportSections({ l }: { l: Locale }) {
  return (
    <>
      <Section
        l={l}
        ar="كيف نساعدك"
        en="How we help"
        body={{
          ar: "فريق الدعم يراجع الإعلانات والمستندات، يعتمد الحوالات البنكية، ويتعامل مع البلاغات وطلبات الاعتراض على الرفض. استخدم نموذج التواصل أدناه أو راسلنا من داخل حسابك ليصلك الرد كإشعار.",
          en: "Our team reviews listings and documents, approves bank transfers and handles reports and rejection appeals. Use the contact form below or message us from your account to receive a notification reply.",
        }}
      />
      <List
        l={l}
        ar="قبل أن تراسلنا"
        en="Before you contact us"
        items={[
          ["للإعلان المرفوض: افتح لوحة المالك لقراءة السبب، ثم أعد التقديم أو قدّم اعتراضاً.", "Rejected listing: check the reason in the owner dashboard, then resubmit or appeal."],
          ["للدفع: أرفق رقم الطلب وصورة الإيصال للحوالات البنكية.", "For payments: include the order number and a receipt image for bank transfers."],
          ["للعقود: جهّز الرقم المرجعي الذي يبدأ بـ AR-.", "For contracts: have the reference number starting with AR- ready."],
        ]}
      />
      <Section
        l={l}
        ar="قنوات التواصل"
        en="Contact channels"
        body={{
          ar: "الدعم عبر نموذج «صفحة الدعم» داخل الحساب، والبريد الإلكتروني المُعلن في بيانات النشر الرسمية عند الإطلاق. لا نطلب منك أبداً إرسال رمز التحقق أو كلمة المرور أو بيانات بطاقتك.",
          en: "Support is available through the in-account form and the email published in the official store listings at launch. We will never ask you to send an OTP, password or card data.",
        }}
      />
    </>
  );
}
