import React, { useEffect, useMemo, useState } from "react";
import { DatePicker, Select, Spin, Table, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { apiClient } from "./utils/api";
import { normName } from "./utils/settlement";
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

type WeekRow = { key: string; date: string; amount: number };

const color = (v: number) => (v < 0 ? "red" : "#009416ff");
const typeOf = (v: number) => (v < 0 ? "Payment" : v > 0 ? "Due" : "");

// Monday of the week the date falls in (weeks run Monday to Sunday).
const mondayOf = (d: Dayjs) => d.startOf("day").subtract((d.day() + 6) % 7, "day");
const lastWeekMonday = () => mondayOf(dayjs()).subtract(7, "day");

// Pick a group name: every group with that name shows its week side by side. Tick days to gather
// them in one table (amounts editable there) with total, L/D, week due, old due and the final figure.
const WeekTab: React.FC<Props> = ({ groups, adminNames }) => {
  const [name, setName] = useState<string | null>(null);
  const [monday, setMonday] = useState<Dayjs>(lastWeekMonday);
  const [amounts, setAmounts] = useState<Record<number, number[]>>({});
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [overrides, setOverrides] = useState<Record<string, number>>({});
  const [refreshTick, setRefreshTick] = useState(0);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => monday.add(i, "day")), [monday]);
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

  useEffect(() => {
    setPicked([]);
    setOverrides({});
  }, [name, monday]);

  useEffect(() => {
    if (chosen.length === 0) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const entries = await Promise.all(
          chosen.map(async (g) => {
            const results = await Promise.all(
              days.map(async (d) => {
                const res = await apiClient.post<{ res_win_amt: number }[]>("/group-payments-by-date", {
                  gamedate: d.format("YYYY-MM-DD"),
                  groupid: g.group_id,
                  gameid: 0,
                });
                return res.data.length > 0 ? Number(res.data[res.data.length - 1].res_win_amt) || 0 : 0;
              })
            );
            return [g.group_id, results] as const;
          })
        );
        if (!cancelled) setAmounts(Object.fromEntries(entries));
      } catch {
        if (!cancelled) message.error("Failed to load the week");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenKey, days, refreshTick]);

  // A recalculation started from the header: load the week again (typed-over amounts are dropped).
  useEffect(() => {
    const refresh = () => {
      setOverrides({});
      setRefreshTick((n) => n + 1);
    };
    window.addEventListener("recalculated", refresh);
    return () => window.removeEventListener("recalculated", refresh);
  }, []);

  const keyOf = (g: IGroup, i: number) => `${g.group_id}|${i}`;
  const amountOf = (g: IGroup, i: number) => overrides[keyOf(g, i)] ?? amounts[g.group_id]?.[i] ?? 0;
  const multi = chosen.length > 1;

  const pickedRows: BillRow[] = chosen.flatMap((g) =>
    days.flatMap((d, i) =>
      picked.includes(keyOf(g, i))
        ? [{ key: keyOf(g, i), label: d.format("ddd, DD-MM-YYYY"), group: multi ? adminLabel(g) : undefined, amount: amountOf(g, i) }]
        : []
    )
  );

  const range = `${days[0].format("DD-MM-YYYY")} to ${days[6].format("DD-MM-YYYY")}`;

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
          picker="week"
          allowClear={false}
          value={monday}
          onChange={(d) => d && setMonday(mondayOf(d))}
          format={() => `${monday.format("DD-MM-YYYY")} – ${monday.add(6, "day").format("DD-MM-YYYY")}`}
          disabledDate={(d) => d.isAfter(dayjs(), "day")}
        />
      </div>
      {name === null ? (
        <p className="day-hint">Pick a group name to see its week (Monday to Sunday) for every group with that name. Showing last week.</p>
      ) : loading ? (
        <div style={{ textAlign: "center", padding: 50 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
        </div>
      ) : (
        <div className="week-split">
          <div className="week-groups">
            {chosen.map((g) => {
              const rows: WeekRow[] = days.map((d, i) => ({ key: keyOf(g, i), date: d.format("ddd, DD-MM-YYYY"), amount: amountOf(g, i) }));
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
                    columns={[
                      { title: "Date", dataIndex: "date", key: "date" },
                      { title: "Due/Payment", key: "type", render: (_: unknown, r: WeekRow) => typeOf(r.amount) },
                      {
                        title: "Amount",
                        key: "amount",
                        align: "right" as const,
                        render: (_: unknown, r: WeekRow) => <span style={{ color: color(r.amount) }}>{r.amount}</span>,
                      },
                    ]}
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
            <h3 className="week-group__title">Selected days</h3>
            <BillTable
              rows={pickedRows}
              labelHeader="Date"
              groupHeader="Admin"
              periodLabel="Week"
              onAmount={(key, v) => setOverrides((o) => ({ ...o, [key]: v }))}
              imageTitle={`${chosen[0]?.group_name ?? ""} — week`}
              imageSubtitle={range}
              fileName={`Week_${days[0].format("DD-MM-YYYY")}_${chosen[0]?.group_name ?? "group"}.png`}
              emptyText="Tick days in the tables; they are listed here and their amounts can be edited."
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default WeekTab;
