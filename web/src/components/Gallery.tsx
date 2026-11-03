"use client";
// Photo gallery: lightbox with keyboard nav, RTL-aware.
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatedPresence } from "./motion";
import type { Media } from "@/lib/types";

export function Gallery({ media, title, listingId }: { media: Media[]; title: string; listingId?: string }) {
  const [idx, setIdx] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const photos = media.filter((m) => m.type !== "video" || true);
  const transitionName = listingId ? `listing-${listingId.replace(/[^a-zA-Z0-9_-]/g, "-")}` : undefined;

  const close = useCallback(() => setIdx(null), []);
  const next = useCallback(() => setIdx((i) => (i === null ? null : (i + 1) % Math.max(photos.length, 1))), [photos.length]);
  const prev = useCallback(() => setIdx((i) => (i === null ? null : (i - 1 + photos.length) % Math.max(photos.length, 1))), [photos.length]);

  useEffect(() => {
    if (idx === null) {
      returnFocusRef.current?.focus();
      returnFocusRef.current = null;
      return;
    }
    returnFocusRef.current ??= document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const h = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      const rtl = document.documentElement.dir === "rtl";
      if (event.key === (rtl ? "ArrowLeft" : "ArrowRight")) next();
      if (event.key === (rtl ? "ArrowRight" : "ArrowLeft")) prev();
      if (event.key !== "Tab") return;
      const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),[href],input:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? []);
      if (!nodes.length) return;
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [idx, close, next, prev]);

  if (photos.length === 0) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-surface-2 text-muted" data-testid="gallery-empty">
        🏙
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        data-testid="gallery-main"
        onClick={() => setIdx(0)}
          className="listing-image-shell press relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-surface-2"
      >
        <Image
          src={photos[0].url}
          alt={title}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="image-loaded object-cover transition-transform duration-500 ease-out hover:scale-[1.05]"
          style={transitionName ? { viewTransitionName: transitionName } : undefined}
        />
        {photos.length > 1 && (
          <span className="absolute bottom-3 end-3 rounded-lg bg-brand-deep/70 px-2 py-1 text-xs font-semibold text-on-dark">
            1 / {photos.length}
          </span>
        )}
      </button>

      {photos.length > 1 && (
        <div className="mt-3 grid grid-cols-5 gap-2" data-testid="gallery-thumbs">
          {photos.slice(0, 5).map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setIdx(i)}
              className="relative aspect-square overflow-hidden rounded-xl bg-surface-2"
              aria-label={`${i + 1}`}
            >
              <Image src={m.thumb_url || m.url} alt="" fill sizes="120px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      <AnimatedPresence present={idx !== null} className="lightbox-presence">
        {idx === null ? null : (
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          data-testid="lightbox"
          className="lightbox fixed inset-0 z-[900] flex items-center justify-center bg-brand-deep/90 p-4"
          onClick={close}
        >
          <button type="button" aria-label="close" onClick={close} className="absolute top-4 end-4 rounded-full bg-surface/10 p-3 text-on-dark">
            ✕
          </button>
          <button
            type="button"
            aria-label="prev"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute start-3 rounded-full bg-surface/10 p-3 text-on-dark"
          >
            ‹
          </button>
          <div className="relative h-[80vh] w-[90vw] max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <Image
              src={photos[idx].url}
              alt=""
              fill
              sizes="90vw"
              className="object-contain"
              unoptimized={photos[idx].url.endsWith(".webp")}
            />
          </div>
          <button
            type="button"
            aria-label="next"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute end-3 rounded-full bg-surface/10 p-3 text-on-dark"
          >
            ›
          </button>
          <span className="absolute bottom-5 start-1/2 -translate-x-1/2 rounded-lg bg-brand-deep/60 px-3 py-1 text-sm text-on-dark">
            {idx + 1} / {photos.length}
          </span>
        </div>
        )}
      </AnimatedPresence>
    </div>
  );
}
