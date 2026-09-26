import type { Config } from "@netlify/functions";
import { countCompleted, readCompletion } from "../services/completionStore";
import { getGameLibrary } from "../services/gameLibrary";
import { getPlayerSummary, getRecentlyPlayedGames, SteamApiError } from "../services/steamApi";
import type { SteamGame } from "../types/steam";

// Margen bajo el límite de 500 caracteres del chat de Twitch.
const MAX_MESSAGE_LENGTH = 400;

const SEPARATOR = " | ";

const getProfileUrlFallback = () => {
  const steamId = Netlify.env.get("STEAM_PROFILE_ID");
  return steamId ? `https://steamcommunity.com/profiles/${steamId}/` : null;
};

const textResponse =(message: string) =>
  new Response(message, { headers: { "Content-Type": "text/plain; charset=utf-8" } });

const formatHours = (minutes: number) => Math.round(minutes / 60).toLocaleString("es-CL");

const errorMessage = (error: unknown): string => {
  if (error instanceof SteamApiError) {
    switch (error.kind) {
      case "private":
        return "El perfil de Steam es privado 🔒";
      case "config":
        return "El comando !steam está mal configurado 🛠️";
      default:
        return "Steam no responde, intenta en un rato ⏳";
    }
  }
  return "No pude obtener las stats de Steam, intenta en un rato ⏳";
};

const mostPlayed = (games: SteamGame[]) =>
  games.reduce((top, game) => (game.playtime_forever > top.playtime_forever ? game : top));

export default async () => {
  const [summaryResult, libraryResult, recentResult, completionResult] = await Promise.allSettled([
    getPlayerSummary(),
    getGameLibrary(),
    getRecentlyPlayedGames(),
    readCompletion(),
  ]);

  if (libraryResult.status === "rejected") {
    console.error("profileDataCommand: error obteniendo la biblioteca:", libraryResult.reason);
    return textResponse(errorMessage(libraryResult.reason));
  }

  const games = libraryResult.value;
  const summary = summaryResult.status === "fulfilled" ? summaryResult.value : null;
  if (summaryResult.status === "rejected") {
    console.error("profileDataCommand: error obteniendo el perfil:", summaryResult.reason);
  }

  const parts: string[] = [];

  const totalMinutes = games.reduce((sum, game) => sum + game.playtime_forever, 0);
  parts.push(summary ? `🎮 ${summary.personaname}: ${games.length} juegos` : `🎮 ${games.length} juegos`);
  parts.push(`⏱️ ${formatHours(totalMinutes)} h jugadas`);

  const completion = completionResult.status === "fulfilled" ? completionResult.value : null;
  parts.push(completion ? `🏆 ${countCompleted(completion)} al 100%` : "🏆 100%: calculando…");

  const top = mostPlayed(games);
  parts.push(`Más jugado: ${top.name ?? top.appid} (${formatHours(top.playtime_forever)} h)`);

  if (summary?.gameextrainfo) {
    parts.push(`Jugando ahora: ${summary.gameextrainfo}`);
  } else if (recentResult.status === "fulfilled" && recentResult.value[0]) {
    parts.push(`Reciente: ${recentResult.value[0].name ?? recentResult.value[0].appid}`);
  }

  const profileUrl = summary?.profileurl ?? getProfileUrlFallback();
  const suffix = profileUrl ? `${SEPARATOR}${profileUrl}` : "";
  const maxInfoLength = MAX_MESSAGE_LENGTH - suffix.length;

  const info = parts.join(SEPARATOR);
  const trimmedInfo = info.length > maxInfoLength ? `${info.slice(0, maxInfoLength - 1)}…` : info;
  return textResponse(trimmedInfo + suffix);
}

export const config: Config = {
  path: "/api/profile-data",
  method: ["GET"]
};
