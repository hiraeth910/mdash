import { loadImage } from "./ocr";

export interface CompressedImage {
  base64: string;
  mediaType: string;
}

// Reads the file as-is (no resize/re-encode) so we can compare OCR accuracy
// against the original photo quality before deciding whether compression is worth it.
export async function fileToBase64(file: File): Promise<CompressedImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
  const base64 = dataUrl.split(",")[1];
  return { base64, mediaType: file.type || "image/jpeg" };
}

// What gets sent to the server for reading. Bigger than this is wasted (the model scales images to
// about this size) and costs a lot on a slow connection, so large photos are shrunk and re-encoded.
const UPLOAD_MAX_SIDE = 2048;
const SMALL_ENOUGH_BYTES = 350 * 1024;

export async function compressForUpload(file: File): Promise<CompressedImage> {
  try {
    const image = await loadImage(file);
    const scale = Math.min(1, UPLOAD_MAX_SIDE / Math.max(image.width, image.height));
    if (scale === 1 && file.size <= SMALL_ENOUGH_BYTES) {
      image.release();
      return fileToBase64(file);
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      image.release();
      return fileToBase64(file);
    }
    ctx.fillStyle = "#ffffff"; // JPEG has no transparency
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image.source, 0, 0, canvas.width, canvas.height);
    image.release();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
    // keep the original when re-encoding does not make it smaller
    if (!blob || blob.size >= file.size) return fileToBase64(file);
    return fileToBase64(new File([blob], "photo.jpg", { type: "image/jpeg" }));
  } catch {
    return fileToBase64(file);
  }
}
