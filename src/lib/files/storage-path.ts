export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^\w.\-]/g, "_");
}

export function buildStoragePath(userId: string, fileName: string): string {
  return `${userId}/${Date.now()}-${sanitizeFileName(fileName)}`;
}
