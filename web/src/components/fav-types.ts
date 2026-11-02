// Type shim for favorites (backend reuses SearchItemOut + status).
import type { SearchItem } from "@/lib/types";

export type { Locale } from "@/lib/types";

export interface FavoritesOutShape {
  items: (SearchItem & { status: string })[];
  next_cursor: string | null;
  limit: number;
}
