import type { GameRow } from "./settlement";

// The per-game figures that have to agree for two groups' rows to count as the same.
export const COMPARE_COLUMNS = ["bet", "open", "jodi", "openPana", "close", "closePana", "win"] as const;
export type CompareColumn = (typeof COMPARE_COLUMNS)[number];

export interface CompareGroup {
  groupId: number;
  adminName: string; // the admin account the group belongs to, not a user
  games: GameRow[];
}

export interface CompareRow {
  groupId: number;
  adminName: string;
  row: GameRow | null; // null: this group has no row for the game
  differs: Record<CompareColumn, boolean>; // columns whose value is not the same in every group
}

export interface GameMismatch {
  key: string;
  game: string;
  rows: CompareRow[];
}

// Compares the same game across several groups. Games where every group has the same figures in
// every column are left out; for the others every group's row is returned.
export const compareGames = (groups: CompareGroup[]): { total: number; mismatches: GameMismatch[] } => {
  const order: { key: string; game: string }[] = [];
  const seen = new Set<string>();
  groups.forEach((g) =>
    g.games.forEach((row) => {
      if (!seen.has(row.key)) {
        seen.add(row.key);
        order.push({ key: row.key, game: row.game });
      }
    })
  );

  const mismatches: GameMismatch[] = [];
  order.forEach(({ key, game }) => {
    const rows = groups.map((g) => g.games.find((r) => r.key === key) ?? null);
    const present = rows.filter((r): r is GameRow => r !== null);
    const differs = Object.fromEntries(
      COMPARE_COLUMNS.map((c) => [c, present.some((r) => r[c] !== present[0][c])])
    ) as Record<CompareColumn, boolean>;
    const same = present.length === rows.length && !COMPARE_COLUMNS.some((c) => differs[c]);
    if (same) return;
    mismatches.push({
      key,
      game,
      rows: groups.map((g, i) => ({ groupId: g.groupId, adminName: g.adminName, row: rows[i], differs })),
    });
  });
  return { total: order.length, mismatches };
};
