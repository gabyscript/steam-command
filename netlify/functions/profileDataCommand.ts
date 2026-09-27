import type { Config } from "@netlify/functions";
import { steamErrorMessage, textResponse } from "../services/chatResponse";
import { countCompleted, readCompletion } from "../services/completionStore";
import { getGameLibrary, getLastPlayedGame } from "../services/gameLibrary";
import { getPlayerSummary } from "../services/steamApi";
import type { SteamGame } from "../types/steam";

// Margen bajo el límite de 500 caracteres del chat de Twitch.
const MAX_MESSAGE_LENGTH = 400;

const SEPARATOR = " | ";

const getProfileUrlFallback = () => {
  const steamId = Netlify.env.get("STEAM_PROFILE_ID");
  return steamId ? `https://steamcommunity.com/profiles/${steamId}/` : null;
};

const formatHours = (minutes: number) => Math.round(minutes / 60).toLocaleString("es-CL");

const mostPlayed = (games: SteamGame[]) =>
  games.reduce((top, game) => (game.playtime_forever > top.playtime_forever ? game : top));

export default async () => {
  const [summaryResult, libraryResult, completionResult] = await Promise.allSettled([
    getPlayerSummary(),
    getGameLibrary(),
    readCompletion(),
  ]);

  if (libraryResult.status === "rejected") {
    console.error("profileDataCommand: error obteniendo la biblioteca:", libraryResult.reason);
    return textResponse(steamErrorMessage(libraryResult.reason, "!steam"));
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

  const recent = getLastPlayedGame(games);
  if (summary?.gameextrainfo) {
    parts.push(`Jugando ahora: ${summary.gameextrainfo}`);
  } else if (recent) {
    parts.push(`Reciente: ${recent.name ?? recent.appid}`);
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
