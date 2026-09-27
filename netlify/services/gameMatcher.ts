import type { SteamGame } from "../types/steam";

// Bajo este puntaje no se considera candidato.
const MIN_SCORE = 0.6;
// Desde este puntaje el mejor candidato gana solo si le saca ventaja al segundo.
const CONFIDENT_SCORE = 0.8;
const TIE_MARGIN = 0.1;
const CONTAINS_BONUS = 0.2;
const MAX_CANDIDATES = 3;

export type MatchResult =
  | { kind: "match"; game: SteamGame }
  | { kind: "ambiguous"; candidates: SteamGame[] }
  | { kind: "none" };

export const normalizeName = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[™®©'’`´]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");

const bigrams = (text: string): Map<string, number> => {
  const counts = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i++) {
    const bigram = text.slice(i, i + 2);
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }
  return counts;
};

export const diceCoefficient = (a: string, b: string): number => {
  const left = a.replace(/\s/g, "");
  const right = b.replace(/\s/g, "");
  if (left === right) return 1;
  if (left.length < 2 || right.length < 2) return 0;

  const leftBigrams = bigrams(left);
  const rightBigrams = bigrams(right);
  let shared = 0;
  for (const [bigram, count] of leftBigrams) {
    shared += Math.min(count, rightBigrams.get(bigram) ?? 0);
  }
  return (2 * shared) / (left.length - 1 + right.length - 1);
};

// Ambos argumentos ya normalizados.
const contains = (query: string, name: string): boolean =>
  query.length >= 3 && name.length >= 3 && (name.includes(query) || query.includes(name));

export const similarity = (query: string, name: string): number =>
  Math.min(1, diceCoefficient(query, name) + (contains(query, name) ? CONTAINS_BONUS : 0));

export const findGame = (query: string, games: SteamGame[]): MatchResult => {
  const normalizedQuery = normalizeName(query);
  if (!normalizedQuery) return { kind: "none" };

  const named = games
    .filter((game): game is SteamGame & { name: string } => Boolean(game.name))
    .map(game => ({ game, normalized: normalizeName(game.name) }));

  const exact = named.filter(entry => entry.normalized === normalizedQuery).map(entry => entry.game);
  if (exact.length === 1) return { kind: "match", game: exact[0] };
  if (exact.length > 1) return { kind: "ambiguous", candidates: exact.slice(0, MAX_CANDIDATES) };

  const scored = named
    .map(entry => ({ ...entry, score: similarity(normalizedQuery, entry.normalized) }))
    .filter(entry => entry.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);

  const [best, second] = scored;
  if (!best) return { kind: "none" };

  if (best.score >= CONFIDENT_SCORE && (!second || second.score < best.score - TIE_MARGIN)) {
    return { kind: "match", game: best.game };
  }
  // Nombre parcial ("vampire") sin otros candidatos: no hace falta preguntar.
  if (!second && contains(normalizedQuery, best.normalized)) {
    return { kind: "match", game: best.game };
  }
  return { kind: "ambiguous", candidates: scored.slice(0, MAX_CANDIDATES).map(entry => entry.game) };
};
