import { apiClient } from "./api";

export interface GameOption {
  gameid: number;
  gamename: string;
  gamedescription: string;
}

// The game list almost never changes, so every page that needs it shares one cached copy instead
// of re-fetching on every visit. A short TTL still picks up an admin's edit within a few minutes;
// invalidateGamesCache() (called after games.tsx saves one) makes that immediate for this tab.
const TTL_MS = 5 * 60 * 1000;
let cached: { data: GameOption[]; at: number } | null = null;
let inflight: Promise<GameOption[]> | null = null;

export const getGames = async (): Promise<GameOption[]> => {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  if (inflight) return inflight;
  inflight = apiClient
    .get<GameOption[]>("/games")
    .then((res) => {
      const data = res.data || [];
      cached = { data, at: Date.now() };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
};

export const invalidateGamesCache = () => {
  cached = null;
};
