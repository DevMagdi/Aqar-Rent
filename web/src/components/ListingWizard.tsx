"use client";
// Add/Edit listing wizard: 6 steps, draft autosave, client-compressed photos
// with progress/retry/reorder, Arabic validation messages, review + submit.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { compressImage, MAX_PHOTOS, MAX_PHOTO_BYTES, MIN_PHOTOS } from "@/lib/images";
import { uploadWithProgress } from "@/lib/upload";
import { useI18n, useToast } from "./Providers";
import { AMENITY_KEYS, AMENITY_LABEL_KEY } from "@/lib/utils";
import type { ListingDetail, Location, Media } from "@/lib/types";

const MapPicker = dynamic(() => import("./MapPicker"), { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-2xl bg-stone-100" /> });

const PROPERTY_TYPES = ["apartment", "studio", "villa", "room", "shop", "office", "clinic"];
const FURNISHED = ["furnished", "unfurnished", "semi"];
const FINISHINGS = ["not_finished", "semi_finished", "finished", "fully_finished", "deluxe"];

export interface WizardForm {
  title: string;
  property_type: string;
  rental_type: string;
  furnished: string;
  rent_monthly: string;
  deposit_months: string;
  area_m2: string;
  bedrooms: string;
  bathrooms: string;
  floor: string;
  has_elevator: boolean;
  finishing: string;
  building_age: string;
  amenities: Record<string, boolean>;
  description: string;
  governorate_id: string;
  city_id: string;
  district_id: string;
  address_text: string;
  latitude: string;
  longitude: string;
  available_from: string;
  min_term_months: string;
}

const EMPTY_FORM: WizardForm = {
  title: "",
  property_type: "apartment",
  rental_type: "residential",
  furnished: "unfurnished",
  rent_monthly: "",
  deposit_months: "1",
  area_m2: "",
  bedrooms: "2",
  bathrooms: "1",
  floor: "",
  has_elevator: false,
  finishing: "",
  building_age: "",
  amenities: {},
  description: "",
  governorate_id: "",
  city_id: "",
  district_id: "",
  address_text: "",
  latitude: "30.0444",
  longitude: "31.2357",
  available_from: "",
  min_term_months: "1",
};

interface PhotoItem {
  key: string;
  local?: File;
  remote?: Media;
  locked?: boolean; // pre-existing (edit mode)
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

const STEPS = ["w1", "w2", "w3", "w4", "w5", "w6"] as const;

function toPayload(f: WizardForm): Record<string, unknown> {
  const num = (v: string) => (v === "" ? null : Number(v));
  return {
    title: f.title.trim(),
    property_type: f.property_type,
    rental_type: f.rental_type,
    furnished: f.furnished,
    rent_monthly: Number(f.rent_monthly),
    deposit_months: Number(f.deposit_months || 0),
    area_m2: Number(f.area_m2),
    bedrooms: Number(f.bedrooms || 0),
    bathrooms: Number(f.bathrooms || 0),
    floor: num(f.floor),
    has_elevator: f.has_elevator,
    finishing: f.finishing || null,
    building_age: num(f.building_age),
    amenities: Object.fromEntries(Object.entries(f.amenities).filter(([, v]) => v)),
    description: f.description,
    governorate_id: f.governorate_id,
    city_id: f.city_id,
    district_id: f.district_id || null,
    address_text: f.address_text,
    latitude: Number(f.latitude),
    longitude: Number(f.longitude),
    available_from: f.available_from || null,
    min_term_months: Number(f.min_term_months || 1),
  };
}

export function ListingWizard({ locale, editId }: { locale: string; editId?: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const router = useRouter();
  const isEdit = Boolean(editId);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  const [listingId, setListingId] = useState<string | null>(editId ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(isEdit);

  const [govs, setGovs] = useState<Location[]>([]);
  const [cities, setCities] = useState<Location[]>([]);
  const [districts, setDistricts] = useState<Location[]>([]);
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);

  const saveTimer = useRef<number | undefined>(undefined);
  const dragIndex = useRef<number | null>(null);

  // MSG — validation copy (Arabic primary per spec, English secondary)
  const MSG = useMemo(
    () =>
      locale === "ar"
        ? {
            required: "هذا الحقل مطلوب",
            title: "العنوان 3 أحرف على الأقل",
            rent: "الإيجار بين 100 و10,000,000 جنيه",
            area: "المساحة أكبر من صفر",
            range: "قيمة خارج النطاق المسموح",
            coords: "أدخل إحداثيات صحيحة داخل مصر (21.5–32 شمالاً، 24–37.5 شرقاً)",
            address: "العنوان 3 أحرف على الأقل",
            photos: `عدد الصور من ${MIN_PHOTOS} إلى ${MAX_PHOTOS} صور`,
            desc: "الوصف مطلوب (10 أحرف على الأقل)",
            pickCity: "اختر المدينة",
            pickGov: "اختر المحافظة",
          }
        : {
            required: "This field is required",
            title: "Title must be at least 3 characters",
            rent: "Rent must be between 100 and 10,000,000 EGP",
            area: "Area must be greater than zero",
            range: "Value out of allowed range",
            coords: "Enter valid coordinates inside Egypt (21.5–32 lat, 24–37.5 lng)",
            address: "Address must be at least 3 characters",
            photos: `Upload between ${MIN_PHOTOS} and ${MAX_PHOTOS} photos`,
            desc: "Description is required (min 10 characters)",
            pickCity: "Pick a city",
            pickGov: "Pick a governorate",
          },
    [locale],
  );

  const storageKey = `aqar.wizard.${editId || "new"}`;

  // ── init: locations + (edit) existing listing + (new) restored draft ──
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [g] = await Promise.all([api<Location[]>("/locations?level=governorate", { anonymous: true })]);
        if (!alive) return;
        setGovs(g);
        if (isEdit && editId) {
          const d = await api<ListingDetail>(`/listings/${editId}`);
          if (!alive) return;
          setForm({
            title: d.title,
            property_type: d.property_type,
            rental_type: d.rental_type,
            furnished: d.furnished,
            rent_monthly: String(d.rent_monthly),
            deposit_months: String(d.deposit_months),
            area_m2: String(d.area_m2),
            bedrooms: String(d.bedrooms),
            bathrooms: String(d.bathrooms),
            floor: d.floor === null ? "" : String(d.floor),
            has_elevator: d.has_elevator,
            finishing: d.finishing || "",
            building_age: d.building_age === null ? "" : String(d.building_age),
            amenities: d.amenities || {},
            description: d.description || "",
            governorate_id: d.governorate_id,
            city_id: d.city_id,
            district_id: d.district_id || "",
            address_text: d.address_text,
            latitude: String(d.geo.latitude),
            longitude: String(d.geo.longitude),
            available_from: d.available_from ? String(d.available_from).slice(0, 10) : "",
            min_term_months: String(d.min_term_months),
          });
          setPhotos(
            d.media.map((m) => ({ key: m.id, remote: m, locked: true, progress: 100, status: "done" as const })),
          );
        } else {
          try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
              const saved = JSON.parse(raw) as { form: WizardForm; step: number };
              if (saved.form) setForm({ ...EMPTY_FORM, ...saved.form });
              if (typeof saved.step === "number") setStep(Math.min(saved.step, STEPS.length - 1));
            }
          } catch {
            /* ignore corrupt draft */
          }
        }
      } catch (e) {
        if (alive) setLoadErr(e instanceof ApiError ? e.message : t("error_generic"));
      } finally {
        if (alive) setInitialLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // cities / districts cascading
  useEffect(() => {
    if (!form.governorate_id) return setCities([]);
    let alive = true;
    api<Location[]>(`/locations?parent_id=${form.governorate_id}`, { anonymous: true })
      .then((c) => alive && setCities(c))
      .catch(() => alive && setCities([]));
    return () => {
      alive = false;
    };
  }, [form.governorate_id]);

  useEffect(() => {
    if (!form.city_id) return setDistricts([]);
    let alive = true;
    api<Location[]>(`/locations?parent_id=${form.city_id}`, { anonymous: true })
      .then((d) => alive && setDistricts(d))
      .catch(() => alive && setDistricts([]));
    return () => {
      alive = false;
    };
  }, [form.city_id]);

  // ── autosave ──────────────────────────────────────────────────────────
  const scheduleSave = useCallback(
    (nextForm: WizardForm, nextStep: number) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ form: nextForm, step: nextStep }));
      } catch {
        /* quota */
      }
      if (!listingId) return;
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(async () => {
        setSaving(true);
        try {
          await api(`/listings/${listingId}`, { method: "PATCH", body: toPayload(nextForm) });
          setSavedTick(true);
          setTimeout(() => setSavedTick(false), 2500);
        } catch {
          /* keep local draft; next change retries */
        } finally {
          setSaving(false);
        }
      }, 700);
    },
    [listingId, storageKey],
  );

  const update = (patch: Partial<WizardForm>) => {
    const next = { ...form, ...patch };
    setForm(next);
    scheduleSave(next, step);
  };

  // ── validation ─────────────────────────────────────────────────────────
  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    const f = form;
    const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi;
    if (s === 0) {
      if (f.title.trim().length < 3) e.title = MSG.title;
      if (!inRange(Number(f.rent_monthly), 100, 10_000_000)) e.rent_monthly = MSG.rent;
      if (f.deposit_months !== "" && !inRange(Number(f.deposit_months), 0, 24)) e.deposit_months = MSG.range;
    }
    if (s === 1) {
      if (!(Number(f.area_m2) > 0)) e.area_m2 = MSG.area;
      if (f.bedrooms !== "" && !inRange(Number(f.bedrooms), 0, 30)) e.bedrooms = MSG.range;
      if (f.bathrooms !== "" && !inRange(Number(f.bathrooms), 0, 30)) e.bathrooms = MSG.range;
      if (f.floor !== "" && !inRange(Number(f.floor), -5, 100)) e.floor = MSG.range;
      if (f.building_age !== "" && !inRange(Number(f.building_age), 0, 300)) e.building_age = MSG.range;
    }
    if (s === 2) {
      if (!f.governorate_id) e.governorate_id = MSG.pickGov;
      if (!f.city_id) e.city_id = MSG.pickCity;
      if (f.address_text.trim().length < 3) e.address_text = MSG.address;
      const lat = Number(f.latitude);
      const lng = Number(f.longitude);
      if (!inRange(lat, 21.5, 32.0) || !inRange(lng, 24.0, 37.5)) e.latitude = MSG.coords;
    }
    if (s === 3) {
      // Photos: count staged items; actual uploads run (with progress/retry)
      // right after this validation passes, inside go().
      if (photos.length < MIN_PHOTOS || photos.length > MAX_PHOTOS) e.photos = MSG.photos;
    }
    if (s === 4) {
      if (f.description.trim().length < 10) e.description = MSG.desc;
      if (f.description.length > 5000) e.description = "≤ 5000";
    }
    if (s === 5 && f.min_term_months !== "" && !inRange(Number(f.min_term_months), 1, 36)) e.min_term_months = MSG.range;
    return e;
  }

  // ── create draft when leaving location step ───────────────────────────
  async function ensureCreated(): Promise<string | null> {
    if (listingId) return listingId;
    try {
      const created = await api<ListingDetail>("/listings", { method: "POST", body: toPayload(form) });
      setListingId(created.id);
      localStorage.setItem(`aqar.wizard.${created.id}`, JSON.stringify({ form, step }));
      localStorage.removeItem("aqar.wizard.new");
      return created.id;
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : t("error_generic"), "err");
      return null;
    }
  }

  async function uploadPending(): Promise<boolean> {
    const id = await ensureCreated();
    if (!id) return false;
    const queue = photos.filter((p) => p.status === "pending" || p.status === "error");
    if (queue.length === 0) return true;
    setPhotoBusy(true);
    try {
      for (const item of queue) {
        if (!item.local) continue;
        setPhotos((prev) => prev.map((p) => (p.key === item.key ? { ...p, status: "uploading", progress: 0, error: undefined } : p)));
        try {
          const fd = new FormData();
          fd.append("file", item.local, item.local.name);
          fd.append("media_type", "photo");
          const { promise } = uploadWithProgress(`/listings/${id}/media`, fd, (pct) => {
            setPhotos((prev) => prev.map((p) => (p.key === item.key ? { ...p, progress: pct } : p)));
          });
          const media = (await promise) as Media;
          setPhotos((prev) => prev.map((p) => (p.key === item.key ? { ...p, remote: media, status: "done", progress: 100 } : p)));
        } catch (e) {
          setPhotos((prev) =>
            prev.map((p) => (p.key === item.key ? { ...p, status: "error", error: e instanceof Error ? e.message : "error" } : p)),
          );
          setPhotoBusy(false);
          return false;
        }
      }
      return true;
    } finally {
      setPhotoBusy(false);
    }
  }

  async function go(delta: number) {
    if (delta > 0) {
      const e = validate(step);
      setErrors(e);
      if (Object.keys(e).length > 0) return;
      if (step === 2) {
        const id = await ensureCreated();
        if (!id) return;
      }
      if (step === 3) {
        const ok = await uploadPending();
        if (!ok) return;
      }
    } else {
      setErrors({});
    }
    const next = Math.max(0, Math.min(STEPS.length - 1, step + delta));
    setStep(next);
    scheduleSave(form, next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length > 0 || !listingId) return;
    setSubmitting(true);
    try {
      await api(`/listings/${listingId}/submit`, { method: "POST" });
      localStorage.removeItem(storageKey);
      localStorage.removeItem(`aqar.wizard.${listingId}`);
      setSubmitted(true);
      toast.show(t("submit_review"));
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : t("error_generic"), "err");
    } finally {
      setSubmitting(false);
    }
  }

  // ── photos ────────────────────────────────────────────────────────────
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    const room = MAX_PHOTOS - photos.filter((p) => p.status === "done" || p.status === "pending").length;
    if (room <= 0) {
      toast.show(MSG.photos, "err");
      return;
    }
    const picked = Array.from(files).slice(0, room);
    const items: PhotoItem[] = [];
    for (const f of picked) {
      try {
        const c = await compressImage(f);
        if (c.size > MAX_PHOTO_BYTES) {
          toast.show(`${f.name}: ${MSG.photos}`, "err");
          continue;
        }
        items.push({ key: `${Date.now()}-${Math.random().toString(36).slice(2)}`, local: c, progress: 0, status: "pending" });
      } catch {
        toast.show(`${f.name}: ${t("error_generic")}`, "err");
      }
    }
    setPhotos((prev) => [...prev, ...items]);
  }

  function removePhoto(key: string) {
    const item = photos.find((p) => p.key === key);
    if (item?.locked && item.remote) {
      api(`/listings/${listingId}/media/${item.remote.id}`, { method: "DELETE" }).catch(() => {});
    }
    setPhotos((prev) => prev.filter((p) => p.key !== key));
  }

  function movePhoto(idx: number, dir: -1 | 1) {
    setPhotos((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  // ── render ────────────────────────────────────────────────────────────
  if (initialLoading) {
    return <div className="mx-auto h-96 max-w-3xl animate-pulse rounded-3xl bg-stone-200" data-testid="wizard-loading" />;
  }
  if (loadErr) {
    return (
      <div className="mx-auto max-w-3xl rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700" role="alert">
        {loadErr}
      </div>
    );
  }
  if (submitted) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-center" data-testid="wizard-submitted">
        <p className="text-3xl">✓</p>
        <h1 className="mt-2 text-xl font-bold text-emerald-900">{t("submit_review")}</h1>
        <p className="mt-2 text-sm text-emerald-700">{t("submit_hint")}</p>
        <Link href={`/${locale}/owner`} className="mt-5 inline-block rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700">
          {t("dashboard_title")}
        </Link>
      </div>
    );
  }

  const inputCls = "mt-1 w-full rounded-xl border border-stone-300 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500";
  const errCls = "mt-1 text-xs font-semibold text-red-600";
  const labelCls = "block text-sm font-semibold text-stone-700";

  const field = (name: string, node: React.ReactNode) => (
    <div>
      {node}
      {errors[name] && (
        <p className={errCls} role="alert" data-testid={`err-${name}`}>
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl" data-testid="listing-wizard" data-step={step}>
      {/* progress */}
      <ol className="mb-6 flex items-center justify-between gap-1" aria-label={`${t("step")} ${step + 1} ${t("of")} ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1">
            <div
              data-testid={`step-dot-${i}`}
              className={`h-1.5 rounded-full ${i <= step ? "bg-brand-600" : "bg-stone-200"}`}
              title={t(s)}
            />
            <p className={`mt-1 hidden text-[11px] sm:block ${i === step ? "font-bold text-brand-700" : "text-stone-400"}`}>{t(s)}</p>
          </li>
        ))}
      </ol>
      <p className="mb-3 text-sm font-semibold text-stone-500">
        {t("step")} {step + 1} {t("of")} {STEPS.length} — <span data-testid="step-name">{t(STEPS[step])}</span>
        {saving && <span className="ms-2 text-xs text-stone-400">…</span>}
        {savedTick && <span className="ms-2 text-xs text-emerald-600">✓ {t("draft_saved")}</span>}
      </p>

      <div className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6">
        {/* ── STEP 1: basics ─────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-4" data-testid="step-basics">
            <div>
              <label className={labelCls} htmlFor="w-title">
                {t("title_label")} *
              </label>
              {field(
                "title",
                <input id="w-title" data-testid="input-title" className={inputCls} maxLength={200} value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder={t("title_ph")} />,
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="w-type">
                  {t("property_type")}
                </label>
                <select id="w-type" data-testid="select-property-type" className={inputCls} value={form.property_type} onChange={(e) => update({ property_type: e.target.value })}>
                  {PROPERTY_TYPES.map((x) => (
                    <option key={x} value={x}>
                      {t(`spec.${x}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="w-rental">
                  {t("rental_type")}
                </label>
                <select id="w-rental" data-testid="select-rental-type" className={inputCls} value={form.rental_type} onChange={(e) => update({ rental_type: e.target.value })}>
                  <option value="residential">{t("spec.residential")}</option>
                  <option value="commercial">{t("spec.commercial")}</option>
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="w-furn">
                  {t("furnished")}
                </label>
                <select id="w-furn" data-testid="select-furnished" className={inputCls} value={form.furnished} onChange={(e) => update({ furnished: e.target.value })}>
                  {FURNISHED.map((x) => (
                    <option key={x} value={x}>
                      {t(`spec.${x}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="w-rent">
                  {t("rent_label")} *
                </label>
                {field(
                  "rent_monthly",
                  <input id="w-rent" data-testid="input-rent" type="number" inputMode="numeric" min={100} className={inputCls} value={form.rent_monthly} onChange={(e) => update({ rent_monthly: e.target.value })} />,
                )}
              </div>
              <div>
                <label className={labelCls} htmlFor="w-deposit">
                  {t("deposit_label")}
                </label>
                {field(
                  "deposit_months",
                  <input id="w-deposit" type="number" min={0} max={24} className={inputCls} value={form.deposit_months} onChange={(e) => update({ deposit_months: e.target.value })} />,
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: specs ──────────────────────────────── */}
        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-2" data-testid="step-specs">
            <div>
              <label className={labelCls} htmlFor="w-area">
                {t("area_m2")} *
              </label>
              {field("area_m2", <input id="w-area" data-testid="input-area" type="number" step="0.5" className={inputCls} value={form.area_m2} onChange={(e) => update({ area_m2: e.target.value })} />)}
            </div>
            <div>
              <label className={labelCls} htmlFor="w-bed">
                {t("bedrooms")}
              </label>
              {field("bedrooms", <input id="w-bed" data-testid="input-bedrooms" type="number" min={0} max={30} className={inputCls} value={form.bedrooms} onChange={(e) => update({ bedrooms: e.target.value })} />)}
            </div>
            <div>
              <label className={labelCls} htmlFor="w-bath">
                {t("bathrooms")}
              </label>
              {field("bathrooms", <input id="w-bath" type="number" min={0} max={30} className={inputCls} value={form.bathrooms} onChange={(e) => update({ bathrooms: e.target.value })} />)}
            </div>
            <div>
              <label className={labelCls} htmlFor="w-floor">
                {t("floor")}
              </label>
              {field("floor", <input id="w-floor" data-testid="input-floor" type="number" className={inputCls} value={form.floor} onChange={(e) => update({ floor: e.target.value })} />)}
            </div>
            <div>
              <label className={labelCls} htmlFor="w-finish">
                {t("finishing")}
              </label>
              <select id="w-finish" className={inputCls} value={form.finishing} onChange={(e) => update({ finishing: e.target.value })}>
                <option value="">—</option>
                {FINISHINGS.map((x) => (
                  <option key={x} value={x}>
                    {x.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="w-age">
                {t("building_age")}
              </label>
              {field("building_age", <input id="w-age" type="number" min={0} max={300} className={inputCls} value={form.building_age} onChange={(e) => update({ building_age: e.target.value })} />)}
            </div>
            <label className="flex items-center gap-2 text-sm font-semibold text-stone-700 sm:col-span-2">
              <input type="checkbox" data-testid="input-elevator" checked={form.has_elevator} onChange={(e) => update({ has_elevator: e.target.checked })} className="h-4 w-4 accent-brand-600" />
              {t("elevator")}
            </label>
            <div className="sm:col-span-2">
              <span className={labelCls}>{t("amenities_labels")}</span>
              <div className="mt-2 flex flex-wrap gap-2" data-testid="amenities-picker">
                {AMENITY_KEYS.map((a) => (
                  <button
                    key={a}
                    type="button"
                    data-testid={`amenity-${a}`}
                    aria-pressed={!!form.amenities[a]}
                    onClick={() => update({ amenities: { ...form.amenities, [a]: !form.amenities[a] } })}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${form.amenities[a] ? "border-brand-600 bg-brand-50 text-brand-700" : "border-stone-300 text-stone-600"}`}
                  >
                    {t(AMENITY_LABEL_KEY[a] || a)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: location ───────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4" data-testid="step-location">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="w-gov">
                  {t("gov_label")} *
                </label>
                {field(
                  "governorate_id",
                  <select id="w-gov" data-testid="select-governorate" className={inputCls} value={form.governorate_id} onChange={(e) => update({ governorate_id: e.target.value, city_id: "", district_id: "" })}>
                    <option value="">—</option>
                    {govs.map((g) => (
                      <option key={g.id} value={g.id}>
                        {locale === "ar" ? g.name_ar : g.name_en}
                      </option>
                    ))}
                  </select>,
                )}
              </div>
              <div>
                <label className={labelCls} htmlFor="w-city">
                  {t("city_label")} *
                </label>
                {field(
                  "city_id",
                  <select id="w-city" data-testid="select-city" className={inputCls} value={form.city_id} onChange={(e) => update({ city_id: e.target.value, district_id: "" })}>
                    <option value="">—</option>
                    {cities.map((c) => (
                      <option key={c.id} value={c.id}>
                        {locale === "ar" ? c.name_ar : c.name_en}
                      </option>
                    ))}
                  </select>,
                )}
              </div>
              {districts.length > 0 && (
                <div>
                  <label className={labelCls} htmlFor="w-district">
                    {t("district_label")}
                  </label>
                  <select id="w-district" className={inputCls} value={form.district_id} onChange={(e) => update({ district_id: e.target.value })}>
                    <option value="">—</option>
                    {districts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {locale === "ar" ? d.name_ar : d.name_en}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="w-address">
                {t("address_label")} *
              </label>
              {field("address_text", <input id="w-address" data-testid="input-address" className={inputCls} maxLength={300} value={form.address_text} onChange={(e) => update({ address_text: e.target.value })} placeholder={t("address_ph")} />)}
            </div>
            <div>
              <p className={labelCls}>{t("pin_label")}</p>
              <div className="mt-2 overflow-hidden rounded-2xl border border-stone-200">
                <MapPicker
                  lat={Number(form.latitude) || 30.0444}
                  lng={Number(form.longitude) || 31.2357}
                  onPick={(lat, lng) => update({ latitude: lat.toFixed(6), longitude: lng.toFixed(6) })}
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-stone-500" htmlFor="w-lat">
                    {t("lat")}
                  </label>
                  {field("latitude", <input id="w-lat" data-testid="input-latitude" dir="ltr" inputMode="decimal" className={inputCls} value={form.latitude} onChange={(e) => update({ latitude: e.target.value })} />)}
                </div>
                <div>
                  <label className="text-xs font-semibold text-stone-500" htmlFor="w-lng">
                    {t("lng")}
                  </label>
                  {field("longitude", <input id="w-lng" data-testid="input-longitude" dir="ltr" inputMode="decimal" className={inputCls} value={form.longitude} onChange={(e) => update({ longitude: e.target.value })} />)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: photos ─────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4" data-testid="step-photos">
            <div>
              <p className={labelCls}>{t("photos_label")}</p>
              <p className="mt-1 text-xs text-stone-500">{t("photos_hint")}</p>
            </div>
            <input
              ref={(el) => {
                if (el) el.setAttribute("data-testid", "input-photos");
              }}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="block w-full text-sm text-stone-600 file:me-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
              onChange={(e) => {
                void addFiles(e.target.files);
                e.currentTarget.value = "";
              }}
            />
            {errors.photos && (
              <p className={errCls} role="alert" data-testid="err-photos">
                {errors.photos}
              </p>
            )}

            <ul className="space-y-2" data-testid="photo-list">
              {photos.map((p, i) => (
                <li
                  key={p.key}
                  data-testid="photo-item"
                  data-status={p.status}
                  draggable={!p.locked}
                  onDragStart={() => (dragIndex.current = i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    const from = dragIndex.current;
                    if (from === null || from === i) return;
                    setPhotos((prev) => {
                      const next = [...prev];
                      const [moved] = next.splice(from, 1);
                      next.splice(i, 0, moved);
                      return next;
                    });
                    dragIndex.current = null;
                  }}
                  className="flex items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 p-2"
                >
                  <span className="cursor-grab select-none text-stone-400" title={t("reorder")} aria-hidden>
                    ⠿
                  </span>
                  <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-stone-200 text-xs text-stone-500">
                    {p.remote?.thumb_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.remote.thumb_url} alt="" className="h-full w-full object-cover" />
                    ) : p.local ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={URL.createObjectURL(p.local)} alt="" className="h-full w-full object-cover" />
                    ) : (
                      "🖼"
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-stone-700">
                      {i === 0 && p.status === "done" && <span className="me-1 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] text-brand-700">{t("cover")}</span>}
                      {p.local?.name || p.remote?.id?.slice(0, 8)}
                    </p>
                    {p.status === "uploading" && (
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                        <div className="h-full bg-brand-600 transition-all" style={{ width: `${p.progress}%` }} />
                      </div>
                    )}
                    {p.status === "error" && <p className="mt-0.5 text-[11px] font-semibold text-red-600">{p.error || t("upload_failed")}</p>}
                    {p.status === "done" && <p className="mt-0.5 text-[11px] text-emerald-600">✓</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    {p.status === "error" && (
                      <button
                        type="button"
                        data-testid="photo-retry"
                        onClick={() => setPhotos((prev) => prev.map((x) => (x.key === p.key ? { ...x, status: "pending" } : x)))}
                        className="rounded-lg border border-stone-300 px-2 py-1 text-xs font-semibold text-stone-600"
                      >
                        {t("upload_retry")}
                      </button>
                    )}
                    <button type="button" aria-label="up" onClick={() => movePhoto(i, -1)} disabled={i === 0} className="rounded-lg border border-stone-300 px-2 py-1 text-xs disabled:opacity-30">
                      ↑
                    </button>
                    <button type="button" aria-label="down" onClick={() => movePhoto(i, 1)} disabled={i === photos.length - 1} className="rounded-lg border border-stone-300 px-2 py-1 text-xs disabled:opacity-30">
                      ↓
                    </button>
                    <button type="button" aria-label={t("remove")} data-testid="photo-remove" onClick={() => removePhoto(p.key)} className="rounded-lg border border-red-200 px-2 py-1 text-xs text-red-600">
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="text-xs text-stone-500" data-testid="photo-count">
              {photos.filter((p) => p.status !== "error").length}/{MAX_PHOTOS}
            </p>
            {photoBusy && <p className="text-sm font-semibold text-brand-600">{t("loading_upload")}</p>}
          </div>
        )}

        {/* ── STEP 5: description ────────────────────────── */}
        {step === 4 && (
          <div data-testid="step-description">
            <label className={labelCls} htmlFor="w-desc">
              {t("description")} *
            </label>
            {field(
              "description",
              <textarea
                id="w-desc"
                data-testid="input-description"
                rows={8}
                maxLength={5000}
                className={inputCls + " min-h-48"}
                value={form.description}
                onChange={(e) => update({ description: e.target.value })}
              />,
            )}
            <p className="mt-1 text-xs text-stone-400">{form.description.length}/5000</p>
          </div>
        )}

        {/* ── STEP 6: review ─────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-4" data-testid="step-review">
            <h2 className="text-lg font-bold text-stone-900">{t("review_submit")}</h2>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {[
                [t("title_label"), form.title],
                [t("rent_label"), form.rent_monthly],
                [t("property_type"), t(`spec.${form.property_type}`)],
                [t("furnished"), t(`spec.${form.furnished}`)],
                [t("area_m2"), form.area_m2],
                [t("bedrooms"), form.bedrooms],
                [t("address_label"), form.address_text],
                [t("min_term"), `${form.min_term_months} ${t("month_s")}`],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-stone-100 py-1.5">
                  <dt className="text-stone-500">{k}</dt>
                  <dd className="truncate font-semibold text-stone-800">{v || "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-wrap gap-2">
              {photos
                .filter((p) => p.remote)
                .map((p) => (
                  <span key={p.key} className="h-14 w-14 overflow-hidden rounded-lg bg-stone-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.remote!.thumb_url || p.remote!.url} alt="" className="h-full w-full object-cover" />
                  </span>
                ))}
            </div>
            <div>
              <label className={labelCls} htmlFor="w-minterm">
                {t("min_term")}
              </label>
              {field("min_term_months", <input id="w-minterm" type="number" min={1} max={36} className={inputCls} value={form.min_term_months} onChange={(e) => update({ min_term_months: e.target.value })} />)}
            </div>
            <p className="rounded-xl bg-brand-50 p-3 text-xs text-brand-700">{t("submit_hint")}</p>
            <button
              type="button"
              data-testid="btn-submit-listing"
              disabled={submitting}
              onClick={submit}
              className="w-full rounded-xl bg-emerald-600 py-3 font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {submitting ? t("loading") : t("submit_review")}
            </button>
          </div>
        )}
      </div>

      {/* nav */}
      {!submitted && (
        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            type="button"
            data-testid="btn-prev"
            onClick={() => go(-1)}
            disabled={step === 0}
            className="rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-40"
          >
            → {t("prev")}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              data-testid="btn-next"
              onClick={() => go(1)}
              disabled={photoBusy}
              className="rounded-xl bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {t("next")} ←
            </button>
          ) : (
            <span className="text-xs text-stone-400">{t("review_submit")}</span>
          )}
        </div>
      )}
      <p className="mt-4 text-center">
        <Link href={`/${locale}/owner`} className="text-sm text-stone-500 hover:underline">
          ← {t("dashboard_title")}
        </Link>
      </p>
    </div>
  );
}
