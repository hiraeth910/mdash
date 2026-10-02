import type { SideRow } from "./settlement";

// The figures that have to agree for two groups' rows to count as the same.
export const COMPARE_COLUMNS = ["bet", "win"] as const;
export type CompareColumn = (typeof COMPARE_COLUMNS)[number];

export interface CompareGroup {
  groupId: number;
  adminName: string; // the admin account the group belongs to
  userName: string; // the user(s) the group is assigned to
  games: SideRow[]; // the open and close rows of every game
}

export interface CompareRow {
  groupId: number;
  adminName: string;
  userName: string;
  row: SideRow | null; // null: this group has no such row
  differs: Record<CompareColumn, boolean>; // columns whose value is not the same in every group
}

export interface GameMismatch {
  key: string;
  game: string;
  rows: CompareRow[];
  // The biggest gap between any two groups in each column (a group with no row counts as 0).
  diff: Record<CompareColumn, number>;
}

// A game has two rows (open and close) and each is compared on its own across the groups. Rows where
// every group has the same figures are left out; for the others every group's row is returned.
export const compareGames = (groups: CompareGroup[]): { total: number; gameCount: number; mismatches: GameMismatch[] } => {
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
    const present = rows.filter((r): r is SideRow => r !== null);
    const differs = Object.fromEntries(
      COMPARE_COLUMNS.map((c) => [c, present.some((r) => r[c] !== present[0][c])])
    ) as Record<CompareColumn, boolean>;
    const same = present.length === rows.length && !COMPARE_COLUMNS.some((c) => differs[c]);
    if (same) return;
    const gap = (c: CompareColumn) => {
      const values = rows.map((r) => (r ? r[c] : 0));
      return Math.round((Math.max(...values) - Math.min(...values)) * 100) / 100;
    };
    mismatches.push({
      key,
      game,
      diff: Object.fromEntries(COMPARE_COLUMNS.map((c) => [c, gap(c)])) as Record<CompareColumn, number>,
      rows: groups.map((g, i) => ({ groupId: g.groupId, adminName: g.adminName, userName: g.userName, row: rows[i], differs })),
    });
  });
  const gameCount = new Set(order.map((o) => o.key.replace(/ \((open|close)\)$/, ""))).size;
  return { total: order.length, gameCount, mismatches };
};
