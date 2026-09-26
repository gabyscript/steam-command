import type { Config } from "@netlify/functions";
import { readCompletion, writeCompletion, type CompletionData } from "../services/completionStore";
import { getGameLibrary } from "../services/gameLibrary";
import { getAchievementProgress, SteamApiError } from "../services/steamApi";
import type { SteamGame } from "../types/steam";

// Las Scheduled Functions tienen un límite de 30 s; dejamos margen para guardar.
const TIME_BUDGET_MS = 20_000;
const CONCURRENCY = 5;

const needsUpdate = (game: SteamGame, data: CompletionData): boolean => {
  const stored = data.games[game.appid];
  return !stored || (game.rtime_last_played ?? 0) > stored.lastPlayed;
};

export default async () => {
  const startedAt = Date.now();
  const library = await getGameLibrary();
  const data: CompletionData = (await readCompletion()) ?? { updatedAt: 0, games: {} };

  const pending: SteamGame[] = [];
  for (const game of library) {
    if (!game.playtime_forever || !needsUpdate(game, data)) continue;

    if (game.has_community_visible_stats === false) {
      data.games[game.appid] = { lastPlayed: game.rtime_last_played ?? 0, noStats: true };
    } else {
      pending.push(game);
    }
  }

  let processed = 0;
  let stopReason = "completo";

  for (let i = 0; i < pending.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      stopReason = "presupuesto de tiempo agotado";
      break;
    }

    const batch = pending.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(game => getAchievementProgress(game.appid)));

    let rateLimited = false;
    results.forEach((result, index) => {
      const game = batch[index];
      const lastPlayed = game.rtime_last_played ?? 0;

      if (result.status === "fulfilled") {
        data.games[game.appid] = result.value
          ? { lastPlayed, ...result.value }
          : { lastPlayed, noStats: true };
        processed++;
      } else if (result.reason instanceof SteamApiError && result.reason.kind === "rate_limit") {
        rateLimited = true;
      } else {
        console.error(`No se pudo leer logros de ${game.name ?? game.appid}:`, result.reason);
      }
    });

    if (rateLimited) {
      stopReason = "rate limit de Steam";
      break;
    }
  }

  data.updatedAt = Date.now();
  await writeCompletion(data);

  console.log(`updateCompletionStats: ${processed}/${pending.length} juegos procesados (${stopReason}) en ${Date.now() - startedAt} ms`);
}

export const config: Config = {
  schedule: "*/30 * * * *"
};
