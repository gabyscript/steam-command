const BASE = "https://api.steampowered.com";

const key = () => {
  const keyId = process.env.STEAM_API_KEY;
  if (!keyId) throw new Error("Falta STEAM_API_KEY");
  return keyId;
};

const steamId = () => {
  const steamId = process.env.STEAM_PROFILE_ID;
  if (!steamId) throw new Error("Falta STEAM_ID");
  return steamId;
};

export function ownedGamesUrl() {
  const params = new URLSearchParams({
    key: key(),
    steamid: steamId(),
    include_appinfo: "1",
    format: "json",
  });
  return `${BASE}/IPlayerService/GetOwnedGames/v0001/?${params}`;
}

export function achievementsUrl(appId: number) {
  const params = new URLSearchParams({
    key: key(),
    steamid: steamId(),
    appid: String(appId),
    format: "json",
    _t: String(Date.now()),
  });
  return `${BASE}/ISteamUserStats/GetPlayerAchievements/v0001/?${params}`;
}