import type { Worker } from "tesseract.js";

// Reads typed "number - amount" lists (e.g. a screenshot of a chat or a printed slip) in the browser
// with Tesseract. Nothing is uploaded; the engine and English data are served from /ocr.
let workerPromise: Promise<Worker> | null = null;

// A reader that cannot load its files can hang without an error, so every step has a time limit.
const LOAD_TIMEOUT_MS = 25_000;
const READ_TIMEOUT_MS = 60_000;
// Phone photos can be 12+ megapixels; typed lists read just as well at this size and it spares memory.
const MAX_SIDE = 2400;

const withTimeout = <T,>(promise: Promise<T>, ms: number, what: string): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });

const getWorker = (): Promise<Worker> => {
  if (!workerPromise) {
    workerPromise = withTimeout((async () => {
      const { createWorker, PSM } = await import("tesseract.js");
      // The worker runs from a blob, so every path has to be absolute.
      const base = `${window.location.origin}/ocr`;
      const worker = await createWorker("eng", 1, {
        workerPath: `${base}/worker.min.js`,
        corePath: base,
        langPath: base,
        gzip: true,
        logger: () => {},
      });
      await worker.setParameters({
        tessedit_char_whitelist: "0123456789-xX ",
        tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
        preserve_interword_spaces: "1",
      });
      return worker;
    })(), LOAD_TIMEOUT_MS, "Loading the reader").catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
};

const makeCanvas = (width: number, height: number) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available");
  return { canvas, ctx };
};

// A divider is a thin vertical line that is dark for most of the page height. Text columns never
// are, so the gaps between dividers are the columns.
const findColumns = (ctx: CanvasRenderingContext2D, width: number, height: number): [number, number][] => {
  const { data } = ctx.getImageData(0, 0, width, height);
  const isBar: boolean[] = [];
  for (let x = 0; x < width; x++) {
    let dark = 0;
    let rows = 0;
    for (let y = 0; y < height; y += 4) {
      const i = (y * width + x) * 4;
      const luminance = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      if (luminance < 170) dark++;
      rows++;
    }
    isBar.push(dark / rows > 0.6);
  }

  const bars: [number, number][] = [];
  let start = -1;
  for (let x = 0; x <= width; x++) {
    const on = x < width && isBar[x];
    if (on && start < 0) start = x;
    if (!on && start >= 0) {
      if (x - start >= 3) bars.push([start, x - 1]);
      start = -1;
    }
  }

  const columns: [number, number][] = [];
  let left = 0;
  bars.forEach(([a, b]) => {
    if (a - left > 20) columns.push([left, a]);
    left = b + 1;
  });
  if (width - left > 20) columns.push([left, width]);
  return columns;
};

const DATE = /\d{1,2}\s*[-/]\s*\d{1,2}\s*[-/]\s*\d{2,4}/g;
const PAIR = /(\d+)\s*[xX]?\s*[-–—~]\s*(\d+)/g;

// "36 - 10" -> "36-10"; a letter stuck to a number ("9x - 100") is dropped; dates are skipped.
export const parsePairs = (text: string): string[] => {
  const pairs: string[] = [];
  text.split("\n").forEach((line) => {
    for (const m of line.replace(DATE, " ").matchAll(PAIR)) pairs.push(`${m[1]}-${m[2]}`);
  });
  return pairs;
};

type LoadedImage = { source: CanvasImageSource; width: number; height: number; release: () => void };

// createImageBitmap is missing in older iPhones and in-app browsers; an <img> works everywhere.
const loadImage = async (file: File): Promise<LoadedImage> => {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // fall through to the <img> route
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("The image could not be opened"));
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
};

// Stops a stuck reader so the next attempt starts a fresh one.
const resetWorker = async () => {
  const pending = workerPromise;
  workerPromise = null;
  try {
    (await pending)?.terminate();
  } catch {
    // nothing to stop
  }
};

const recognize = async (worker: Worker, image: HTMLCanvasElement): Promise<string> => {
  try {
    const { data } = await withTimeout(worker.recognize(image), READ_TIMEOUT_MS, "Reading the image");
    return data.text;
  } catch (err) {
    await resetWorker();
    throw err;
  }
};

export async function ocrBetPairs(file: File): Promise<string[]> {
  if (typeof Worker === "undefined" || typeof WebAssembly === "undefined") {
    throw new Error("This browser cannot run the reader");
  }
  const [worker, loaded] = await Promise.all([getWorker(), loadImage(file)]);
  const scale = Math.min(1, MAX_SIDE / Math.max(loaded.width, loaded.height));
  const width = Math.max(1, Math.round(loaded.width * scale));
  const height = Math.max(1, Math.round(loaded.height * scale));
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = "#ffffff"; // flatten transparency so it doesn't read as black
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(loaded.source, 0, 0, width, height);
  loaded.release();

  const columns = findColumns(ctx, canvas.width, canvas.height);

  if (columns.length < 2) {
    // No dividers: read the page in one go. Rows may hold several entries side by side.
    return parsePairs(await recognize(worker, canvas));
  }

  const pairs: string[] = [];
  const pad = 20;
  for (const [a, b] of columns) {
    const { canvas: crop, ctx: cropCtx } = makeCanvas(b - a + pad * 2, canvas.height + pad * 2);
    cropCtx.fillStyle = "#ffffff";
    cropCtx.fillRect(0, 0, crop.width, crop.height);
    cropCtx.drawImage(canvas, a, 0, b - a, canvas.height, pad, pad, b - a, canvas.height);
    pairs.push(...parsePairs(await recognize(worker, crop)));
  }
  return pairs;
}
