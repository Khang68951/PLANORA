import { basename, extname, resolve, sep } from "node:path";

export const MAX_PROJECT_FILE_BYTES = 10 * 1024 * 1024;
export const PROJECT_STORAGE_ROOT = resolve(process.cwd(), "storage", "projects");
export const AI_TEXT_MIME_TYPES = new Set(["text/plain", "text/markdown", "text/csv", "application/json", "application/xml", "text/xml", "text/html"]);
export function safeOriginalName(value) { return basename(typeof value === "string" ? value : "attachment").replace(/[\u0000-\u001f]/g, "").slice(0, 255) || "attachment"; }
export function storagePath(projectId, storedName) {
  const projectRoot = resolve(PROJECT_STORAGE_ROOT, projectId);
  const target = resolve(projectRoot, storedName);
  if (!target.startsWith(`${projectRoot}${sep}`)) throw new Error("Unsafe attachment path.");
  return { projectRoot, target };
}
export function storedFileName(id, originalName) { const extension = extname(originalName).replace(/[^a-zA-Z0-9.]/g, "").slice(0, 12); return `${id}${extension}`; }
export function isAIReadableFile(file) { return AI_TEXT_MIME_TYPES.has(file.mimeType) || /\.(txt|md|csv|json|xml|html?)$/i.test(file.name); }
export function canPreviewFile(file) { return file.mimeType.startsWith("image/") || file.mimeType === "application/pdf" || isAIReadableFile(file); }
