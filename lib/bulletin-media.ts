import type { Club } from "./club";
import { maxPhotoBytes } from "./photo-evidence";

export const bulletinMediaLimit = 4;
export const bulletinVideoLimitMb = 32;
export const bulletinDocumentLimitMb = 20;
export const bulletinVideoTypes = ["video/mp4", "video/webm", "video/quicktime"] as const;
const documentFormats = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const;
export const bulletinDocumentAccept = Object.entries(documentFormats).flatMap(([extension, mime]) => ["." + extension, mime]).join(",");
export const bulletinStageMs = 2 * 60 * 60 * 1000;
export const bulletinMediaEndpoint = "/api/bulletin-media";

export type BulletinVideoType = typeof bulletinVideoTypes[number];
type BulletinDocumentType = (typeof documentFormats)[keyof typeof documentFormats];
export type BulletinMediaType = "image/jpeg" | BulletinVideoType | BulletinDocumentType;
export type BulletinMedia = { id: string; type: BulletinMediaType; bytes: number; name?: string };
export type BulletinUpload = BulletinMedia & { postId: string; uploaderId: string; expiresAt: number };

export const isBulletinVideo = (type: unknown): type is BulletinVideoType =>
  bulletinVideoTypes.some(format => format === type);
export const isBulletinDocument = (type: unknown): type is BulletinDocumentType =>
  Object.values(documentFormats).some(format => format === type);
export function bulletinDocumentType(name: string): BulletinDocumentType | undefined {
  const extension = name.match(/\.(pdf|docx|xlsx|pptx)$/i)?.[1]?.toLowerCase() as keyof typeof documentFormats | undefined;
  return extension ? documentFormats[extension] : undefined;
}

export function bulletinDocumentName(name: string) {
  return (name.normalize("NFC").split(/[\\/]/).at(-1) ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

export const isBulletinMediaType = (type: unknown): type is BulletinMediaType =>
  type === "image/jpeg" || isBulletinVideo(type) || isBulletinDocument(type);
export const isBulletinMediaId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id);
export const bulletinMediaByteLimit = (type: BulletinMediaType) =>
  type === "image/jpeg" ? maxPhotoBytes : (isBulletinVideo(type) ? bulletinVideoLimitMb : bulletinDocumentLimitMb) * 1024 * 1024;
export const bulletinMediaKey = (id: string) => `bulletin-media/${id}`;
export const bulletinMediaUrl = (postId: string, id: string) =>
  bulletinMediaEndpoint + "?" + new URLSearchParams({ postId, id });

export function bulletinMediaIds(club: Club) {
  return new Set([
    ...(club.bulletinPosts ?? []).flatMap(post => (post.media ?? []).map(file => file.id)),
    ...(club.bulletinUploads ?? []).map(file => file.id),
  ]);
}

export function removedBulletinKeys(previous: ReadonlySet<string>, club: Club) {
  if (!previous.size) return [];
  const current = bulletinMediaIds(club);
  return [...previous].filter(id => !current.has(id)).map(bulletinMediaKey);
}

export function bulletinByteRange(header: string, size: number) {
  const match = /^bytes=(\d{0,16})-(\d{0,16})$/i.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const start = match[1] ? Number(match[1]) : undefined;
  const end = match[2] ? Number(match[2]) : undefined;
  if (start === undefined) {
    if (!end || !Number.isSafeInteger(end)) return null;
    const length = Math.min(end, size);
    return { offset: size - length, length };
  }
  if (!Number.isSafeInteger(start) || start >= size || (end !== undefined && (!Number.isSafeInteger(end) || end < start))) return null;
  return { offset: start, length: Math.min(end ?? size - 1, size - 1) - start + 1 };
}
