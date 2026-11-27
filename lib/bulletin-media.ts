import type { Club } from "./club";
import { maxPhotoBytes } from "./photo-evidence";

export const bulletinMediaLimit = 4;
export const bulletinVideoLimitMb = 32;
export const bulletinVideoTypes = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const bulletinStageMs = 2 * 60 * 60 * 1000;
export const bulletinMediaEndpoint = "/api/bulletin-media";

export type BulletinVideoType = typeof bulletinVideoTypes[number];
export type BulletinMediaType = "image/jpeg" | BulletinVideoType;
export type BulletinMedia = { id: string; type: BulletinMediaType; bytes: number };
export type BulletinUpload = BulletinMedia & { postId: string; uploaderId: string; expiresAt: number };

export const isBulletinVideo = (type: unknown): type is BulletinVideoType =>
  bulletinVideoTypes.some(format => format === type);
export const isBulletinMediaType = (type: unknown): type is BulletinMediaType =>
  type === "image/jpeg" || isBulletinVideo(type);
export const isBulletinMediaId = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(id);
export const bulletinMediaByteLimit = (type: BulletinMediaType) =>
  type === "image/jpeg" ? maxPhotoBytes : bulletinVideoLimitMb * 1024 * 1024;
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
