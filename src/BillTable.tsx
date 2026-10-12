import React, { useState } from "react";
import { Button, Input, InputNumber, Select, Table, message } from "antd";
import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { downloadTableImage, renderTableImage, type TableImage } from "./utils/tableImage";
import { PaymentDetailsForm, paymentImageSections, usePaymentDetails } from "./PaymentDetails";
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
  imageGroupColumn?: boolean; // false leaves the group (admin) column out of the picture
}

type Line = {
  key: string;
  kind: "row" | "total" | "ld" | "period" | "custom" | "cd" | "old" | "final";
  label: string;
  group?: string;
  amount: number;
  sign?: 1 | -1;
  rawAmount?: number;
};

type CustomRow = { key: string; title: string; sign: 1 | -1; amount: number };

const newCustomKey = () => `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const round2 = (v: number) => Math.round(v * 100) / 100;
const color = (v: number) => (v < 0 ? "red" : "#009416ff");
const typeOf = (v: number) => (v < 0 ? "Payment" : v > 0 ? "Due" : "");
const rowKinds: Line["kind"][] = ["row", "custom"];

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
  imageGroupColumn = true,
}) => {
  const [ldPercent, setLdPercent] = useState<number | null>(null);
  const [cdPercent, setCdPercent] = useState<number | null>(null);
  const [oldType, setOldType] = useState<"due" | "payment">("due");
  const [oldAmount, setOldAmount] = useState<number | null>(null);
  const [customRows, setCustomRows] = useState<CustomRow[]>([]);
  const [payInfo, setPayInfo, payStatus, savePayInfoNow] = usePaymentDetails();

  const addCustomRow = () => setCustomRows((rs) => [...rs, { key: newCustomKey(), title: "", sign: 1, amount: 0 }]);
  const updateCustomRow = (key: string, patch: Partial<CustomRow>) =>
    setCustomRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const removeCustomRow = (key: string) => setCustomRows((rs) => rs.filter((r) => r.key !== key));
  const moveCustomRow = (key: string, dir: -1 | 1) =>
    setCustomRows((rs) => {
      const idx = rs.findIndex((r) => r.key === key);
      const next = idx + dir;
      if (idx === -1 || next < 0 || next >= rs.length) return rs;
      const copy = [...rs];
      [copy[idx], copy[next]] = [copy[next], copy[idx]];
      return copy;
    });

  const hasGroup = rows.some((r) => r.group);
  const total = round2(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0));
  // The percent keeps the sign of the total and is subtracted, so "minus a minus" adds back.
  const ldPct = ldPercent || 0;
  const ldAmount = round2((total * ldPct) / 100);
  const period = round2(total - ldAmount);
  const periodName = `${periodLabel} ${period < 0 ? "payment" : "due"}`;
  // Each adjustment row does the math with the row above it (the period, or the previous
  // adjustment row), so re-ordering them with the up/down buttons changes the running totals below.
  const customChain = customRows.reduce<(CustomRow & { running: number })[]>((acc, r) => {
    const prevRunning = acc.length > 0 ? acc[acc.length - 1].running : period;
    const running = round2(prevRunning + r.sign * (Number(r.amount) || 0));
    return [...acc, { ...r, running }];
  }, []);
  const effectivePeriod = customChain.length > 0 ? customChain[customChain.length - 1].running : period;
  const cdAvailable = total > 0;
  const cdPct = cdAvailable ? cdPercent || 0 : 0;
  const cdAmount = round2((effectivePeriod * cdPct) / 100);
  const afterCd = round2(effectivePeriod - cdAmount);
  const oldDelta = oldType === "due" ? oldAmount || 0 : -(oldAmount || 0);
  const finalAmount = round2(afterCd + oldDelta);
  const finalLabel = finalAmount < 0 ? "Final payment" : "Final due";

  const lines: Line[] = [
    ...rows.map((r) => ({ key: r.key, kind: "row" as const, label: r.label, group: r.group, amount: Number(r.amount) || 0 })),
    { key: "§total", kind: "total", label: "Total", amount: total },
    { key: "§ld", kind: "ld", label: "L/D", amount: ldAmount },
    { key: "§period", kind: "period", label: periodName, amount: period },
    ...customChain.map((c) => ({ key: c.key, kind: "custom" as const, label: c.title, amount: c.running, sign: c.sign, rawAmount: c.amount })),
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
        if (r.kind === "custom") {
          return (
            <Input
              size="small"
              value={r.label}
              placeholder="Adjustment title"
              aria-label="Adjustment row title"
              onChange={(e) => updateCustomRow(r.key, { title: e.target.value })}
            />
          );
        }
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
      render: (_: unknown, r: Line) => (r.kind === "row" || r.kind === "custom" ? typeOf(r.amount) : ""),
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
        if (r.kind === "custom") {
          return (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
              <span style={{ display: "inline-flex", gap: 4 }}>
                <Select
                  size="small"
                  value={r.sign}
                  onChange={(v) => updateCustomRow(r.key, { sign: v })}
                  getPopupContainer={() => document.body}
                  style={{ width: 56 }}
                  aria-label={`Sign for ${r.label || "adjustment row"}`}
                  options={[
                    { value: 1, label: "+" },
                    { value: -1, label: "−" },
                  ]}
                />
                <InputNumber
                  size="small"
                  controls={false}
                  precision={2}
                  value={r.rawAmount}
                  onChange={(v) => updateCustomRow(r.key, { amount: v === null ? 0 : Number(v) })}
                  aria-label={`Amount for ${r.label || "adjustment row"}`}
                  style={{ width: 90 }}
                  changeOnWheel={false}
                />
              </span>
              <strong style={{ color: color(r.amount) }}>{r.amount}</strong>
            </div>
          );
        }
        const plain = r.kind === "ld" || r.kind === "cd";
        return <strong style={{ color: plain ? undefined : color(r.amount), textAlign: "right", display: "block" }}>{r.amount}</strong>;
      },
    },
    ...(onRemove || customRows.length > 0
      ? [
          {
            title: "",
            key: "remove",
            width: customRows.length > 0 ? 112 : 44,
            render: (_: unknown, r: Line) => {
              if (r.kind === "row" && onRemove) {
                return (
                  <Button size="small" type="text" danger icon={<DeleteOutlined />} aria-label={`Remove ${r.label || "row"}`} onClick={() => onRemove(r.key)} />
                );
              }
              if (r.kind === "custom") {
                const idx = customRows.findIndex((c) => c.key === r.key);
                return (
                  <span style={{ display: "inline-flex" }}>
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowUpOutlined />}
                      aria-label={`Move ${r.label || "adjustment row"} up`}
                      disabled={idx <= 0}
                      onClick={() => moveCustomRow(r.key, -1)}
                    />
                    <Button
                      size="small"
                      type="text"
                      icon={<ArrowDownOutlined />}
                      aria-label={`Move ${r.label || "adjustment row"} down`}
                      disabled={idx === -1 || idx >= customRows.length - 1}
                      onClick={() => moveCustomRow(r.key, 1)}
                    />
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`Remove ${r.label || "adjustment row"}`}
                      onClick={() => removeCustomRow(r.key)}
                    />
                  </span>
                );
              }
              return null;
            },
          },
        ]
      : []),
  ];

  // Rows whose percent is zero (L/D, CD) or amount is zero (old) are left out of the picture.
  const image = (): TableImage => {
    const imageGroup = hasGroup && imageGroupColumn;
    const tone = (v: number) => (v < 0 ? ("negative" as const) : ("positive" as const));
    const cells = (label: string, group: string | undefined, type: string, amount: number) =>
      imageGroup ? [label, group ?? "", type, String(amount)] : [label, type, String(amount)];
    return {
      title: imageTitle,
      subtitle: imageSubtitle,
      fileName,
      sections: [
        {
          columns: [
            { header: labelHeader },
            ...(imageGroup ? [{ header: groupHeader }] : []),
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
            ...customChain.map((c) => ({
              cells: cells(c.title || "Adjustment", undefined, typeOf(c.running), c.running),
              tone: tone(c.running),
            })),
            ...(cdPct > 0 ? [{ cells: cells(`CD ${cdPct}%`, undefined, "", cdAmount) }] : []),
            ...((oldAmount || 0) > 0 ? [{ cells: cells(oldType === "due" ? "Old due" : "Old payment", undefined, "", oldDelta), tone: tone(oldDelta) }] : []),
            { cells: cells(finalLabel, undefined, "", finalAmount), bold: true, shaded: true, tone: tone(finalAmount) },
          ],
        },
        ...(finalAmount > 0 ? paymentImageSections(payInfo) : []),
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
        <Button size="small" icon={<PlusOutlined />} onClick={addCustomRow}>
          Add adjustment row
        </Button>
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
      {finalAmount > 0 && <PaymentDetailsForm info={payInfo} onChange={setPayInfo} status={payStatus} onSaveNow={savePayInfoNow} />}
    </div>
  );
};

export default BillTable;
