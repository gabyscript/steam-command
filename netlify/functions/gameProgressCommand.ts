import type { Config } from "@netlify/functions";
import { steamErrorMessage, textResponse } from "../services/chatResponse";
import { getGameLibrary, getLastPlayedGame } from "../services/gameLibrary";
import { findGame } from "../services/gameMatcher";
import { getAchievementProgress, getPlayerSummary } from "../services/steamApi";
import type { SteamGame } from "../types/steam";

type Resolution = { game: SteamGame } | { message: string };

const gameName = (game: SteamGame) => game.name ?? `Juego ${game.appid}`;

const resolveCurrentGame = async (): Promise<Resolution> => {
  const [summaryResult, libraryResult] = await Promise.allSettled([getPlayerSummary(), getGameLibrary()]);

  if (summaryResult.status === "rejected") {
    console.error("gameProgressCommand: error obteniendo el perfil:", summaryResult.reason);
  }
  const library = libraryResult.status === "fulfilled" ? libraryResult.value : [];

  const summary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
  const currentAppid = Number(summary?.gameid);
  if (Number.isSafeInteger(currentAppid) && currentAppid > 0) {
    // El juego en partida puede no estar en GetOwnedGames (p. ej. Family Sharing).
    const owned = library.find(game => game.appid === currentAppid);
    return { game: owned ?? { appid: currentAppid, name: summary?.gameextrainfo, playtime_forever: 0 } };
  }

  if (libraryResult.status === "rejected") throw libraryResult.reason;

  const recent = getLastPlayedGame(library);
  return recent ? { game: recent } : { message: "No encontré un juego reciente, usa !avance {juego}" };
};

const resolveByAppid = async (appid: number): Promise<Resolution> => {
  const game = (await getGameLibrary()).find(game => game.appid === appid);
  return game ? { game } : { message: `El juego ${appid} no está en la biblioteca` };
};

const resolveByName = async (query: string): Promise<Resolution> => {
  const result = findGame(query, await getGameLibrary());
  switch (result.kind) {
    case "match":
      return { game: result.game };
    case "ambiguous": {
      const options = result.candidates.map(game => `${gameName(game)} (${game.appid})`).join(", ");
      return { message: `¿Quisiste decir: ${options}? Usa !avance {id}` };
    }
    default:
      return { message: "No encontré ese juego, prueba con su ID" };
  }
};

const resolveGame = (query: string): Promise<Resolution> => {
  if (!query) return resolveCurrentGame();
  if (/^\d+$/.test(query)) return resolveByAppid(Number(query));
  return resolveByName(query);
};

const progressMessage = async (game: SteamGame): Promise<string> => {
  const name = gameName(game);
  if (game.has_community_visible_stats === false) {
    return `${name} no tiene logros`;
  }

  const progress = await getAchievementProgress(game.appid);
  if (!progress) {
    return `${name} no tiene logros`;
  }

  // Math.floor para no mostrar 100% sin estar completo.
  const percent = Math.floor((progress.achieved * 100) / progress.total);
  return `${name}: ${progress.achieved}/${progress.total} logros (${percent}%)`;
};

export default async (req: Request) => {
  const query = new URL(req.url).searchParams.get("q")?.trim() ?? "";

  try {
    const resolution = await resolveGame(query);
    if ("message" in resolution) {
      return textResponse(resolution.message);
    }
    return textResponse(await progressMessage(resolution.game));
  } catch (error) {
    console.error(`gameProgressCommand: error con la consulta "${query}":`, error);
    return textResponse(steamErrorMessage(error, "!avance"));
  }
};

export const config: Config = {
  path: "/api/game-progress",
  method: ["GET"]
};
