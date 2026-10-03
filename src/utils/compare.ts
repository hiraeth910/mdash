import type { SideRow } from "./settlement";

// The figures that have to agree for two groups' rows to count as the same.
export const COMPARE_COLUMNS = ["bet", "win"] as const;
export type CompareColumn = (typeof COMPARE_COLUMNS)[number];

// Which bet types make up each side of a game.
export const SIDE_TYPES: Record<"open" | "close", number[]> = { open: [2, 3, 4], close: [7, 9] };

// One accumulated number of a group: what was bet on it (all records added up).
export interface NumberAmount {
  typeId: number;
  type: string;
  number: string;
  amount: number;
}

// A number whose accumulated bet is not the same in every group.
export interface NumberDiff {
  key: string;
  typeId: number;
  type: string;
  number: string;
  amounts: number[]; // one per group, in group order (0 when the group has no bet on it)
  gap: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CompareGroup {
  groupId: number;
  adminName: string; // the admin account the group belongs to
  userName: string; // the user(s) the group is assigned to
  groupName: string;
  userId: number | null; // the user bets are entered for in this group (the first one assigned), if any
  games: SideRow[]; // the open and close rows of every game
  numbers: Record<string, NumberAmount[]>; // accumulated numbers of each open/close row, by row key
}

export interface CompareRow {
  groupId: number;
  adminName: string;
  userName: string;
  groupName: string;
  userId: number | null;
  row: SideRow | null; // null: this group has no such row
  differs: Record<CompareColumn, boolean>; // columns whose value is not the same in every group
}

export interface GameMismatch {
  key: string;
  game: string;
  rows: CompareRow[];
  // The biggest gap between any two groups in each column (a group with no row counts as 0).
  diff: Record<CompareColumn, number>;
  // Numbers whose accumulated bet differs. A row can have these even when its totals are equal
  // (one number up and another down), so they count as a mismatch on their own.
  numbers: NumberDiff[];
  numbersTotal: number; // sum of the numbers' gaps
}

const numberDiffs = (groups: CompareGroup[], key: string): NumberDiff[] => {
  const byKey = new Map<string, NumberDiff>();
  groups.forEach((g, gi) =>
    (g.numbers[key] ?? []).forEach((n) => {
      const id = `${n.typeId}|${n.number}`;
      const row = byKey.get(id) ?? { key: id, typeId: n.typeId, type: n.type, number: n.number, amounts: groups.map(() => 0), gap: 0 };
      row.amounts[gi] = round2(row.amounts[gi] + n.amount);
      byKey.set(id, row);
    })
  );
  return [...byKey.values()]
    .map((r) => ({ ...r, gap: round2(Math.max(...r.amounts) - Math.min(...r.amounts)) }))
    .filter((r) => r.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.type.localeCompare(b.type) || a.number.localeCompare(b.number, undefined, { numeric: true }));
};

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
    const numbers = numberDiffs(groups, key);
    const same = present.length === rows.length && !COMPARE_COLUMNS.some((c) => differs[c]) && numbers.length === 0;
    if (same) return;
    const gap = (c: CompareColumn) => {
      const values = rows.map((r) => (r ? r[c] : 0));
      return Math.round((Math.max(...values) - Math.min(...values)) * 100) / 100;
    };
    mismatches.push({
      key,
      game,
      diff: Object.fromEntries(COMPARE_COLUMNS.map((c) => [c, gap(c)])) as Record<CompareColumn, number>,
      numbers,
      numbersTotal: round2(numbers.reduce((t, n) => t + n.gap, 0)),
      rows: groups.map((g, i) => ({ groupId: g.groupId, adminName: g.adminName, userName: g.userName, groupName: g.groupName, userId: g.userId, row: rows[i], differs })),
    });
  });
  const gameCount = new Set(order.map((o) => o.key.replace(/ \((open|close)\)$/, ""))).size;
  return { total: order.length, gameCount, mismatches };
};
