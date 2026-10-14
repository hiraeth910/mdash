import React, { useEffect, useMemo, useState } from "react";
import { DatePicker, Table, Select, Spin, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { apiClient } from "./utils/api";
import { normName, buildSettlement, fmt, type PaymentData, type GameRow } from "./utils/settlement";
import BillTable, { type BillRow } from "./BillTable";
import { searchProps } from "./utils/selectSearch";

interface IGroup {
  group_id: number;
  group_name: string;
  admin_id?: number | null;
}

interface Props {
  groups: IGroup[];
  adminNames: Record<number, string>;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const amountCell = (v: number) => <span className="settle-num">{fmt(v)}</span>;

const gameColumns = [
  { title: "Game", dataIndex: "game", key: "game" },
  { title: "Bet", dataIndex: "bet", key: "bet", align: "right" as const, render: amountCell },
  { title: "Winning", dataIndex: "win", key: "win", align: "right" as const, render: amountCell },
];

// Pick a group name: every group with that name shows that day's per-game bet/winning rows (no
// totals). Tick game rows across those tables to gather them in one BillTable (same calculation and
// adjustment-row functionality as the Bills tab), each row's amount being its winning minus its bet.
const DayGroupTab: React.FC<Props> = ({ groups, adminNames }) => {
  const [name, setName] = useState<string | null>(null);
  const [date, setDate] = useState<Dayjs>(dayjs());
  const [gamesByGroup, setGamesByGroup] = useState<Record<number, GameRow[]>>({});
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});

  const adminLabel = (g: IGroup) => adminNames[g.admin_id ?? -1] || `Admin #${g.admin_id}`;

  // Unique group names; the groups carrying a name, in admin order.
  const byName = useMemo(() => {
    const map = new Map<string, IGroup[]>();
    groups.forEach((g) => map.set(normName(g.group_name), [...(map.get(normName(g.group_name)) || []), g]));
    map.forEach((list) => list.sort((a, b) => adminLabel(a).localeCompare(adminLabel(b))));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, adminNames]);

  const options = useMemo(
    () =>
      [...byName.entries()]
        .map(([key, list]) => ({ value: key, label: list.length > 1 ? `${list[0].group_name} (${list.length} groups)` : list[0].group_name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [byName]
  );

  const chosen = useMemo(() => (name ? byName.get(name) ?? [] : []), [name, byName]);
  const chosenKey = chosen.map((g) => g.group_id).join(",");
  const dateStr = date.format("YYYY-MM-DD");

  useEffect(() => {
    setPicked([]);
    setOverrides({});
  }, [name, dateStr]);

  useEffect(() => {
    if (chosen.length === 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const entries = await Promise.all(
          chosen.map(async (g) => {
            const res = await apiClient.post<PaymentData[]>("/group-payments-by-date", {
              gamedate: dateStr,
              groupid: g.group_id,
              gameid: 0,
            });
            const settlement = buildSettlement(res.data);
            return [g.group_id, settlement?.games ?? []] as const;
          })
        );
        if (!cancelled) setGamesByGroup(Object.fromEntries(entries));
      } catch {
        if (!cancelled) message.error("Failed to load the day's games");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenKey, dateStr]);

  const keyOf = (g: IGroup, gameKey: string) => `${g.group_id}|${gameKey}`;
  const multi = chosen.length > 1;

  const pickedRows: BillRow[] = chosen.flatMap((g) =>
    (gamesByGroup[g.group_id] ?? []).flatMap((row) => {
      const key = keyOf(g, row.key);
      if (!picked.includes(key)) return [];
      return [{ key, label: row.game, group: multi ? adminLabel(g) : undefined, amount: overrides[key] ?? round2(row.win - row.bet) }];
    })
  );

  return (
    <div className="week-tab">
      <div className="inputs-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Select {...searchProps}
          showSearch
          placeholder="Select group name"
          style={{ minWidth: 260 }}
          value={name}
          onChange={setName}
          options={options}
          optionFilterProp="label"
          getPopupContainer={() => document.body}
        />
        <DatePicker
          value={date}
          format="DD-MM-YYYY"
          allowClear={false}
          onChange={(d) => d && setDate(d)}
          disabledDate={(d) => d.isAfter(dayjs(), "day")}
        />
      </div>
      {name === null ? (
        <p className="day-hint">Pick a group name to see that day's games for every group with that name.</p>
      ) : loading ? (
        <div style={{ textAlign: "center", padding: 50 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
        </div>
      ) : (
        <div className="week-split">
          <div className="week-groups">
            {chosen.map((g) => {
              const rows = (gamesByGroup[g.group_id] ?? []).map((r) => ({ ...r, key: keyOf(g, r.key) }));
              const mine = rows.filter((r) => picked.includes(r.key)).map((r) => r.key);
              return (
                <div className="table-container week-group" key={g.group_id}>
                  <h3 className="week-group__title">
                    {g.group_name}
                    <span className="week-group__admin">{adminLabel(g)}</span>
                  </h3>
                  <Table
                    className="week-table"
                    size="small"
                    bordered
                    pagination={false}
                    dataSource={rows}
                    columns={gameColumns}
                    rowKey="key"
                    locale={{ emptyText: "No bets for this group on this date" }}
                    rowSelection={{
                      selectedRowKeys: mine,
                      onSelect: (record, selected) =>
                        setPicked((p) => (selected ? [...p, String(record.key)] : p.filter((k) => k !== String(record.key)))),
                      onSelectAll: (selected) =>
                        setPicked((p) => {
                          const others = p.filter((k) => !rows.some((r) => r.key === k));
                          return selected ? [...others, ...rows.map((r) => r.key)] : others;
                        }),
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="week-selected">
            <h3 className="week-group__title">Selected games</h3>
            <BillTable
              rows={pickedRows}
              labelHeader="Game"
              groupHeader="Admin"
              periodLabel="Day"
              imageGroupColumn={false}
              onAmount={(key, v) => setOverrides((o) => ({ ...o, [key]: v }))}
              imageTitle={`${(chosen[0]?.group_name ?? "").trim()} — day`}
              imageSubtitle={date.format("DD-MM-YYYY")}
              fileName={`DayGroup_${dateStr}_${(chosen[0]?.group_name ?? "group").trim()}.png`}
              emptyText="Tick games in the tables; they are listed here and their amounts can be edited."
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default DayGroupTab;
