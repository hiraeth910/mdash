import { saveAs } from "file-saver";

export type ImageColumn = { header: string; align?: "left" | "right" };
export type ImageRow = {
  cells: string[];
  bold?: boolean;
  // Colours the last cell, e.g. red for a payment.
  tone?: "negative" | "positive";
  // Light band behind the row, used for totals.
  shaded?: boolean;
};

type TableImage = {
  title: string;
  subtitle?: string;
  columns: ImageColumn[];
  rows: ImageRow[];
  fileName: string;
};

const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SCALE = 2;
const PAD_X = 14;
const ROW_H = 34;
const MARGIN = 24;

// Draws a plain white table (so it reads well when shared) and downloads it as a PNG.
export const downloadTableImage = ({ title, subtitle, columns, rows, fileName }: TableImage): Promise<void> => {
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return Promise.reject(new Error("Canvas is not available"));

  const font = (bold: boolean, size = 14) => `${bold ? "600" : "400"} ${size}px ${FONT}`;
  const widths = columns.map((c, i) => {
    measure.font = font(true);
    let w = measure.measureText(c.header).width;
    rows.forEach((r) => {
      measure.font = font(!!r.bold);
      w = Math.max(w, measure.measureText(r.cells[i] ?? "").width);
    });
    return Math.ceil(w) + PAD_X * 2;
  });

  const tableW = widths.reduce((a, b) => a + b, 0);
  measure.font = font(true, 18);
  const titleW = measure.measureText(title).width;
  const width = Math.ceil(Math.max(tableW, titleW)) + MARGIN * 2;
  const headY = MARGIN + 30 + (subtitle ? 20 : 0);
  const height = headY + ROW_H * (rows.length + 1) + MARGIN;

  const canvas = document.createElement("canvas");
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Canvas is not available"));
  ctx.scale(SCALE, SCALE);

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = "middle";

  ctx.fillStyle = "#12302a";
  ctx.font = font(true, 18);
  ctx.textAlign = "left";
  ctx.fillText(title, MARGIN, MARGIN + 12);
  if (subtitle) {
    ctx.fillStyle = "#5b6b66";
    ctx.font = font(false, 12);
    ctx.fillText(subtitle, MARGIN, MARGIN + 34);
  }

  const cell = (text: string, col: number, x: number, y: number) => {
    const align = columns[col].align ?? "left";
    ctx.textAlign = align;
    ctx.fillText(text, align === "right" ? x + widths[col] - PAD_X : x + PAD_X, y + ROW_H / 2);
  };

  // header
  ctx.fillStyle = "#1f8f68";
  ctx.fillRect(MARGIN, headY, tableW, ROW_H);
  ctx.fillStyle = "#ffffff";
  ctx.font = font(true);
  let x = MARGIN;
  columns.forEach((c, i) => {
    cell(c.header, i, x, headY);
    x += widths[i];
  });

  // body
  rows.forEach((r, ri) => {
    const y = headY + ROW_H * (ri + 1);
    if (r.shaded) {
      ctx.fillStyle = "#e7f5ef";
      ctx.fillRect(MARGIN, y, tableW, ROW_H);
    } else if (ri % 2 === 1) {
      ctx.fillStyle = "#f6f9f8";
      ctx.fillRect(MARGIN, y, tableW, ROW_H);
    }
    ctx.strokeStyle = "#dbe4e0";
    ctx.beginPath();
    ctx.moveTo(MARGIN, y + ROW_H);
    ctx.lineTo(MARGIN + tableW, y + ROW_H);
    ctx.stroke();

    ctx.font = font(!!r.bold);
    let cx = MARGIN;
    columns.forEach((_, ci) => {
      const last = ci === columns.length - 1;
      ctx.fillStyle = last && r.tone === "negative" ? "#c62828" : last && r.tone === "positive" ? "#1b7f4b" : "#1d2b27";
      cell(r.cells[ci] ?? "", ci, cx, y);
      cx += widths[ci];
    });
  });

  ctx.strokeStyle = "#b9c8c2";
  ctx.strokeRect(MARGIN, headY, tableW, ROW_H * (rows.length + 1));

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Could not create the image"));
      saveAs(blob, fileName);
      resolve();
    }, "image/png");
  });
};
