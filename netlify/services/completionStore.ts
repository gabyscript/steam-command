import { getCacheStore } from "./cacheStore";

const COMPLETION_KEY = "completion";

export type GameCompletion =
  | { lastPlayed: number; achieved: number; total: number }
  | { lastPlayed: number; noStats: true };

export interface CompletionData {
  updatedAt: number;
  games: Record<string, GameCompletion>;
}

export const readCompletion = async (): Promise<CompletionData | null> => {
  return (await getCacheStore().get(COMPLETION_KEY, { type: "json" })) as CompletionData | null;
};

export const writeCompletion = async (data: CompletionData): Promise<void> => {
  await getCacheStore().setJSON(COMPLETION_KEY, data);
};

export const countCompleted = (data: CompletionData): number => {
  return Object.values(data.games).filter(
    game => "total" in game && game.total > 0 && game.achieved === game.total
  ).length;
};
