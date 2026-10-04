import { saveAs } from "file-saver";

export type ImageColumn = { header: string; align?: "left" | "right" | "center" };
export type ImageRow = {
  cells: string[];
  bold?: boolean;
  // Colours the last cell, e.g. red for a payment.
  tone?: "negative" | "positive";
  // Light band behind the row, used for totals.
  shaded?: boolean;
  // Indexes of cells to point out (drawn bold in amber), e.g. figures that differ between groups.
  marked?: number[];
};

type Section = {
  heading?: string;
  // Placed to the right of the section before it instead of below it.
  beside?: boolean;
  // A small logo drawn before the heading.
  badge?: "phonepe";
  columns: ImageColumn[];
  rows: ImageRow[];
};

export type TableImage = {
  title: string;
  subtitle?: string;
  // Sections are stacked top to bottom in one picture.
  sections: Section[];
  fileName: string;
};

const FONT = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const SCALE = 2;
const PAD_X = 14;
const ROW_H = 34;
const MARGIN = 24;
const HEADING_H = 34;
const GAP = 14;

// Draws plain white tables (so they read well when shared) as one PNG.
export const renderTableImage = ({ title, subtitle, sections }: TableImage): Promise<Blob> => {
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) return Promise.reject(new Error("Canvas is not available"));

  const font = (bold: boolean, size = 14) => `${bold ? "600" : "400"} ${size}px ${FONT}`;
  const layouts = sections.map((sec) => {
    const widths = sec.columns.map((c, i) => {
      measure.font = font(true);
      let w = measure.measureText(c.header).width;
      sec.rows.forEach((r) => {
        measure.font = font(!!r.bold);
        w = Math.max(w, measure.measureText(r.cells[i] ?? "").width);
      });
      return Math.ceil(w) + PAD_X * 2;
    });
    return { sec, widths, tableW: widths.reduce((a, b) => a + b, 0) };
  });

  // Sections that sit beside each other form one band; bands stack top to bottom.
  const sectionH = (l: (typeof layouts)[number]) => (l.sec.heading ? HEADING_H : 0) + ROW_H * (l.sec.rows.length + 1);
  const bands: (typeof layouts[number])[][] = [];
  layouts.forEach((l, i) => {
    if (l.sec.beside && i > 0) bands[bands.length - 1].push(l);
    else bands.push([l]);
  });
  const bandW = (band: (typeof layouts[number])[]) => band.reduce((w, l) => w + l.tableW, 0) + GAP * (band.length - 1);
  const bandH = (band: (typeof layouts[number])[]) => Math.max(...band.map(sectionH));

  measure.font = font(true, 18);
  const titleW = measure.measureText(title).width;
  const width = Math.ceil(Math.max(titleW, ...bands.map(bandW))) + MARGIN * 2;
  const top = MARGIN + 30 + (subtitle ? 20 : 0);
  const height = top + bands.reduce((h, band) => h + bandH(band) + GAP, 0) - GAP + MARGIN;

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

  let y0 = top;
  bands.forEach((band) => {
  let x0 = MARGIN;
  band.forEach(({ sec, widths, tableW }) => {
    const { columns, rows } = sec;
    const cell = (text: string, col: number, x: number, y: number) => {
      const align = columns[col].align ?? "left";
      ctx.textAlign = align;
      ctx.fillText(text, align === "right" ? x + widths[col] - PAD_X : align === "center" ? x + widths[col] / 2 : x + PAD_X, y + ROW_H / 2);
    };

    if (sec.heading) {
      ctx.fillStyle = "#12302a";
      ctx.font = font(true, 15);
      ctx.textAlign = "left";
      let hx = x0;
      if (sec.badge === "phonepe") {
        const bx = x0, by = y0 + HEADING_H / 2 - 14, bs = 24;
        ctx.fillStyle = "#5f259f";
        ctx.beginPath();
        ctx.roundRect(bx, by, bs, bs, 6);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = font(true, 15);
        ctx.textAlign = "center";
        ctx.fillText("Pe", bx + bs / 2, by + bs / 2 + 1);
        hx = x0 + bs + 8;
        ctx.fillStyle = "#12302a";
        ctx.font = font(true, 15);
        ctx.textAlign = "left";
      }
      ctx.fillText(sec.heading, hx, y0 + HEADING_H / 2 - 2);
    }
    const headY = y0 + (sec.heading ? HEADING_H : 0);

    ctx.fillStyle = "#1f8f68";
    ctx.fillRect(x0, headY, tableW, ROW_H);
    ctx.fillStyle = "#ffffff";
    ctx.font = font(true);
    let x = x0;
    columns.forEach((c, i) => {
      cell(c.header, i, x, headY);
      x += widths[i];
    });

    rows.forEach((r, ri) => {
      const y = headY + ROW_H * (ri + 1);
      if (r.shaded) {
        ctx.fillStyle = "#e7f5ef";
        ctx.fillRect(x0, y, tableW, ROW_H);
      } else if (ri % 2 === 1) {
        ctx.fillStyle = "#f6f9f8";
        ctx.fillRect(x0, y, tableW, ROW_H);
      }
      ctx.strokeStyle = "#dbe4e0";
      ctx.beginPath();
      ctx.moveTo(x0, y + ROW_H);
      ctx.lineTo(x0 + tableW, y + ROW_H);
      ctx.stroke();

      let cx = x0;
      columns.forEach((_, ci) => {
        const last = ci === columns.length - 1;
        const marked = !!r.marked?.includes(ci);
        ctx.font = font(!!r.bold || marked);
        ctx.fillStyle = marked ? "#c2410c" : last && r.tone === "negative" ? "#c62828" : last && r.tone === "positive" ? "#1b7f4b" : "#1d2b27";
        cell(r.cells[ci] ?? "", ci, cx, y);
        cx += widths[ci];
      });
    });

    ctx.strokeStyle = "#b9c8c2";
    ctx.strokeRect(x0, headY, tableW, ROW_H * (rows.length + 1));
    x0 += tableW + GAP;
  });
  y0 += bandH(band) + GAP;
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) return reject(new Error("Could not create the image"));
      resolve(blob);
    }, "image/png");
  });
};

export const downloadTableImage = async (image: TableImage): Promise<void> => {
  saveAs(await renderTableImage(image), image.fileName);
};
