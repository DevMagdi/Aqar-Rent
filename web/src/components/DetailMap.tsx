"use client";
// Detail mini-map: approximate circle (accuracy_m) + login-gated exact reveal.
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth, useI18n, useToast } from "./Providers";
import type { Geo, ListingDetail } from "@/lib/types";
import { TOKENS } from "../styles/tokenValues";

const TILES = process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_NAME = process.env.NEXT_PUBLIC_MAP_STYLE_NAME || "OpenStreetMap";

function style(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: "raster", tiles: [TILES], tileSize: 256, attribution: `© ${TILE_NAME}` } },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

export function DetailMap({ geo, address, listingId }: { geo: Geo; address: string; listingId: string }) {
  const { locale, t } = useI18n();
  const { user } = useAuth();
  const toast = useToast();
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const circleRef = useRef<maplibregl.GeoJSONSource | null>(null);
  const [current, setCurrent] = useState<Geo>(geo);
  const [revealed, setRevealed] = useState(geo.accuracy_m === 0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: holder.current,
      style: style(),
      center: [current.longitude, current.latitude],
      zoom: current.accuracy_m === 0 ? 16 : 13,
      attributionControl: { compact: true },
    });
    map.on("load", () => {
      map.addSource("circle", {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: { type: "Point", coordinates: [current.longitude, current.latitude] },
          properties: { r: current.accuracy_m },
        },
      });
      circleRef.current = map.getSource("circle") as maplibregl.GeoJSONSource;
      if (current.accuracy_m > 0) {
        map.addLayer({
          id: "circle-fill",
          type: "circle",
          source: "circle",
          paint: {
            "circle-radius": 60,
            "circle-color": `${TOKENS.gold}33`,
            "circle-stroke-color": TOKENS.goldDark,
            "circle-stroke-width": 2,
            "circle-stroke-opacity": 0.7,
          },
        });
      }
      const el = document.createElement("div");
      el.dataset.testid = "detail-pin";
      el.className = "h-6 w-6 rounded-full border-4 border-white bg-gold shadow";
      markerRef.current = new maplibregl.Marker({ element: el }).setLngLat([current.longitude, current.latitude]).addTo(map);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revealExact() {
    if (!user) {
      toast.show(t("login_exact"), "err");
      return;
    }
    setBusy(true);
    try {
      const d = await api<ListingDetail>(`/listings/${listingId}?exact=true`);
      setCurrent(d.geo);
      setRevealed(true);
      const map = mapRef.current;
      if (map) {
        map.easeTo({ center: [d.geo.longitude, d.geo.latitude], zoom: 16 });
        markerRef.current?.setLngLat([d.geo.longitude, d.geo.latitude]);
        const src = map.getSource("circle") as maplibregl.GeoJSONSource | undefined;
        src?.setData({
          type: "Feature",
          geometry: { type: "Point", coordinates: [d.geo.longitude, d.geo.latitude] },
          properties: { r: d.geo.accuracy_m },
        });
      }
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : t("error_generic"), "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label={t("map")} className="rounded-2xl border border-stone-200 bg-white p-3">
      <p className="mb-2 text-sm font-semibold text-stone-800">📍 {address}</p>
      <div ref={holder} className="h-56 w-full overflow-hidden rounded-xl" data-testid="detail-map" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-xs text-stone-500">{revealed ? t("show_exact") : t("approx_location")}</p>
        {!revealed && (
          <button
            type="button"
            data-testid="btn-exact-location"
            disabled={busy}
            onClick={revealExact}
            className="rounded-lg border border-gold px-3 py-1.5 text-xs font-semibold text-ink hover:bg-brand-50 disabled:opacity-60"
          >
            {user ? t("show_exact") : `🔒 ${t("login_exact")}`}
          </button>
        )}
      </div>
    </section>
  );
}
