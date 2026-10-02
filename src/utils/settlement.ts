// Turns the rows of /group-payments-by-date into one row per game plus the calculation totals.
export interface PaymentData {
  res_game: string;
  res_type: string;
  res_bet_on: string;
  res_bet_amt: number;
  res_payable_times: number;
  res_win_amt: number;
}

export type GameRow = {
  key: string;
  game: string;
  bet: number;
  open: number;
  jodi: number;
  openPana: number;
  close: number;
  closePana: number;
  win: number;
};

export type Settlement = {
  games: GameRow[];
  winners: PaymentData[];
  totalBet: number;
  totalWin: number;
  commissionLabel: string;
  commission: number;
  remaining: number;
  conclusion: number;
};

export const normName = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
export const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? "—" : new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(v);

// Regroups the settlement rows the API already returns: per-game open/close summary rows, the winning
// bets (typed open / close / jodi / open pana / close pana) and the four total rows.
export const buildSettlement = (rows: PaymentData[]): Settlement | null => {
  const total = rows.find((r) => r.res_game === "Total Amount");
  const commission = rows.find((r) => r.res_game.startsWith("Commsion("));
  const remaining = rows.find((r) => r.res_game === "Remaining");
  const conclusion = rows.find((r) => r.res_game === "Payable/Receivable");
  if (!total || !commission || !remaining || !conclusion) return null;

  const winners = rows.filter((r) => r.res_type !== "");
  const winsFor = (game: string, type: string) =>
    winners
      .filter((w) => normName(w.res_game) === game && w.res_type === type)
      .reduce((s, w) => s + Number(w.res_win_amt || 0), 0);

  // One row per game: the open and close summary rows are added together, and the winnings are
  // split by bet type.
  const byGame = new Map<string, GameRow>();
  rows.forEach((r) => {
    if (r.res_type !== "") return;
    const m = r.res_game.trim().match(/^(.*?)\s*\((open|close)\)$/);
    if (!m) return;
    const name = m[1].trim().replace(/\s+/g, " ");
    const key = normName(name);
    const row = byGame.get(key) ?? {
      key,
      game: name,
      bet: 0,
      open: winsFor(key, "open"),
      jodi: winsFor(key, "jodi"),
      openPana: winsFor(key, "open pana"),
      close: winsFor(key, "close"),
      closePana: winsFor(key, "close pana"),
      win: 0,
    };
    row.bet += Number(r.res_bet_amt || 0);
    row.win += Number(r.res_win_amt || 0);
    byGame.set(key, row);
  });
  const games = [...byGame.values()];

  return {
    games,
    winners,
    totalBet: Number(total.res_bet_amt || 0),
    totalWin: -Number(total.res_win_amt || 0),
    commissionLabel: commission.res_game.replace("Commsion", "Commission").replace("(", " ("),
    commission: Number(commission.res_bet_amt || 0),
    remaining: Number(remaining.res_bet_amt || 0),
    conclusion: Number(conclusion.res_win_amt || 0),
  };
};

// One of the two summary rows a game has in the Settlement tab, e.g. "Sri Devi (open)" and "Sri Devi (close)".
export type SideRow = { key: string; game: string; bet: number; win: number };

export const sideRows = (rows: PaymentData[]): SideRow[] =>
  rows.flatMap((r) => {
    if (r.res_type !== "") return [];
    const m = r.res_game.trim().match(/^(.*?)\s*\((open|close)\)$/);
    if (!m) return [];
    const name = m[1].trim().replace(/\s+/g, " ");
    return [{ key: `${normName(name)} (${m[2]})`, game: `${name} (${m[2]})`, bet: Number(r.res_bet_amt || 0), win: Number(r.res_win_amt || 0) }];
  });
