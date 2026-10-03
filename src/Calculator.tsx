import React, { useCallback, useEffect, useState } from "react";
import { Button, Modal } from "antd";
import { CalculatorOutlined } from "@ant-design/icons";
import "./Calculator.css";

const STORAGE_KEY = "calculator-history";
const KEEP_MS = 7 * 24 * 60 * 60 * 1000;

type Entry = { expr: string; result: string; at: number };

const readHistory = (): Entry[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - KEEP_MS;
    return parsed.filter((e) => e && typeof e.expr === "string" && typeof e.result === "string" && Number(e.at) >= cutoff);
  } catch {
    return [];
  }
};

const writeHistory = (entries: Entry[]) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // history is a convenience; ignore storage failures
  }
};

// + - × ÷ with the usual precedence, decimals and a leading minus. No eval.
export const evaluate = (expr: string): number | null => {
  const tokens = expr.match(/\d+\.?\d*|\.\d+|[+\-×÷*/]/g);
  if (!tokens || tokens.join("") !== expr.replace(/\s+/g, "")) return null;
  let pos = 0;
  const factor = (): number | null => {
    let sign = 1;
    while (tokens[pos] === "-" || tokens[pos] === "+") {
      if (tokens[pos] === "-") sign = -sign;
      pos++;
    }
    const t = tokens[pos];
    if (t === undefined || /^[×÷*/]$/.test(t)) return null;
    pos++;
    return sign * Number(t);
  };
  const term = (): number | null => {
    let left = factor();
    while (left !== null && (tokens[pos] === "×" || tokens[pos] === "*" || tokens[pos] === "÷" || tokens[pos] === "/")) {
      const op = tokens[pos++];
      const right = factor();
      if (right === null) return null;
      if (op === "÷" || op === "/") {
        if (right === 0) return null;
        left /= right;
      } else left *= right;
    }
    return left;
  };
  let value = term();
  while (value !== null && (tokens[pos] === "+" || tokens[pos] === "-")) {
    const op = tokens[pos++];
    const right = term();
    if (right === null) return null;
    value = op === "+" ? value + right : value - right;
  }
  if (value === null || pos !== tokens.length || !Number.isFinite(value)) return null;
  return Math.round(value * 1e10) / 1e10;
};

// A plain decimal string (never 1e-7), so an answer can be used in the next sum.
const plain = (n: number) => (/e/i.test(String(n)) ? n.toFixed(10).replace(/\.?0+$/, "") : String(n));

const show = (n: number) => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 10 }).format(n);

const KEYS: { label: string; key: string; kind?: "op" | "action" | "equals" }[] = [
  { label: "C", key: "C", kind: "action" },
  { label: "⌫", key: "Backspace", kind: "action" },
  { label: "÷", key: "÷", kind: "op" },
  { label: "×", key: "×", kind: "op" },
  { label: "7", key: "7" },
  { label: "8", key: "8" },
  { label: "9", key: "9" },
  { label: "-", key: "-", kind: "op" },
  { label: "4", key: "4" },
  { label: "5", key: "5" },
  { label: "6", key: "6" },
  { label: "+", key: "+", kind: "op" },
  { label: "1", key: "1" },
  { label: "2", key: "2" },
  { label: "3", key: "3" },
  { label: "=", key: "=", kind: "equals" },
  { label: "0", key: "0" },
  { label: ".", key: "." },
];

const CalculatorPanel: React.FC = () => {
  const [expr, setExpr] = useState("");
  const [shown, setShown] = useState("0");
  const [justDone, setJustDone] = useState(false);
  const [history, setHistory] = useState<Entry[]>(readHistory);

  const press = useCallback(
    (key: string) => {
      const isOp = /^[+\-×÷]$/.test(key);
      if (key === "C") {
        setExpr("");
        setShown("0");
        setJustDone(false);
      } else if (key === "Backspace") {
        const next = justDone ? "" : expr.slice(0, -1);
        setExpr(next);
        setShown(next || "0");
        setJustDone(false);
      } else if (key === "=") {
        if (!expr) return;
        const value = evaluate(expr);
        if (value === null) {
          setShown("Error");
          setJustDone(true);
          setExpr("");
          return;
        }
        const entry: Entry = { expr, result: plain(value), at: Date.now() };
        setHistory((h) => {
          const next = [entry, ...h].filter((e) => e.at >= Date.now() - KEEP_MS).slice(0, 500);
          writeHistory(next);
          return next;
        });
        setExpr(plain(value));
        setShown(show(value));
        setJustDone(true);
      } else if (isOp) {
        // keep going from the last answer; replace a trailing operator instead of stacking them
        const base = expr;
        if (base === "" && key !== "-") return;
        const next = /[+\-×÷]$/.test(base) && base.length > 1 ? base.slice(0, -1) + key : base + key;
        setExpr(next);
        setShown(next);
        setJustDone(false);
      } else {
        // a digit or a point: start fresh after an answer
        const base = justDone ? "" : expr;
        const lastNumber = base.split(/[+\-×÷]/).pop() || "";
        if (key === "." && lastNumber.includes(".")) return;
        const next = base + (key === "." && lastNumber === "" ? "0." : key);
        setExpr(next);
        setShown(next);
        setJustDone(false);
      }
    },
    [expr, shown, justDone]
  );

  // The keyboard works too, including the numpad. Keys typed in other fields are left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      let key: string | null = null;
      const pad: Record<string, string> = {
        NumpadAdd: "+",
        NumpadSubtract: "-",
        NumpadMultiply: "×",
        NumpadDivide: "÷",
        NumpadDecimal: ".",
        NumpadEnter: "=",
      };
      const padDigit = /^Numpad([0-9])$/.exec(e.code);
      if (padDigit) key = padDigit[1];
      else if (pad[e.code]) key = pad[e.code];
      else if (/^[0-9]$/.test(e.key) || e.key === ".") key = e.key;
      else if (e.key === ",") key = ".";
      else if (e.key === "+" || e.key === "-") key = e.key;
      else if (e.key === "*" || e.key === "x" || e.key === "X") key = "×";
      else if (e.key === "/") key = "÷";
      else if (e.key === "Enter" || e.key === "=") key = "=";
      else if (e.key === "Backspace") key = "Backspace";
      else if (e.key === "Delete" || e.key.toLowerCase() === "c") key = "C";
      if (key === null) return;
      e.preventDefault();
      press(key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const useEntry = (entry: Entry) => {
    setExpr(entry.result);
    setShown(show(Number(entry.result)));
    setJustDone(true);
  };

  const clearHistory = () => {
    setHistory([]);
    writeHistory([]);
  };

  return (
    <div className="calc">
      <div className="calc__main">
        <div className="calc__screen" data-testid="calc-screen">
          <div className="calc__expr">{justDone ? "" : expr}</div>
          <div className="calc__value">{shown}</div>
        </div>
        <div className="calc__keys">
          {KEYS.map((k) => (
            <button
              key={k.label}
              type="button"
              className={`calc__key ${k.kind ? `calc__key--${k.kind}` : ""} ${k.key === "0" ? "calc__key--zero" : ""}`}
              onClick={() => press(k.key)}
              onMouseDown={(e) => e.preventDefault()}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>
      <div className="calc__history">
        <div className="calc__history-head">
          <strong>History (7 days)</strong>
          <Button size="small" type="text" onClick={clearHistory} disabled={history.length === 0}>
            Clear
          </Button>
        </div>
        {history.length === 0 ? (
          <p className="calc__empty">Nothing yet.</p>
        ) : (
          <ul className="calc__list">
            {history.map((h, i) => (
              <li key={`${h.at}-${i}`}>
                <button type="button" className="calc__entry" onClick={() => useEntry(h)}>
                  <span className="calc__entry-expr">{h.expr}</span>
                  <span className="calc__entry-result">= {show(Number(h.result))}</span>
                  <span className="calc__entry-at">{new Date(h.at).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// A button that opens the calculator in a window.
const CalculatorButton: React.FC<{ className?: string }> = ({ className }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className={className} icon={<CalculatorOutlined />} onClick={() => setOpen(true)}>
        Calculator
      </Button>
      <Modal title="Calculator" open={open} onCancel={() => setOpen(false)} footer={null} width={560} destroyOnClose>
        <CalculatorPanel />
      </Modal>
    </>
  );
};

export default CalculatorButton;
