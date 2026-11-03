"use client";
// Handover editor: create/edit check-in or check-out (rooms, items, meters,
// keys, inventory, comments) with media upload (progress + retry) and OTP confirm.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { uploadWithProgress } from "@/lib/upload";
import { useI18n, useToast } from "../Providers";
import { OtpConfirmModal } from "./OtpConfirmModal";
import {
  CONDITIONS,
  METER_KEYS,
  ROOM_NAMES,
  downloadAuthed,
  emptyHandoverData,
  type Handover,
  type HandoverData,
  type HandoverItem,
  type HandoverRoom,
} from "@/lib/contracts";

export function HandoverEditor({
  contractId,
  existing,
  sourceCheckInId,
  kind,
  onClose,
  onSaved,
}: {
  contractId: string;
  existing?: Handover | null;
  sourceCheckInId?: string | null;
  kind: "check_in" | "check_out";
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale, t } = useI18n();
  const toast = useToast();
  const [data, setData] = useState<HandoverData>(existing ? JSON.parse(JSON.stringify(existing.data)) : emptyHandoverData());
  const [handoverId, setHandoverId] = useState<string | null>(existing?.id ?? null);
  const [status, setStatus] = useState(existing?.status ?? "draft");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [media, setMedia] = useState(existing?.media ?? []);
  const [uploads, setUploads] = useState<{ key: string; name: string; pct: number; error?: string; file?: File; room: string }[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mediaRoom, setMediaRoom] = useState<string>("living_room");
  const [comment, setComment] = useState(existing?.data.comments ? Object.values(existing.data.comments)[0] || "" : "");

  const roomLabel = useCallback((name: string) => (t(`room_${name}`) !== `room_${name}` ? t(`room_${name}`) : name.replace(/_/g, " ")), [t]);

  function patchData(p: Partial<HandoverData>) {
    setData((prev) => ({ ...prev, ...p }));
  }

  function patchRoom(idx: number, p: Partial<HandoverRoom>) {
    setData((prev) => {
      const rooms = [...prev.rooms];
      rooms[idx] = { ...rooms[idx], ...p };
      return { ...prev, rooms };
    });
  }

  function patchItem(roomIdx: number, itemIdx: number, p: Partial<HandoverItem>) {
    setData((prev) => {
      const rooms = [...prev.rooms];
      const items = [...rooms[roomIdx].items];
      items[itemIdx] = { ...items[itemIdx], ...p };
      rooms[roomIdx] = { ...rooms[roomIdx], items };
      return { ...prev, rooms };
    });
  }

  async function save(): Promise<string> {
    setBusy(true);
    setErr(null);
    try {
      const payload = { ...data, comments: comment ? { ...(data.comments || {}), note: comment } : data.comments || {} };
      let id = handoverId;
      if (!id) {
        const created = await api<Handover>(`/contracts/${contractId}/handovers`, {
          method: "POST",
          body: { kind, source_handover_id: sourceCheckInId ?? null, data: payload },
        });
        id = created.id;
        setHandoverId(id);
        setMedia(created.media);
        // check-out: server copies the source check-in structure → refresh form
        setData(JSON.parse(JSON.stringify(created.data)));
      } else {
        const updated = await api<Handover>(`/handovers/${id}`, { method: "PATCH", body: { data: payload } });
        setMedia(updated.media);
        setData(JSON.parse(JSON.stringify(updated.data)));
      }
      toast.show(t("saved"));
      return id!;
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : t("error_generic"));
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function addMedia(files: FileList | null) {
    if (!files?.length || !handoverId) {
      if (!handoverId) await save();
    }
    const id = handoverId || (await save());
    for (const file of Array.from(files || [])) {
      const key = `${Date.now()}-${file.name}`;
      setUploads((p) => [...p, { key, name: file.name, pct: 0, room: mediaRoom, file }]);
      try {
        const fd = new FormData();
        fd.append("file", file, file.name);
        fd.append("room", mediaRoom);
        const { promise } = uploadWithProgress(`/handovers/${id}/media`, fd, (pct) =>
          setUploads((p) => p.map((u) => (u.key === key ? { ...u, pct } : u))),
        );
        const created = (await promise) as (typeof media)[number];
        setMedia((p) => [...p, created]);
        setUploads((p) => p.filter((u) => u.key !== key));
      } catch (e) {
        setUploads((p) => p.map((u) => (u.key === key ? { ...u, error: (e as Error).message } : u)));
      }
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  async function confirmWithOtp(code: string) {
    if (!handoverId) throw new Error(t("error_generic"));
    const updated = await api<Handover>(`/handovers/${handoverId}/confirm`, { method: "POST", body: { otp_code: code } });
    setStatus(updated.status);
    toast.show(t("handover_confirmed_banner"));
    onSaved();
  }

  const inputCls = "w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-gold";
  const condLabel = (c: string | null) => (c ? t(`cond.${c}`) : "—");
  const isConfirmed = status === "confirmed";

  return (
    <div className="fixed inset-0 z-[800] overflow-y-auto bg-black/40 p-3 sm:p-6" role="dialog" aria-modal="true" onClick={onClose}>
      <div
        className="mx-auto max-w-3xl rounded-3xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
        data-testid="handover-editor"
        data-kind={kind}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-900">
            {kind === "check_in" ? t("new_checkin") : t("new_checkout")}
            {existing?.hash ? ` · ${existing.hash.slice(0, 12)}…` : ""}
          </h2>
          <button type="button" onClick={onClose} aria-label="close" className="rounded-lg p-2 text-stone-400 hover:bg-stone-100">
            ✕
          </button>
        </div>

        {isConfirmed && (
          <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800" data-testid="handover-confirmed-banner">
            ✓ {t("handover_confirmed_banner")}
          </p>
        )}

        {/* rooms */}
        <section className="mt-4 space-y-4">
          {data.rooms.map((room, ri) => (
            <div key={ri} className="rounded-2xl border border-stone-200 p-3" data-testid={`room-${room.name}`}>
              <div className="flex items-center justify-between gap-2">
                <select
                  aria-label={t("room_field")}
                  className="text-sm font-bold text-stone-800"
                  value={room.name}
                  disabled={isConfirmed}
                  onChange={(e) => patchRoom(ri, { name: e.target.value })}
                >
                  {ROOM_NAMES.map((rn) => (
                    <option key={rn} value={rn}>
                      {roomLabel(rn)}
                    </option>
                  ))}
                </select>
                {!isConfirmed && (
                  <button
                    type="button"
                    data-testid={`add-item-${room.name}`}
                    onClick={() => patchRoom(ri, { items: [...room.items, { label: "", condition: "good", note: "" }] })}
                    className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-semibold text-stone-600"
                  >
                    + {t("add_item")}
                  </button>
                )}
              </div>
              <div className="mt-2 space-y-2">
                {room.items.map((item, ii) => (
                  <div key={ii} className="grid grid-cols-[1fr_auto_auto] items-center gap-2" data-testid={`item-${room.name}-${ii}`}>
                    <input
                      aria-label={t("item_label")}
                      className={inputCls}
                      placeholder={t("item_label")}
                      value={item.label}
                      disabled={isConfirmed}
                      onChange={(e) => patchItem(ri, ii, { label: e.target.value })}
                    />
                    <select
                      aria-label={t("item_condition")}
                      className={inputCls + " w-36"}
                      value={item.condition ?? ""}
                      disabled={isConfirmed}
                      onChange={(e) => patchItem(ri, ii, { condition: (e.target.value || null) as HandoverItem["condition"] })}
                    >
                      <option value="">—</option>
                      {CONDITIONS.map((c) => (
                        <option key={c} value={c}>
                          {condLabel(c)}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label={t("item_note")}
                      className={inputCls + " w-40"}
                      placeholder={t("item_note")}
                      value={item.note}
                      disabled={isConfirmed}
                      onChange={(e) => patchItem(ri, ii, { note: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {/* meters + keys + inventory */}
        <section className="mt-4 grid gap-3 sm:grid-cols-3">
          {METER_KEYS.map((m) => (
            <div key={m}>
              <label className="block text-xs font-semibold text-stone-600" htmlFor={`meter-${m}`}>
                {t(`meter_${m}`)}
              </label>
              <input
                id={`meter-${m}`}
                data-testid={`meter-${m}`}
                className={inputCls}
                disabled={isConfirmed}
                value={data.meters[m]?.value ?? ""}
                onChange={(e) => patchData({ meters: { ...data.meters, [m]: { value: e.target.value } } })}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs font-semibold text-stone-600" htmlFor="keys">
              {t("keys_count")}
            </label>
            <input
              id="keys"
              data-testid="input-keys"
              type="number"
              min={0}
              className={inputCls}
              disabled={isConfirmed}
              value={data.keys_count ?? ""}
              onChange={(e) => patchData({ keys_count: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-stone-600" htmlFor="occurred">
              {t("available_from_l")}
            </label>
            <input
              id="occurred"
              type="date"
              className={inputCls}
              disabled={isConfirmed}
              value={data.occurred_at ?? ""}
              onChange={(e) => patchData({ occurred_at: e.target.value })}
            />
          </div>
        </section>

        {/* inventory */}
        <section className="mt-4 rounded-2xl border border-stone-200 p-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-800">{t("inventory")}</h3>
            {!isConfirmed && (
              <button
                type="button"
                data-testid="add-inventory"
                onClick={() => patchData({ inventory: [...(data.inventory || []), { label: "", condition: "good", note: "" }] })}
                className="rounded-lg border border-stone-300 px-2.5 py-1 text-xs font-semibold text-stone-600"
              >
                + {t("add_item")}
              </button>
            )}
          </div>
          <div className="mt-2 space-y-2">
            {(data.inventory || []).map((item, ii) => (
              <div key={ii} className="grid grid-cols-[1fr_auto_auto] gap-2">
                <input
                  aria-label={t("item_label")}
                  className={inputCls}
                  placeholder={t("item_label")}
                  value={item.label}
                  disabled={isConfirmed}
                  onChange={(e) => {
                    const inv = [...(data.inventory || [])];
                    inv[ii] = { ...inv[ii], label: e.target.value };
                    patchData({ inventory: inv });
                  }}
                />
                <select
                  aria-label={t("item_condition")}
                  className={inputCls + " w-36"}
                  value={item.condition ?? ""}
                  disabled={isConfirmed}
                  onChange={(e) => {
                    const inv = [...(data.inventory || [])];
                    inv[ii] = { ...inv[ii], condition: (e.target.value || null) as HandoverItem["condition"] };
                    patchData({ inventory: inv });
                  }}
                >
                  <option value="">—</option>
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {condLabel(c)}
                    </option>
                  ))}
                </select>
                <input
                  aria-label={t("item_note")}
                  className={inputCls + " w-40"}
                  placeholder={t("item_note")}
                  value={item.note}
                  disabled={isConfirmed}
                  onChange={(e) => {
                    const inv = [...(data.inventory || [])];
                    inv[ii] = { ...inv[ii], note: e.target.value };
                    patchData({ inventory: inv });
                  }}
                />
              </div>
            ))}
          </div>
        </section>

        {/* media */}
        <section className="mt-4 rounded-2xl border border-stone-200 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-stone-800">{t("upload_media")}</h3>
            <select aria-label={t("room_field")} className="rounded-lg border border-stone-300 px-2 py-1 text-xs" value={mediaRoom} onChange={(e) => setMediaRoom(e.target.value)} disabled={isConfirmed}>
              {ROOM_NAMES.map((rn) => (
                <option key={rn} value={rn}>
                  {roomLabel(rn)}
                </option>
              ))}
            </select>
            <input
              ref={fileRef}
              data-testid="media-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              multiple
              disabled={isConfirmed}
              className="text-xs"
              onChange={(e) => void addMedia(e.target.files)}
            />
          </div>
          <div className="mt-2 space-y-1.5" data-testid="upload-list">
            {uploads.map((u) => (
              <div key={u.key} className="rounded-lg bg-stone-50 px-3 py-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{u.name}</span>
                  {u.error ? (
                    <button type="button" onClick={() => setUploads((p) => p.filter((x) => x.key !== u.key))} className="font-bold text-red-600">
                      {u.error} ✕
                    </button>
                  ) : (
                    <span className="font-semibold text-ink">{u.pct}%</span>
                  )}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded bg-stone-200">
                  <div className={`h-full ${u.error ? "bg-red-400" : "bg-gold"}`} style={{ width: `${u.error ? 100 : u.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          {media.length > 0 && (
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
              {media.map((m) => (
                <li key={m.id} className="overflow-hidden rounded-lg bg-stone-100" data-testid="media-item">
                  {m.media_type === "video" ? (
                    <video src={m.url} controls className="h-20 w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.url} alt={m.room} className="h-20 w-full object-cover" />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* comment */}
        {!isConfirmed && (
          <section className="mt-4">
            <label className="block text-xs font-semibold text-stone-600" htmlFor="h-comment">
              {t("handover_comment")}
            </label>
            <textarea id="h-comment" data-testid="input-comment" rows={2} className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} />
          </section>
        )}

        {err && (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-600" data-testid="handover-error">
            {err}
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-600">
            {t("cancel")}
          </button>
          {!isConfirmed && (
            <>
              <button type="button" data-testid="btn-save-handover" disabled={busy} onClick={() => void save()} className="rounded-xl border border-stone-300 px-4 py-2.5 text-sm font-semibold text-stone-700 disabled:opacity-60">
                {t("save")}
              </button>
              <button type="button" data-testid="btn-confirm-handover" disabled={busy} onClick={() => setOtpOpen(true)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60">
                {t("confirm_handover")}
              </button>
            </>
          )}
          {isConfirmed && (
            <button
              type="button"
              data-testid="btn-handover-pdf"
              onClick={() => void downloadAuthed(`/handovers/${handoverId}/pdf`, `handover-${kind}.pdf`)}
              className="rounded-xl bg-gold px-4 py-2.5 text-sm font-bold text-gold-text hover:bg-gold-dark"
            >
              ⬇ {t("download_handover_pdf")}
            </button>
          )}
        </div>
        {!isConfirmed && (
          <p className="mt-2 text-end text-[11px] text-stone-400">{locale === "ar" ? "التأكيد برمز تحقق من الطرفين يجعل المحضر نهائياً." : "Both parties confirm with an OTP to freeze the record."}</p>
        )}
      </div>

      {otpOpen && (
        <OtpConfirmModal
          title={t("confirm_handover")}
          submitLabel={t("confirm_ok")}
          onClose={() => setOtpOpen(false)}
          onConfirm={confirmWithOtp}
        />
      )}
    </div>
  );
}
