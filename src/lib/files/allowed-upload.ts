/** MIME types and extensions allowed for user uploads (PDF, CSV, and images). */

const PDF_MIMES = new Set(["application/pdf"]);
const PDF_EXT = new Set([".pdf"]);
const CSV_MIMES = new Set(["text/csv", "application/csv"]);
const CSV_EXT = new Set([".csv"]);

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

type UploadLike = Pick<File, "name" | "type">;

export type AllowedUploadKind = "pdf" | "csv" | "image";

export function getAllowedUploadKind(file: UploadLike): AllowedUploadKind | null {
  const type = (file.type || "").toLowerCase();
  if (type) {
    if (PDF_MIMES.has(type)) return "pdf";
    if (CSV_MIMES.has(type)) return "csv";
    if (type.startsWith("image/")) return "image";
  }

  const ext = extensionOf(file.name);
  if (PDF_EXT.has(ext)) return "pdf";
  if (CSV_EXT.has(ext)) return "csv";
  if (IMAGE_EXT.has(ext)) return "image";
  return null;
}

export const ALLOWED_FILE_ACCEPT = ".pdf,.csv,image/*";

export function isAllowedUploadFile(file: UploadLike): boolean {
  return getAllowedUploadKind(file) !== null;
}
