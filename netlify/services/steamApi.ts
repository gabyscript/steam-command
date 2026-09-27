import type {
  OwnedGamesResponse,
  PlayerAchievementsResponse,
  PlayerSummariesResponse,
  PlayerSummary,
  SteamGame,
} from "../types/steam";

const STEAM_API_URL = "https://api.steampowered.com";
const REQUEST_TIMEOUT_MS = 4000;

export type SteamErrorKind = "config" | "timeout" | "rate_limit" | "unavailable" | "private";

export class SteamApiError extends Error {
  constructor(public readonly kind: SteamErrorKind, message: string) {
    super(message);
    this.name = "SteamApiError";
  }
}

const getEnv = (name: string): string => {
  const value = Netlify.env.get(name);
  if (!value) {
    throw new SteamApiError("config", `Falta la variable de entorno ${name}`);
  }
  return value;
};

const getSteamId = () => getEnv("STEAM_PROFILE_ID");

const steamFetch = async <T>(path: string, params: Record<string, string>): Promise<{ status: number; body: T | null }> => {
  const url = new URL(path, STEAM_API_URL);
  url.search = new URLSearchParams({ key: getEnv("STEAM_API_KEY"), format: "json", ...params }).toString();

  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error) {
    if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new SteamApiError("timeout", `Timeout llamando a ${path}`);
    }
    throw new SteamApiError("unavailable", `Error de red llamando a ${path}: ${String(error)}`);
  }

  if (response.status === 429) {
    throw new SteamApiError("rate_limit", `Rate limit de Steam en ${path}`);
  }
  if (response.status >= 500) {
    throw new SteamApiError("unavailable", `Steam respondió ${response.status} en ${path}`);
  }
  if (response.status === 401) {
    throw new SteamApiError("config", `API key inválida (${response.status}) en ${path}`);
  }

  const body = (await response.json().catch(() => null)) as T | null;
  return { status: response.status, body };
};

export const getPlayerSummary = async (): Promise<PlayerSummary> => {
  const { body } = await steamFetch<PlayerSummariesResponse>("/ISteamUser/GetPlayerSummaries/v2/", {
    steamids: getSteamId(),
  });

  const player = body?.response.players[0];
  if (!player) {
    throw new SteamApiError("config", "STEAM_PROFILE_ID no corresponde a ningún perfil");
  }

  if (player.communityvisibilitystate !== 3) {
    throw new SteamApiError("private", "El perfil de Steam es privado");
  }
  return player;
};

export const getOwnedGames = async (): Promise<SteamGame[]> => {
  const { body } = await steamFetch<OwnedGamesResponse>("/IPlayerService/GetOwnedGames/v1/", {
    steamid: getSteamId(),
    include_appinfo: "1",
    include_played_free_games: "1",
  });

  const games = body?.response.games;
  if (!games || !games.length) {
    throw new SteamApiError("private", "GetOwnedGames vino vacío: detalles de juego privados");
  }
  return games;
};

export const getAchievementProgress = async (appid: number): Promise<{ achieved: number; total: number } | null> => {
  const { status, body } = await steamFetch<PlayerAchievementsResponse>("/ISteamUserStats/GetPlayerAchievements/v1/", {
    steamid: getSteamId(),
    appid: String(appid),
  });

  const stats = body?.playerstats;
  if (status === 403) {
    throw new SteamApiError("private", `Logros privados (appid ${appid})`);
  }
  if (!stats?.success) {
    if (stats?.error?.toLowerCase().includes("no stats")) {
      return null;
    }
    throw new SteamApiError("unavailable", `GetPlayerAchievements falló (appid ${appid}, status ${status}): ${stats?.error ?? "sin detalle"}`);
  }

  const achievements = stats.achievements ?? [];
  if (!achievements.length) {
    return null;
  }
  return {
    achieved: achievements.filter(a => a.achieved === 1).length,
    total: achievements.length,
  };
};
