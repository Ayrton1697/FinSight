/** MIME types and extensions allowed for user uploads (PDF, CSV, images). */

const PDF_CSV_MIMES = new Set([
  "application/pdf",
  "text/csv",
  "application/csv",
]);

const PDF_CSV_EXT = new Set([".pdf", ".csv"]);

const IMAGE_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".jfif",
  ".pjpeg",
  ".pjp",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".tif",
  ".tiff",
  ".ico",
  ".heic",
  ".heif",
  ".avif",
]);

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

export const ALLOWED_FILE_ACCEPT = ".pdf,.csv,image/*";

export function isAllowedUploadFile(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type) {
    if (PDF_CSV_MIMES.has(type)) return true;
    if (type.startsWith("image/")) return true;
  }
  const ext = extensionOf(file.name);
  if (PDF_CSV_EXT.has(ext)) return true;
  if (IMAGE_EXT.has(ext)) return true;
  return false;
}
