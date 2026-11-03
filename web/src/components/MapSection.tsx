"use client";
// MapLibre GL section — dynamic client-only wrapper (maplibre needs `window`).
// - Inline raster style; tile URL/env comes from NEXT_PUBLIC_MAP_TILES_URL (no paid key).
// - Price pins are HTML markers (no glyph server needed) + clustered GeoJSON circles.
// - Emits `onBbox` on moveend for the "search this area" flow.
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Locale, SearchItem } from "@/lib/types";

function Spinner() {
  return (
    <div className="grid h-full min-h-64 place-items-center bg-surface-2 text-sm text-muted" data-testid="map-loading">
      …
    </div>
  );
}

const MapInner = dynamic(() => import("./MapView"), { ssr: false, loading: Spinner });

export function MapSection({
  items,
  onBbox,
  focus,
  locale,
  heightClass = "h-[60vh]",
}: {
  items: SearchItem[];
  onBbox?: (bbox: [number, number, number, number]) => void;
  focus?: SearchItem | null;
  locale: Locale;
  heightClass?: string;
}) {
  // Remount key: changing filters replaces markers without rebuilding the map.
  const key = items.map((i) => i.id).slice(0, 50).join(",");
  return (
    <div className={`relative w-full overflow-hidden rounded-2xl border border-border ${heightClass}`} data-testid="map">
      <MapInner items={items} onBbox={onBbox} focus={focus ?? null} locale={locale} mapKey={key} />
    </div>
  );
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function useElementWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  return ref.current;
}
