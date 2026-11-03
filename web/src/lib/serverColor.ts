import { readFileSync } from "node:fs";
import path from "node:path";

let source: string | undefined;

/** Read a concrete palette value from the CSS source of truth for server renderers. */
export function serverTokenColor(name: string): string {
  if (!source) source = readFileSync(path.join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
  const declaration = source.match(new RegExp(`--color-${name}:\\s*([^;]+);`));
  if (!declaration?.[1]) throw new Error(`Missing color token: ${name}`);
  return declaration[1].trim();
}
