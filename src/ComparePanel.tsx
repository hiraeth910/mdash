import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, Select, Spin, Table, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { apiClient } from "./utils/api";
import { fmt, normName, sideRows, type PaymentData } from "./utils/settlement";
import { COMPARE_COLUMNS, SIDE_TYPES, compareGames, type CompareColumn, type CompareGroup, type GameMismatch, type NumberAmount, type NumberDiff } from "./utils/compare";
import { downloadTableImage, renderTableImage, type TableImage } from "./utils/tableImage";
import { searchProps } from "./utils/selectSearch";
import NumbersDiffModal, { type DiffMember } from "./NumbersDiffModal";

export interface IGroupRow {
  group_id: number;
  group_name: string;
  admin_id?: number | null;
}
export interface IUserRow {
  user_id: number;
  user_name: string;
  user_role: string;
  admin_id: number | null;
  group_ids: number[] | null;
}
export interface AdminOption {
  id: number;
  name: string;
}
export interface GamesMap {
  gameIds: Map<string, number>; // normalised game name -> id
  byNorm: Map<string, { gameid: number; gamename: string }>;
}

interface Props {
  date: string;
  groups: IGroupRow[];
  adminOptions: AdminOption[];
  plainUsers: IUserRow[];
  gamesMap: GamesMap;
  className?: string;
}

interface NameSection {
  name: string;
  admins: string[];
  total: number;
  gameCount: number;
  mismatches: GameMismatch[];
}

type TableRow = {
  key: string;
  first: boolean;
  middle: boolean;
  groupSize: number;
  diff: Record<CompareColumn, number>;
  game: string;
  members: DiffMember[];
  numbers: NumberDiff[];
  numbersTotal: number;
  section: string;
  mismatchKey: string;
  gameBase: string;
  user: string;
  band: number;
  missing: boolean;
  values: Record<CompareColumn, number | null>;
  differs: Record<CompareColumn, boolean>;
};

const HEADINGS: Record<CompareColumn, string> = { bet: "Bet amount", win: "Win amount" };

// One admin-vs-admin comparison: pick the two admins and every group name both of them have is
// compared automatically (same as the old single-page view, just scoped to this pair instead of
// every admin at once). Independent of any other panel on the page.
const ComparePanel: React.FC<Props> = ({ date, groups, adminOptions, plainUsers, gamesMap, className }) => {
  const [admin1, setAdmin1] = useState<number | null>(null);
  const [admin2, setAdmin2] = useState<number | null>(null);
  const [sections, setSections] = useState<NameSection[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const latestLoad = useRef(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [numbersKey, setNumbersKey] = useState<{ section: string; key: string } | null>(null);

  // Group names both chosen admins have (each gets its own comparison card).
  const repeated = useMemo(() => {
    if (admin1 === null || admin2 === null) return [];
    const mine = groups.filter((g) => g.admin_id === admin1 || g.admin_id === admin2);
    const byName = new Map<string, IGroupRow[]>();
    mine.forEach((g) => byName.set(normName(g.group_name), [...(byName.get(normName(g.group_name)) || []), g]));
    return [...byName.values()]
      .filter((list) => list.length >= 2)
      .sort((a, b) => a[0].group_name.localeCompare(b[0].group_name));
  }, [admin1, admin2, groups]);

  const repeatedKey = repeated.map((list) => list.map((g) => g.group_id).join(",")).join("|");

  useEffect(() => {
    const refresh = () => setRefreshTick((n) => n + 1);
    window.addEventListener("recalculated", refresh);
    return () => window.removeEventListener("recalculated", refresh);
  }, []);

  useEffect(() => {
    if (admin1 === null || admin2 === null) {
      setSections([]);
      setReady(false);
      return;
    }
    const loadId = ++latestLoad.current;
    setLoading(true);
    setReady(false);
    (async () => {
      try {
        const adminNameOf = (id: number) => adminOptions.find((a) => a.id === id)?.name || `Admin #${id}`;
        const built = await Promise.all(
          repeated.map(async (list): Promise<NameSection> => {
            const compared: CompareGroup[] = await Promise.all(
              list.map(async (g) => {
                const res = await apiClient.post<PaymentData[]>("/group-payments-by-date", { gamedate: date, groupid: g.group_id, gameid: 0 });
                const adminName = adminNameOf(g.admin_id ?? -1);
                const assignedUsers = plainUsers.filter((u) => (u.group_ids || []).map(Number).includes(g.group_id)).sort((a, b) => a.user_name.localeCompare(b.user_name));
                const assigned = assignedUsers.map((u) => u.user_name);
                const games = sideRows(res.data);
                const numbers: Record<string, NumberAmount[]> = {};
                const bases = [...new Set(games.map((r) => r.key.replace(/ \((open|close)\)$/, "")))];
                await Promise.all(
                  bases.map(async (base) => {
                    const gameid = gamesMap.gameIds.get(base);
                    if (gameid === undefined) throw new Error(`Game not found: ${base}`);
                    const items = (
                      await apiClient.post<{ itypeid: number; itypename: string; inumber: string | number; total_amount: number }[]>("/summed-history-by-uid", {
                        userid: 0,
                        date,
                        game: gameid,
                        groupid: [g.group_id],
                      })
                    ).data;
                    (["open", "close"] as const).forEach((side) => {
                      numbers[`${base} (${side})`] = items
                        .filter((it) => SIDE_TYPES[side].includes(Number(it.itypeid)))
                        .map((it) => ({ typeId: Number(it.itypeid), type: it.itypename, number: String(it.inumber), amount: Number(it.total_amount || 0) }));
                    });
                  })
                );
                return {
                  groupId: g.group_id,
                  adminName,
                  userName: assigned.join(", ") || `No user (${adminName})`,
                  groupName: g.group_name,
                  userId: assignedUsers[0]?.user_id ?? null,
                  games,
                  numbers,
                };
              })
            );
            return { name: list[0].group_name, admins: compared.map((c) => c.adminName), ...compareGames(compared) };
          })
        );
        if (loadId === latestLoad.current) setSections(built);
      } catch {
        if (loadId === latestLoad.current) message.error("Failed to load the groups' data");
      } finally {
        if (loadId === latestLoad.current) {
          setLoading(false);
          setReady(true);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin1, admin2, repeatedKey, date, refreshTick]);

  const tableRows = (mismatches: GameMismatch[], section = ""): TableRow[] =>
    mismatches.flatMap((m, index) => {
      const base = (x: GameMismatch) => x.key.replace(/ \((open|close)\)$/, "");
      const band = mismatches.slice(0, index + 1).filter((x, i, all) => i === 0 || base(x) !== base(all[i - 1])).length;
      return m.rows.map((r, i) => ({
        key: `${m.key}-${r.groupId}`,
        first: i === 0,
        middle: i === Math.floor((m.rows.length - 1) / 2),
        groupSize: m.rows.length,
        diff: m.diff,
        game: m.game,
        members: m.rows.map((x) => ({ groupId: x.groupId, userName: x.userName, userId: x.userId, groupName: x.groupName })),
        numbers: m.numbers,
        numbersTotal: m.numbersTotal,
        section,
        mismatchKey: m.key,
        gameBase: m.game.replace(/ \((open|close)\)$/, ""),
        user: r.userName,
        band,
        missing: r.row === null,
        values: Object.fromEntries(COMPARE_COLUMNS.map((c) => [c, r.row ? r.row[c] : null])) as Record<CompareColumn, number | null>,
        differs: r.differs,
      }));
    });

  const numbersFor = numbersKey
    ? tableRows(sections.find((x) => x.name === numbersKey.section)?.mismatches ?? [], numbersKey.section).find((r) => r.mismatchKey === numbersKey.key) ?? null
    : null;

  useEffect(() => {
    if (numbersKey && !loading && ready && !numbersFor) setNumbersKey(null);
  }, [numbersKey, loading, ready, numbersFor]);

  const settleNumber = async (row: TableRow, n: NumberDiff) => {
    const game = gamesMap.byNorm.get(normName(row.gameBase));
    if (!game) throw new Error("Game not found");
    const top = Math.max(...n.amounts);
    const items = row.members.flatMap((m, i) => {
      const missing = Math.round((top - n.amounts[i]) * 100) / 100;
      if (missing <= 0) return [];
      if (m.userId === null) throw new Error(`No user is assigned to ${m.groupName} (${m.userName})`);
      return [{ group: m.groupId, grpname: m.groupName, uid: m.userId, typeid: n.typeId, type: n.type, number: n.number, amount: missing }];
    });
    await apiClient.post("/settle-numbers", { gameid: game.gameid, game: game.gamename, date, items });
    message.success(`Settled ${n.number}: ${items.length} bet${items.length > 1 ? "s" : ""} added`);
    setRefreshTick((t) => t + 1);
  };

  const columns = [
    { title: "Game", dataIndex: "game", key: "game" },
    { title: "User", dataIndex: "user", key: "user" },
    ...COMPARE_COLUMNS.map((c) => ({
      title: HEADINGS[c],
      key: c,
      align: "right" as const,
      render: (_: unknown, r: TableRow) =>
        r.missing ? <span className="compare-missing">{c === "bet" ? "No data" : ""}</span> : <span className={r.differs[c] ? "compare-diff" : undefined}>{fmt(r.values[c])}</span>,
    })),
    {
      title: "Difference",
      key: "difference",
      align: "center" as const,
      onCell: (r: TableRow) => ({ rowSpan: r.first ? r.groupSize : 0 }),
      render: (_: unknown, r: TableRow) =>
        r.first ? (
          <div className="compare-difference">
            {COMPARE_COLUMNS.map((c) => (
              <span key={c}>
                {c === "bet" ? "Bet" : "Win"} <strong className={r.diff[c] ? "compare-gap" : undefined}>{fmt(r.diff[c])}</strong>
              </span>
            ))}
            {r.numbers.length > 0 && (
              <>
                <span className="compare-gap">
                  {r.numbers.length} number{r.numbers.length > 1 ? "s" : ""} differ
                </span>
                <Button size="small" onClick={() => setNumbersKey({ section: r.section, key: r.mismatchKey })}>
                  View numbers
                </Button>
              </>
            )}
          </div>
        ) : null,
    },
  ];

  const totalDiffs = sections.reduce((n, s) => n + s.mismatches.length, 0);

  const compareImage = (): TableImage | null => {
    const differing = sections.filter((s) => s.mismatches.length > 0);
    if (differing.length === 0) return null;
    const matching = sections.filter((s) => s.mismatches.length === 0 && s.total > 0).map((s) => s.name);
    return {
      title: `Compare — ${adminOptions.find((a) => a.id === admin1)?.name ?? ""} vs ${adminOptions.find((a) => a.id === admin2)?.name ?? ""} — ${dayjs(date).format("DD-MM-YYYY")}`,
      subtitle: matching.length ? `All games match: ${matching.join(", ")}` : undefined,
      fileName: `Compare_${dayjs(date).format("DD-MM-YYYY")}.png`,
      sections: differing.map((s) => ({
        heading: `${s.name} — ${s.admins.join(" · ")}`,
        columns: [
          { header: "Game" },
          { header: "User" },
          ...COMPARE_COLUMNS.map((c) => ({ header: HEADINGS[c], align: "right" as const })),
          { header: "Difference", align: "center" as const },
        ],
        rows: tableRows(s.mismatches).map((r) => ({
          cells: [
            r.game,
            r.user,
            ...COMPARE_COLUMNS.map((c, i) => (r.missing ? (i === 0 ? "No data" : "") : fmt(r.values[c]))),
            r.middle ? `Bet ${fmt(r.diff.bet)} · Win ${fmt(r.diff.win)}${r.numbers.length ? ` · ${r.numbers.length} number${r.numbers.length > 1 ? "s" : ""} differ (total ${fmt(r.numbersTotal)})` : ""}` : "",
          ],
          shaded: r.band % 2 === 1,
          marked: [...(r.missing ? [] : COMPARE_COLUMNS.flatMap((c, i) => (r.differs[c] ? [i + 2] : []))), ...(r.middle ? [COMPARE_COLUMNS.length + 2] : [])],
        })),
      })),
    };
  };

  const copyImage = async () => {
    const image = compareImage();
    if (!image) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": renderTableImage(image) })]);
      message.success("Image copied. Paste it where you want to send it.");
    } catch {
      downloadTableImage(image).catch(() => message.error("Could not create the image"));
      message.info("Couldn't copy the image here, so it was downloaded instead.");
    }
  };

  const otherOptions = (exclude: number | null) => adminOptions.filter((a) => a.id !== exclude);

  return (
    <div className={`table-container compare-card${className ? ` ${className}` : ""}`} style={{ maxHeight: "none", height: "auto", overflow: "visible" }}>
      <div className="compare-panel__pickers">
        <Select {...searchProps} placeholder="First admin" value={admin1 ?? undefined} onChange={setAdmin1} getPopupContainer={() => document.body} style={{ minWidth: 180 }} options={otherOptions(admin2).map((a) => ({ value: a.id, label: a.name }))} />
        <span className="compare-panel__vs">vs</span>
        <Select {...searchProps} placeholder="Second admin" value={admin2 ?? undefined} onChange={setAdmin2} getPopupContainer={() => document.body} style={{ minWidth: 180 }} options={otherOptions(admin1).map((a) => ({ value: a.id, label: a.name }))} />
        {!loading && ready && (
          <Button onClick={copyImage} disabled={totalDiffs === 0}>
            Copy image
          </Button>
        )}
      </div>

      {admin1 === null || admin2 === null ? (
        <p className="compare-note">Pick two admins to compare.</p>
      ) : loading || !ready ? (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 32 }} spin />} />
        </div>
      ) : repeated.length === 0 ? (
        <p className="compare-note">No group name is used by both admins.</p>
      ) : (
        <>
          <p className="compare-summary">
            {repeated.length} group name{repeated.length > 1 ? "s" : ""} shared ·{" "}
            {totalDiffs === 0 ? "everything tallies" : `${totalDiffs} row${totalDiffs > 1 ? "s" : ""} differ`}
          </p>
          {sections.map((s) => (
            <div key={s.name} className="compare-panel__section">
              <h3>
                {s.name}
                <span className="compare-admins">{s.admins.join(" · ")}</span>
              </h3>
              {s.mismatches.length === 0 ? (
                <p className="compare-ok">{s.total === 0 ? "No bets in these groups on this date." : `All ${s.gameCount} game${s.gameCount > 1 ? "s" : ""} match.`}</p>
              ) : (
                <>
                  <p className="compare-note">
                    {s.mismatches.length} of {s.total} rows differ (each game's open and close rows are compared on their own). Differing figures are marked.
                  </p>
                  <Table
                    className="settlement-table compare-table"
                    dataSource={tableRows(s.mismatches, s.name)}
                    columns={columns}
                    pagination={false}
                    size="middle"
                    scroll={{ x: "max-content" }}
                    rowClassName={(r) => (r.band % 2 ? "compare-band-odd" : "compare-band-even")}
                  />
                </>
              )}
            </div>
          ))}
        </>
      )}

      {numbersKey && (
        <NumbersDiffModal
          onClose={() => setNumbersKey(null)}
          onSettle={numbersFor ? (n) => settleNumber(numbersFor, n) : undefined}
          title={`${numbersFor?.game ?? ""} — numbers that differ · ${dayjs(date).format("DD-MM-YYYY")}`}
          members={numbersFor?.members ?? []}
          numbers={numbersFor?.numbers ?? []}
          total={numbersFor?.numbersTotal ?? 0}
        />
      )}
    </div>
  );
};

export default ComparePanel;
