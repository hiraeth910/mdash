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
