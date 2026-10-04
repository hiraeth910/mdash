import React, { useEffect, useMemo, useState } from "react";
import { Button, DatePicker, InputNumber, Select, Spin, Table, message } from "antd";
import { LoadingOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { apiClient } from "./utils/api";
import { downloadTableImage, renderTableImage, type TableImage } from "./utils/tableImage";

interface IGroup {
  group_id: number;
  group_name: string;
  admin_id?: number | null;
}

interface Props {
  groups: IGroup[];
  adminNames: Record<number, string>;
}

type Row = {
  key: string;
  kind: "day" | "total" | "ld" | "calc" | "cd" | "final";
  label: string;
  type: string; // "Due" / "Payment" for the days
  amount: number;
};

const round2 = (v: number) => Math.round(v * 100) / 100;
const color = (v: number) => (v < 0 ? "red" : "#009416ff");
const typeOf = (v: number) => (v < 0 ? "Payment" : v > 0 ? "Due" : "");

// Monday of the week the date falls in (weeks run Monday to Sunday).
const mondayOf = (d: Dayjs) => d.startOf("day").subtract((d.day() + 6) % 7, "day");
const lastWeekMonday = () => mondayOf(dayjs()).subtract(7, "day");

// One group's final due/payment for each day of a week, then L/D and CD taken off the total.
const WeekTab: React.FC<Props> = ({ groups, adminNames }) => {
  const [groupId, setGroupId] = useState<number | null>(null);
  const [monday, setMonday] = useState<Dayjs>(lastWeekMonday);
  const [amounts, setAmounts] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [ldPercent, setLdPercent] = useState<number | null>(null);
  const [cdPercent, setCdPercent] = useState<number | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => monday.add(i, "day")), [monday]);
  const group = groups.find((g) => g.group_id === groupId) ?? null;

  const options = useMemo(
    () =>
      [...groups]
        .map((g) => ({
          value: g.group_id,
          label: `${g.group_name} — ${adminNames[g.admin_id ?? -1] || `Admin #${g.admin_id}`}`,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [groups, adminNames]
  );

  useEffect(() => {
    if (groupId === null) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const results = await Promise.all(
          days.map(async (d) => {
            const res = await apiClient.post<{ res_win_amt: number }[]>("/group-payments-by-date", {
              gamedate: d.format("YYYY-MM-DD"),
              groupid: groupId,
              gameid: 0,
            });
            return res.data.length > 0 ? Number(res.data[res.data.length - 1].res_win_amt) || 0 : 0;
          })
        );
        if (!cancelled) setAmounts(results);
      } catch {
        if (!cancelled) message.error("Failed to load the week");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [groupId, days, refreshTick]);

  // A recalculation started from the header: load the week again.
  useEffect(() => {
    const refresh = () => setRefreshTick((n) => n + 1);
    window.addEventListener("recalculated", refresh);
    return () => window.removeEventListener("recalculated", refresh);
  }, []);

  const total = round2(amounts.reduce((s, v) => s + v, 0));
  // The percent keeps the sign of the total and is subtracted, so "minus a minus" adds back.
  const ldPct = ldPercent || 0;
  const ldAmount = round2((total * ldPct) / 100);
  const afterLd = round2(total - ldAmount);
  // CD is only offered when the total is a due (positive); it comes off the amount above it.
  const cdAvailable = total > 0;
  const cdPct = cdAvailable ? cdPercent || 0 : 0;
  const cdAmount = round2((afterLd * cdPct) / 100);
  const finalAmount = round2(afterLd - cdAmount);
  const finalLabel = finalAmount < 0 ? "Final payment" : "Final due";

  const rows: Row[] = [
    ...days.map((d, i) => ({ key: d.format("YYYY-MM-DD"), kind: "day" as const, label: d.format("ddd, DD-MM-YYYY"), type: typeOf(amounts[i] ?? 0), amount: amounts[i] ?? 0 })),
    { key: "total", kind: "total", label: "Total", type: "", amount: total },
    { key: "ld", kind: "ld", label: "L/D", type: "", amount: ldAmount },
    { key: "calc", kind: "calc", label: "After L/D", type: "", amount: afterLd },
    ...(cdAvailable ? [{ key: "cd", kind: "cd" as const, label: "CD", type: "", amount: cdAmount }] : []),
    { key: "final", kind: "final", label: finalLabel, type: "", amount: finalAmount },
  ];

  const percentInput = (value: number | null, onChange: (v: number | null) => void, label: string) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <strong>{label}</strong>
      <InputNumber
        size="small"
        min={0}
        max={100}
        value={value}
        onChange={(v) => onChange(v === null ? null : Number(v))}
        addonAfter="%"
        placeholder={`${label} %`}
        aria-label={`${label} percent`}
        style={{ width: 120 }}
      />
    </span>
  );

  const columns = [
    {
      title: "Date",
      key: "label",
      render: (_: unknown, r: Row) =>
        r.kind === "ld" ? (
          percentInput(ldPercent, setLdPercent, "L/D")
        ) : r.kind === "cd" ? (
          percentInput(cdPercent, setCdPercent, "CD")
        ) : r.kind === "day" ? (
          r.label
        ) : (
          <strong>{r.label}</strong>
        ),
    },
    { title: "Due/Payment", dataIndex: "type", key: "type" },
    {
      title: "Amount",
      key: "amount",
      align: "right" as const,
      render: (_: unknown, r: Row) => (
        <span style={{ color: r.kind === "ld" || r.kind === "cd" ? undefined : color(r.amount), fontWeight: r.kind === "day" ? undefined : 700 }}>
          {r.amount}
        </span>
      ),
    },
  ];

  // Rows whose percent is zero are left out of the picture.
  const image = (): TableImage => {
    const tone = (v: number) => (v < 0 ? ("negative" as const) : ("positive" as const));
    const dayRows = days.map((d, i) => ({
      cells: [d.format("ddd, DD-MM-YYYY"), typeOf(amounts[i] ?? 0), String(amounts[i] ?? 0)],
      tone: tone(amounts[i] ?? 0),
    }));
    return {
      title: `${group?.group_name ?? ""} — ${adminNames[group?.admin_id ?? -1] || ""}`.replace(/ — $/, ""),
      subtitle: `${days[0].format("DD-MM-YYYY")} to ${days[6].format("DD-MM-YYYY")}`,
      fileName: `Week_${days[0].format("DD-MM-YYYY")}_${group?.group_name ?? "group"}.png`,
      sections: [
        {
          columns: [{ header: "Date" }, { header: "Due/Payment" }, { header: "Amount", align: "right" }],
          rows: [
            ...dayRows,
            { cells: ["Total", "", String(total)], bold: true, shaded: true, tone: tone(total) },
            ...(ldPct > 0
              ? [
                  { cells: [`L/D ${ldPct}%`, "", String(ldAmount)] },
                  { cells: ["After L/D", "", String(afterLd)], bold: true, tone: tone(afterLd) },
                ]
              : []),
            ...(cdPct > 0 ? [{ cells: [`CD ${cdPct}%`, "", String(cdAmount)] }] : []),
            { cells: [finalLabel, "", String(finalAmount)], bold: true, shaded: true, tone: tone(finalAmount) },
          ],
        },
      ],
    };
  };

  const copyImage = async () => {
    const img = image();
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": renderTableImage(img) })]);
      message.success("Image copied. Paste it where you want to send it.");
    } catch {
      downloadTableImage(img).catch(() => message.error("Could not create the image"));
      message.info("Couldn't copy the image here, so it was downloaded instead.");
    }
  };

  return (
    <div className="week-tab">
      <div className="inputs-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Select
          showSearch
          placeholder="Select group"
          style={{ minWidth: 260 }}
          value={groupId}
          onChange={setGroupId}
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
        <Button onClick={copyImage} disabled={groupId === null || loading}>
          Copy image
        </Button>
      </div>
      {groupId === null ? (
        <p className="day-hint">Pick a group to see its week (Monday to Sunday). Showing last week.</p>
      ) : loading ? (
        <div style={{ textAlign: "center", padding: 50 }}>
          <Spin indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
        </div>
      ) : (
        <div className="table-container" style={{ marginTop: 20, maxWidth: 560 }}>
          <Table
            className="week-table"
            columns={columns}
            dataSource={rows}
            pagination={false}
            bordered
            size="small"
            rowClassName={(r) => (r.kind === "day" ? "" : "total-row")}
          />
          {!cdAvailable && <p className="day-hint">CD is available when the total is a due (positive).</p>}
        </div>
      )}
    </div>
  );
};

export default WeekTab;
