import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button, DatePicker, Spin, Table, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { Link } from "react-router-dom";
import { apiClient } from "./utils/api";
import { checkAuthAndHandleLogout } from "./authcheck";
import { fmt, normName, sideRows, type PaymentData } from "./utils/settlement";
import { COMPARE_COLUMNS, SIDE_TYPES, compareGames, type CompareColumn, type CompareGroup, type GameMismatch, type NumberAmount, type NumberDiff } from "./utils/compare";
import { downloadTableImage, renderTableImage, type TableImage } from "./utils/tableImage";
import NumbersDiffModal, { type DiffMember } from "./NumbersDiffModal";
import "./datatable.css";

interface IGroupRow {
  group_id: number;
  group_name: string;
  admin_id?: number | null;
}
interface IUserRow {
  user_id: number;
  user_name: string;
  user_role: string;
  admin_id: number | null;
  group_ids: number[] | null;
}

interface NameSection {
  name: string;
  admins: string[];
  total: number; // rows compared: an open and a close row per game
  gameCount: number;
  mismatches: GameMismatch[];
}

type TableRow = {
  key: string;
  first: boolean; // first row of a game's group of rows: carries the merged Difference cell
  middle: boolean; // the row of the group that carries the difference in the copied image
  groupSize: number;
  diff: Record<CompareColumn, number>;
  game: string;
  members: DiffMember[];
  numbers: NumberDiff[]; // accumulated numbers whose bet differs
  numbersTotal: number;
  user: string;
  band: number;
  missing: boolean;
  values: Record<CompareColumn, number | null>;
  differs: Record<CompareColumn, boolean>;
};

const HEADINGS: Record<CompareColumn, string> = {
  bet: "Bet amount",
  win: "Win amount",
};

const Compare: React.FC = () => {
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [groups, setGroups] = useState<IGroupRow[]>([]);
  const [adminNames, setAdminNames] = useState<Record<number, string>>({});
  const [sections, setSections] = useState<NameSection[]>([]);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const latestLoad = useRef(0);
  const adminNamesRef = useRef(adminNames);
  adminNamesRef.current = adminNames;
  const [refreshTick, setRefreshTick] = useState(0);
  const [numbersFor, setNumbersFor] = useState<TableRow | null>(null);
  const [plainUsers, setPlainUsers] = useState<IUserRow[]>([]);
  const plainUsersRef = useRef(plainUsers);
  plainUsersRef.current = plainUsers;

  useEffect(() => {
    (async () => {
      try {
        if (!(await checkAuthAndHandleLogout())) return;
        const [groupsRes, usersRes] = await Promise.all([
          apiClient.get<IGroupRow[]>("/groups"),
          apiClient.get<{ users: IUserRow[] }>("/users"),
        ]);
        const names: Record<number, string> = {};
        usersRes.data.users.forEach((u) => {
          if (u.admin_id !== null && u.user_id === u.admin_id) names[u.user_id] = u.user_name;
        });
        setAdminNames(names);
        setPlainUsers(usersRes.data.users.filter((u) => u.user_role === "user"));
        setGroups(groupsRes.data);
      } catch {
        message.error("Failed to load groups");
      } finally {
        setReady(true);
      }
    })();
  }, []);

  // Group names that more than one group carries (each belongs to a different admin).
  const repeated = useMemo(() => {
    const byName = new Map<string, IGroupRow[]>();
    groups.forEach((g) => byName.set(normName(g.group_name), [...(byName.get(normName(g.group_name)) || []), g]));
    return [...byName.values()]
      .filter((list) => list.length >= 2)
      .sort((a, b) => a[0].group_name.localeCompare(b[0].group_name));
  }, [groups]);

  // Reload only when the set of groups or the date really changes, not when the same list is fetched again.
  const repeatedKey = repeated.map((list) => list.map((g) => g.group_id).join(",")).join("|");

  useEffect(() => {
    if (!ready) return;
    const loadId = ++latestLoad.current;
    setLoading(true);
    (async () => {
      try {
        const gameIds = new Map<string, number>(
          (await apiClient.get<{ gameid: number; gamename: string }[]>("/games")).data.map((g) => [normName(g.gamename), g.gameid])
        );
        const built = await Promise.all(
          repeated.map(async (list): Promise<NameSection> => {
            const compared: CompareGroup[] = await Promise.all(
              list.map(async (g) => {
                const res = await apiClient.post<PaymentData[]>("/group-payments-by-date", {
                  gamedate: date,
                  groupid: g.group_id,
                  gameid: 0,
                });
                const adminName = adminNamesRef.current[g.admin_id ?? -1] || `Admin #${g.admin_id}`;
                // the users this group is assigned to, found the way the Users screen links them (group ids)
                const assigned = plainUsersRef.current
                  .filter((u) => (u.group_ids || []).map(Number).includes(g.group_id))
                  .map((u) => u.user_name)
                  .sort((a, b) => a.localeCompare(b));
                const games = sideRows(res.data);
                // each game's accumulated numbers, so rows whose totals tally but whose numbers don't are caught
                const numbers: Record<string, NumberAmount[]> = {};
                const bases = [...new Set(games.map((r) => r.key.replace(/ \((open|close)\)$/, "")))];
                await Promise.all(
                  bases.map(async (base) => {
                    const gameid = gameIds.get(base);
                    if (gameid === undefined) throw new Error(`Game not found: ${base}`);
                    const items = (
                      await apiClient.post<{ itypeid: number; itypename: string; inumber: string | number; total_amount: number }[]>(
                        "/summed-history-by-uid",
                        { userid: 0, date, game: gameid, groupid: [g.group_id] }
                      )
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
        if (loadId === latestLoad.current) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, repeatedKey, date, refreshTick]);

  // A recalculation started from the header: load the figures again.
  useEffect(() => {
    const refresh = () => setRefreshTick((n) => n + 1);
    window.addEventListener("recalculated", refresh);
    return () => window.removeEventListener("recalculated", refresh);
  }, []);

  const columns = [
    { title: "Game", dataIndex: "game", key: "game" },
    { title: "User", dataIndex: "user", key: "user" },
    ...COMPARE_COLUMNS.map((c) => ({
      title: HEADINGS[c],
      key: c,
      align: "right" as const,
      render: (_: unknown, r: TableRow) =>
        r.missing ? (
          <span className="compare-missing">{c === "bet" ? "No data" : ""}</span>
        ) : (
          <span className={r.differs[c] ? "compare-diff" : undefined}>{fmt(r.values[c])}</span>
        ),
    })),
    {
      // One cell per game row-group, merged over its rows and centred: the biggest gap in bet and in win.
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
                <Button size="small" onClick={() => setNumbersFor(r)}>
                  View numbers
                </Button>
              </>
            )}
          </div>
        ) : null,
    },
  ];

  const tableRows = (mismatches: GameMismatch[]): TableRow[] =>
    mismatches.flatMap((m, index) => {
      // an open and a close row of the same game share a band
      const base = (x: GameMismatch) => x.key.replace(/ \((open|close)\)$/, "");
      const band = mismatches.slice(0, index + 1).filter((x, i, all) => i === 0 || base(x) !== base(all[i - 1])).length;
      return m.rows.map((r, i) => ({
        key: `${m.key}-${r.groupId}`,
        first: i === 0,
        middle: i === Math.floor((m.rows.length - 1) / 2),
        groupSize: m.rows.length,
        diff: m.diff,
        game: m.game,
        members: m.rows.map((x) => ({ groupId: x.groupId, userName: x.userName })),
        numbers: m.numbers,
        numbersTotal: m.numbersTotal,
        user: r.userName,
        band,
        missing: r.row === null,
        values: Object.fromEntries(COMPARE_COLUMNS.map((c) => [c, r.row ? r.row[c] : null])) as Record<CompareColumn, number | null>,
        differs: r.differs,
      }));
    });

  const totalDiffs = sections.reduce((n, s) => n + s.mismatches.length, 0);

  // One picture of every group name that has differing games; names that fully match are listed in the subtitle.
  const compareImage = (): TableImage | null => {
    const differing = sections.filter((s) => s.mismatches.length > 0);
    if (differing.length === 0) return null;
    const matching = sections.filter((s) => s.mismatches.length === 0 && s.total > 0).map((s) => s.name);
    return {
      title: `Compare groups — ${date}`,
      subtitle: matching.length ? `All games match: ${matching.join(", ")}` : undefined,
      fileName: `Compare_${date}.png`,
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
            // the picture cannot merge cells, so the difference sits on the middle row of its group
            r.middle ? `Bet ${fmt(r.diff.bet)} · Win ${fmt(r.diff.win)}${r.numbers.length ? ` · ${r.numbers.length} number${r.numbers.length > 1 ? "s" : ""} differ (total ${fmt(r.numbersTotal)})` : ""}` : "",
          ],
          shaded: r.band % 2 === 1,
          marked: [...(r.missing ? [] : COMPARE_COLUMNS.flatMap((c, i) => (r.differs[c] ? [i + 2] : []))), ...(r.middle ? [COMPARE_COLUMNS.length + 2] : [])],
        })),
      })),
    };
  };

  // Puts the picture on the clipboard; browsers that cannot copy images download it instead.
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

  return (
    <div className="data-page">
      <div className="header top-nav">
        <Link to="/users">Users</Link>
        <Link to="/games">Games</Link>
        <Link to="/groups">Groups</Link>
        <Link to="/result/:gameid/:gamename">Settlement</Link>
        <Link to="/summary">Day</Link>
        <Link to="/compare" className="active">Compare</Link>
      </div>
      <div className="new-header" style={{ maxHeight: "none" }}>
        <h2>Compare groups</h2>
        <div className="inputs-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <DatePicker value={dayjs(date)} onChange={(d) => setDate(d?.format("YYYY-MM-DD") || date)} />
          <Button onClick={copyImage} disabled={loading || totalDiffs === 0}>
            Copy image
          </Button>
          {!loading && ready && repeated.length > 0 && (
            <span className="compare-summary">
              {repeated.length} group name{repeated.length > 1 ? "s" : ""} used by more than one admin ·{" "}
              {totalDiffs === 0 ? "everything tallies" : `${totalDiffs} row${totalDiffs > 1 ? "s" : ""} differ`}
            </span>
          )}
        </div>
      </div>

      {loading || !ready ? (
        <div className="loading-container" style={{ textAlign: "center", padding: 50 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
        </div>
      ) : repeated.length === 0 ? (
        <div style={{ textAlign: "center", marginTop: 20 }}>No group name is used by more than one admin.</div>
      ) : (
        <div className="payment-summary-container settlement">
          {sections.map((s) => (
            <div className="table-container compare-card" key={s.name} style={{ maxHeight: "none", height: "auto", overflow: "visible" }}>
              <h3>
                {s.name}
                <span className="compare-admins">{s.admins.join(" · ")}</span>
              </h3>
              {s.mismatches.length === 0 ? (
                <p className="compare-ok">
                  {s.total === 0 ? "No bets in these groups on this date." : `All ${s.gameCount} game${s.gameCount > 1 ? "s" : ""} match.`}
                </p>
              ) : (
                <>
                  <p className="compare-note">
                    {s.mismatches.length} of {s.total} rows differ (each game's open and close rows are compared on their own). Differing figures are marked.
                  </p>
                  <Table
                    className="settlement-table compare-table"
                    dataSource={tableRows(s.mismatches)}
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
        </div>
      )}
      {numbersFor && (
        <NumbersDiffModal
          onClose={() => setNumbersFor(null)}
          title={`${numbersFor.game} — numbers that differ · ${date}`}
          members={numbersFor.members}
          numbers={numbersFor.numbers}
          total={numbersFor.numbersTotal}
        />
      )}
    </div>
  );
};

export default Compare;
