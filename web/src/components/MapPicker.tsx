"use client";
// Map pin picker: click/drag to set lat+lng (manual inputs exist in the wizard too).
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { TOKENS } from "../styles/tokenValues";
import { useEffect, useRef } from "react";

const TILES = process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_NAME = process.env.NEXT_PUBLIC_MAP_STYLE_NAME || "OpenStreetMap";

function style(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: "raster", tiles: [TILES], tileSize: 256, attribution: `© ${TILE_NAME}` } },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

export default function MapPicker({
  lat,
  lng,
  onPick,
}: {
  lat: number;
  lng: number;
  onPick: (lat: number, lng: number) => void;
}) {
  const holder = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;
  const posRef = useRef({ lat, lng });
  posRef.current = { lat, lng };

  useEffect(() => {
    if (!holder.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: holder.current,
      style: style(),
      center: [lng, lat],
      zoom: 12,
      attributionControl: { compact: true },
    });
    const el = document.createElement("div");
    el.dataset.testid = "wizard-pin";
    el.className = "h-7 w-7 rounded-full border-4 border-white bg-gold shadow-lg";
    const marker = new maplibregl.Marker({ element: el, draggable: true, color: TOKENS.goldDark }).setLngLat([lng, lat]).addTo(map);
    marker.on("dragend", () => {
      const p = marker.getLngLat();
      onPickRef.current(p.lat, p.lng);
    });
    map.on("click", (e: maplibregl.MapMouseEvent) => {
      marker.setLngLat(e.lngLat);
      onPickRef.current(e.lngLat.lat, e.lngLat.lng);
    });
    mapRef.current = map;
    markerRef.current = marker;
    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker in sync when coordinates change via manual inputs.
  useEffect(() => {
    const m = markerRef.current;
    if (!m) return;
    const cur = m.getLngLat();
    if (Math.abs(cur.lat - lat) > 1e-6 || Math.abs(cur.lng - lng) > 1e-6) {
      m.setLngLat([lng, lat]);
      mapRef.current?.easeTo({ center: [lng, lat] });
    }
  }, [lat, lng]);

  return <div ref={holder} className="h-72 w-full" data-testid="wizard-map" />;
}
