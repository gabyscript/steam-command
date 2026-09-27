import type { SteamGame } from "../types/steam";
import { getCacheStore } from "./cacheStore";
import { getOwnedGames } from "./steamApi";

const LIBRARY_KEY = "library";
const LIBRARY_TTL_MS = 15 * 60 * 1000;

interface CachedLibrary {
  fetchedAt: number;
  games: SteamGame[];
}

// Usado por !steam ("Reciente") y !progress (sin argumento) para que coincidan.
// Los programas fuera de GetOwnedGames (p. ej. RetroArch) no tienen rtime_last_played.
export const getLastPlayedGame = (games: SteamGame[]): SteamGame | undefined =>
  games.reduce<SteamGame | undefined>(
    (latest, game) =>
      (game.rtime_last_played ?? 0) > (latest?.rtime_last_played ?? 0) ? game : latest,
    undefined
  );

export const getGameLibrary = async (): Promise<SteamGame[]> => {
  const store = getCacheStore();
  const cached = (await store.get(LIBRARY_KEY, { type: "json" })) as CachedLibrary | null;

  if (cached && Date.now() - cached.fetchedAt < LIBRARY_TTL_MS) {
    return cached.games;
  }

  try {
    const games = await getOwnedGames();
    await store.setJSON(LIBRARY_KEY, { fetchedAt: Date.now(), games } satisfies CachedLibrary);
    return games;
  } catch (error) {
    if (cached) {
      console.error("No se pudo refrescar la biblioteca, usando caché vencido:", error);
      return cached.games;
    }
    throw error;
  }
}
