import React, { useState } from "react";
import { Button, Input, InputNumber, Select, Table, message } from "antd";
import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { downloadTableImage, renderTableImage, type TableImage } from "./utils/tableImage";
import { searchProps } from "./utils/selectSearch";

export type BillRow = {
  key: string;
  label: string;
  group?: string; // shown in its own column when any row has one
  amount: number;
};

interface Props {
  rows: BillRow[];
  labelHeader: string; // "Date", "Name"
  groupHeader?: string;
  periodLabel: string; // "Week" -> "Week due" / "Week payment"
  onAmount: (key: string, value: number) => void;
  onLabel?: (key: string, value: string) => void; // makes the names editable
  onRemove?: (key: string) => void;
  onAdd?: () => void;
  imageTitle: string;
  imageSubtitle?: string;
  fileName: string;
  emptyText?: string;
}

type Line = {
  key: string;
  kind: "row" | "total" | "ld" | "period" | "cd" | "old" | "final";
  label: string;
  group?: string;
  amount: number;
};

const round2 = (v: number) => Math.round(v * 100) / 100;
const color = (v: number) => (v < 0 ? "red" : "#009416ff");
const typeOf = (v: number) => (v < 0 ? "Payment" : v > 0 ? "Due" : "");
const rowKinds: Line["kind"][] = ["row"];

// Rows of amounts (editable) with the closing lines every bill here has: total, L/D, the period's
// due/payment, CD (only when the total is a due), old due/payment and the final figure.
const BillTable: React.FC<Props> = ({
  rows,
  labelHeader,
  groupHeader = "Group",
  periodLabel,
  onAmount,
  onLabel,
  onRemove,
  onAdd,
  imageTitle,
  imageSubtitle,
  fileName,
  emptyText,
}) => {
  const [ldPercent, setLdPercent] = useState<number | null>(null);
  const [cdPercent, setCdPercent] = useState<number | null>(null);
  const [oldType, setOldType] = useState<"due" | "payment">("due");
  const [oldAmount, setOldAmount] = useState<number | null>(null);

  const hasGroup = rows.some((r) => r.group);
  const total = round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  // The percent keeps the sign of the total and is subtracted, so "minus a minus" adds back.
  const ldPct = ldPercent || 0;
  const ldAmount = round2((total * ldPct) / 100);
  const period = round2(total - ldAmount);
  const periodName = `${periodLabel} ${period < 0 ? "payment" : "due"}`;
  const cdAvailable = total > 0;
  const cdPct = cdAvailable ? cdPercent || 0 : 0;
  const cdAmount = round2((period * cdPct) / 100);
  const afterCd = round2(period - cdAmount);
  const oldDelta = oldType === "due" ? oldAmount || 0 : -(oldAmount || 0);
  const finalAmount = round2(afterCd + oldDelta);
  const finalLabel = finalAmount < 0 ? "Final payment" : "Final due";

  const lines: Line[] = [
    ...rows.map((r) => ({ key: r.key, kind: "row" as const, label: r.label, group: r.group, amount: Number(r.amount) || 0 })),
    { key: "§total", kind: "total", label: "Total", amount: total },
    { key: "§ld", kind: "ld", label: "L/D", amount: ldAmount },
    { key: "§period", kind: "period", label: periodName, amount: period },
    ...(cdAvailable ? [{ key: "§cd", kind: "cd" as const, label: "CD", amount: cdAmount }] : []),
    { key: "§old", kind: "old", label: "Old", amount: oldDelta },
    { key: "§final", kind: "final", label: finalLabel, amount: finalAmount },
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
      title: labelHeader,
      key: "label",
      render: (_: unknown, r: Line) => {
        if (r.kind === "row") {
          return onLabel ? (
            <Input size="small" value={r.label} placeholder="Name" aria-label="Row name" onChange={(e) => onLabel(r.key, e.target.value)} />
          ) : (
            r.label
          );
        }
        if (r.kind === "ld") return percentInput(ldPercent, setLdPercent, "L/D");
        if (r.kind === "cd") return percentInput(cdPercent, setCdPercent, "CD");
        if (r.kind === "old") {
          return (
            <Select {...searchProps}
              size="small"
              value={oldType}
              onChange={setOldType}
              getPopupContainer={() => document.body}
              style={{ width: 130 }}
              options={[
                { value: "due", label: "Old due" },
                { value: "payment", label: "Old payment" },
              ]}
            />
          );
        }
        return <strong>{r.label}</strong>;
      },
    },
    ...(hasGroup ? [{ title: groupHeader, dataIndex: "group", key: "group" }] : []),
    {
      title: "Due/Payment",
      key: "type",
      render: (_: unknown, r: Line) => (r.kind === "row" ? typeOf(r.amount) : ""),
    },
    {
      title: "Amount",
      key: "amount",
      align: "right" as const,
      render: (_: unknown, r: Line) => {
        if (r.kind === "row") {
          return (
            <InputNumber
              size="small"
              controls={false}
              value={r.amount}
              onChange={(v) => onAmount(r.key, v === null ? 0 : Number(v))}
              aria-label={`Amount for ${r.label}`}
              style={{ width: 120 }}
              precision={2}
              changeOnWheel={false}
            />
          );
        }
        if (r.kind === "old") {
          return (
            <InputNumber
              size="small"
              min={0}
              controls={false}
              value={oldAmount}
              onChange={(v) => setOldAmount(v === null ? null : Math.max(Number(v) || 0, 0))}
              aria-label="Old balance amount"
              style={{ width: 120 }}
            />
          );
        }
        const plain = r.kind === "ld" || r.kind === "cd";
        return <strong style={{ color: plain ? undefined : color(r.amount), textAlign: "right", display: "block" }}>{r.amount}</strong>;
      },
    },
    ...(onRemove
      ? [
          {
            title: "",
            key: "remove",
            width: 44,
            render: (_: unknown, r: Line) =>
              r.kind === "row" ? (
                <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${r.label || "row"}`} onClick={() => onRemove(r.key)} />
              ) : null,
          },
        ]
      : []),
  ];

  // Rows whose percent is zero (L/D, CD) or amount is zero (old) are left out of the picture.
  const image = (): TableImage => {
    const tone = (v: number) => (v < 0 ? ("negative" as const) : ("positive" as const));
    const cells = (label: string, group: string | undefined, type: string, amount: number) =>
      hasGroup ? [label, group ?? "", type, String(amount)] : [label, type, String(amount)];
    return {
      title: imageTitle,
      subtitle: imageSubtitle,
      fileName,
      sections: [
        {
          columns: [
            { header: labelHeader },
            ...(hasGroup ? [{ header: groupHeader }] : []),
            { header: "Due/Payment" },
            { header: "Amount", align: "right" as const },
          ],
          rows: [
            ...rows.map((r) => ({ cells: cells(r.label, r.group, typeOf(r.amount), Number(r.amount) || 0), tone: tone(Number(r.amount) || 0) })),
            { cells: cells("Total", undefined, "", total), bold: true, shaded: true, tone: tone(total) },
            ...(ldPct > 0
              ? [
                  { cells: cells(`L/D ${ldPct}%`, undefined, "", ldAmount) },
                  { cells: cells(periodName, undefined, "", period), bold: true, tone: tone(period) },
                ]
              : []),
            ...(cdPct > 0 ? [{ cells: cells(`CD ${cdPct}%`, undefined, "", cdAmount) }] : []),
            ...((oldAmount || 0) > 0 ? [{ cells: cells(oldType === "due" ? "Old due" : "Old payment", undefined, "", oldDelta), tone: tone(oldDelta) }] : []),
            { cells: cells(finalLabel, undefined, "", finalAmount), bold: true, shaded: true, tone: tone(finalAmount) },
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
    <div className="bill-table">
      <div className="bill-table__tools">
        {onAdd && (
          <Button size="small" icon={<PlusOutlined />} onClick={onAdd}>
            Add row
          </Button>
        )}
        <Button size="small" onClick={copyImage}>
          Copy image
        </Button>
      </div>
      {rows.length === 0 && emptyText && <p className="day-hint">{emptyText}</p>}
      <Table
        columns={columns}
        dataSource={lines}
        pagination={false}
        bordered
        size="small"
        rowClassName={(r) => (rowKinds.includes(r.kind) ? "" : "total-row")}
      />
      {!cdAvailable && <p className="day-hint">CD is available when the total is a due (positive).</p>}
    </div>
  );
};

export default BillTable;
