"use client";
// The actual MapLibre map (imported lazily by MapSection).
import * as maplibregl from "maplibre-gl";
import type { Map as MLMap, GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
import { formatMoney } from "@/lib/utils";
import type { Locale, SearchItem } from "@/lib/types";

const TILES = process.env.NEXT_PUBLIC_MAP_TILES_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_NAME = process.env.NEXT_PUBLIC_MAP_STYLE_NAME || "OpenStreetMap";

// Egypt defaults (Cairo).
const EGYPT_CENTER: [number, number] = [30.8, 29.5];
const EGYPT_ZOOM = 6;

function buildStyle(): maplibregl.StyleSpecification {
  return {
    version: 8,
    sources: { base: { type: "raster", tiles: [TILES], tileSize: 256, attribution: `© ${TILE_NAME}` } },
    layers: [{ id: "base", type: "raster", source: "base" }],
  };
}

function featureCollection(items: SearchItem[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: items.map((i) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [i.geo.longitude, i.geo.latitude] },
      properties: { id: i.id, price: i.rent_monthly },
    })),
  };
}

export default function MapView({
  items,
  onBbox,
  focus,
  locale,
  mapKey,
}: {
  items: SearchItem[];
  onBbox?: (bbox: [number, number, number, number]) => void;
  focus: SearchItem | null;
  locale: Locale;
  mapKey: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<{ id: string; el: HTMLElement; m: maplibregl.Marker }[]>([]);
  const readyRef = useRef(false);
  const onBboxRef = useRef(onBbox);
  onBboxRef.current = onBbox;

  // ── init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(),
      center: EGYPT_CENTER,
      zoom: EGYPT_ZOOM,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    map.on("load", () => {
      readyRef.current = true;
      map.addSource("pts", { type: "geojson", data: featureCollection([]), cluster: true, clusterMaxZoom: 13, clusterRadius: 48 });
      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "pts",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#8a2a06",
          "circle-radius": ["step", ["get", "point_count"], 16, 5, 20, 12, 26],
          "circle-opacity": 0.85,
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
      map.on("click", "clusters", async (e: maplibregl.MapLayerMouseEvent) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ["clusters"] })[0];
        const cid = f?.properties?.cluster_id;
        if (cid === undefined) return;
        const src = map.getSource("pts") as GeoJSONSource;
        const zoom = await src.getClusterExpansionZoom(cid);
        const geom = f.geometry as GeoJSON.Point;
        map.easeTo({ center: geom.coordinates as [number, number], zoom });
      });
      map.on("mouseenter", "clusters", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "clusters", () => (map.getCanvas().style.cursor = ""));
      // Emit initial bounds immediately: tile-free/offline environments never
      // fire moveend on their own, but "search this area" still needs a bbox.
      const b = map.getBounds();
      onBboxRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    });
    map.on("moveend", () => {
      const b = map.getBounds();
      onBboxRef.current?.([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    });
    mapRef.current = map;
    return () => {
      readyRef.current = false;
      markersRef.current.forEach(({ m }) => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── update markers + clusters on data change ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !readyRef.current) {
      const id = window.setInterval(() => {
        const m = mapRef.current;
        if (m && readyRef.current) {
          window.clearInterval(id);
          applyData(m);
        }
      }, 100);
      return () => window.clearInterval(id);
    }
    applyData(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapKey]);

  function applyData(map: MLMap) {
    const src = map.getSource("pts") as GeoJSONSource | undefined;
    src?.setData(featureCollection(items));
    // HTML price markers for every pin (cluster circles render underneath).
    markersRef.current.forEach(({ m }) => m.remove());
    markersRef.current = items.map((i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.dataset.testid = "price-pin";
      el.dataset.listingId = i.id;
      el.className =
        "-translate-y-1/2 rounded-full border border-white bg-brand-600 px-2 py-1 text-[11px] font-bold text-white shadow hover:bg-brand-700";
      el.textContent = formatMoney(i.rent_monthly, locale);
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        window.dispatchEvent(new CustomEvent("aqar:pin-click", { detail: { id: i.id } }));
      });
      const m = new maplibregl.Marker({ element: el })
        .setLngLat([i.geo.longitude, i.geo.latitude])
        .addTo(map);
      return { id: i.id, el, m };
    });
  }

  // ── focus on a selected item (pan) ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focus) return;
    map.easeTo({ center: [focus.geo.longitude, focus.geo.latitude], zoom: 15, duration: 500 });
  }, [focus]);

  return <div ref={containerRef} className="h-full w-full" data-testid="maplibre" />;
}
