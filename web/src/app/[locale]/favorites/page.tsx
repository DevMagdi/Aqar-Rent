import { FavoritesView } from "@/components/FavoritesView";
import { RequireAuth } from "@/components/RequireAuth";
import { fetchServer } from "@/lib/server";
import type { Location } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function FavoritesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const l = locale === "en" ? "en" : "ar";
  let places: Record<string, Location> = {};
  try {
    const [govs, cities] = await Promise.all([
      fetchServer<Location[]>("/locations?level=governorate"),
      fetchServer<Location[]>("/locations?level=city"),
    ]);
    places = Object.fromEntries([...govs, ...cities].map((x) => [x.id, x]));
  } catch {}
  return (
    <RequireAuth>
      <FavoritesView locale={l} places={places} />
    </RequireAuth>
  );
}
