"use client";
// Photo gallery: lightbox with keyboard nav, RTL-aware.
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { Media } from "@/lib/types";

export function Gallery({ media, title }: { media: Media[]; title: string }) {
  const [idx, setIdx] = useState<number | null>(null);
  const photos = media.filter((m) => m.type !== "video" || true);

  const close = useCallback(() => setIdx(null), []);
  const next = useCallback(() => setIdx((i) => (i === null ? null : (i + 1) % Math.max(photos.length, 1))), [photos.length]);
  const prev = useCallback(() => setIdx((i) => (i === null ? null : (i - 1 + photos.length) % Math.max(photos.length, 1))), [photos.length]);

  useEffect(() => {
    if (idx === null) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [idx, close, next, prev]);

  if (photos.length === 0) {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-2xl bg-stone-100 text-stone-400" data-testid="gallery-empty">
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
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-stone-100"
      >
        <Image
          src={photos[0].url}
          alt={title}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 60vw"
          className="object-cover"
        />
        {photos.length > 1 && (
          <span className="absolute bottom-3 end-3 rounded-lg bg-black/70 px-2 py-1 text-xs font-semibold text-white">
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
              className="relative aspect-square overflow-hidden rounded-xl bg-stone-100"
              aria-label={`${i + 1}`}
            >
              <Image src={m.thumb_url || m.url} alt="" fill sizes="120px" className="object-cover" />
            </button>
          ))}
        </div>
      )}

      {idx !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={title}
          data-testid="lightbox"
          className="fixed inset-0 z-[900] flex items-center justify-center bg-black/90 p-4"
          onClick={close}
        >
          <button type="button" aria-label="close" onClick={close} className="absolute top-4 end-4 rounded-full bg-white/10 p-3 text-white">
            ✕
          </button>
          <button
            type="button"
            aria-label="prev"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute start-3 rounded-full bg-white/10 p-3 text-white"
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
            className="absolute end-3 rounded-full bg-white/10 p-3 text-white"
          >
            ›
          </button>
          <span className="absolute bottom-5 start-1/2 -translate-x-1/2 rounded-lg bg-black/60 px-3 py-1 text-sm text-white">
            {idx + 1} / {photos.length}
          </span>
        </div>
      )}
    </div>
  );
}
