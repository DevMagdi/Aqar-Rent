"use client";

/** Resolve a palette token for browser APIs such as MapLibre that reject var(). */
export function clientTokenColor(name: string, alpha?: number): string {
  const probe = document.createElement("span");
  probe.style.color = `var(--color-${name})`;
  probe.setAttribute("aria-hidden", "true");
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  if (alpha === undefined) return resolved;
  const channels = resolved.match(/[\d.]+/g);
  if (!channels || channels.length < 3) return resolved;
  return `rgba(${channels[0]}, ${channels[1]}, ${channels[2]}, ${alpha})`;
}
