export interface SteamGame {
  appid: number;
  playtime_forever: number;
  playtime_2weeks?: number;
  name?: string;
  img_icon_url?: string;
  rtime_last_played?: number;
  has_community_visible_stats?: boolean;
}

export interface OwnedGamesResponse {
  response: {
    game_count?: number;
    games?: SteamGame[];
  };
}

export interface PlayerSummary {
  steamid: string;
  personaname: string;
  profileurl: string;
  communityvisibilitystate: number;
  gameid?: string;
  gameextrainfo?: string;
}

export interface PlayerSummariesResponse {
  response: {
    players: PlayerSummary[];
  };
}

export interface PlayerAchievementsResponse {
  playerstats: {
    success: boolean;
    error?: string;
    achievements?: { apiname: string; achieved: 0 | 1 }[];
  };
}
