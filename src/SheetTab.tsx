import React, { useEffect, useState } from "react";
import { Button, Input } from "antd";
import dayjs from "dayjs";
import BillTable, { type BillRow } from "./BillTable";

const STORAGE_KEY = "day-sheet";

type Saved = { title: string; rows: BillRow[] };

const newKey = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const load = (): Saved => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (parsed && typeof parsed.title === "string" && Array.isArray(parsed.rows)) {
      return {
        title: parsed.title,
        rows: parsed.rows.map((r: BillRow) => ({ key: String(r.key), label: String(r.label ?? ""), amount: Number(r.amount) || 0 })),
      };
    }
  } catch {
    // start with an empty sheet
  }
  return { title: "", rows: [{ key: newKey(), label: "", amount: 0 }] };
};

// A free-form bill: rows with any name and amount, then the usual closing lines (total, L/D, old
// due/payment, final). The sheet is kept in this browser so a refresh does not lose it.
const SheetTab: React.FC = () => {
  const [initial] = useState(load);
  const [title, setTitle] = useState(initial.title);
  const [rows, setRows] = useState<BillRow[]>(initial.rows);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ title, rows }));
    } catch {
      // keeping the sheet is a convenience
    }
  }, [title, rows]);

  const today = dayjs().format("DD-MM-YYYY");

  return (
    <div className="sheet-tab">
      <div className="inputs-row" style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <Input
          style={{ maxWidth: 320 }}
          placeholder="Bill title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Bill title"
        />
        <Button
          onClick={() => {
            setTitle("");
            setRows([{ key: newKey(), label: "", amount: 0 }]);
          }}
        >
          New sheet
        </Button>
      </div>
      <div className="table-container" style={{ marginTop: 20, maxWidth: 640 }}>
        <BillTable
          rows={rows}
          labelHeader="Name"
          periodLabel="Bill"
          onAmount={(key, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, amount: v } : r)))}
          onLabel={(key, v) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, label: v } : r)))}
          onRemove={(key) => setRows((rs) => rs.filter((r) => r.key !== key))}
          onAdd={() => setRows((rs) => [...rs, { key: newKey(), label: "", amount: 0 }])}
          imageTitle={title.trim() || "Bill"}
          imageSubtitle={today}
          fileName={`${(title.trim() || "Bill").replace(/[^\w\- ]+/g, "")}_${today}.png`}
        />
      </div>
    </div>
  );
};

export default SheetTab;
