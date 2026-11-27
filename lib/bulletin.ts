import type { Club, Member } from "./club";
import type { BulletinMedia } from "./bulletin-media";

export const bulletinTitleLimit = 120;
export const bulletinContentLimit = 8000;
export const bulletinCommentLimit = 1500;

type BulletinComment = {
  id: string;
  memberId: string;
  content: string;
  createdAt: number;
  replyTo?: string;
  likedBy?: string[];
};

export type BulletinPost = {
  id: string;
  title: string;
  content: string;
  contentFormat?: "emphasis";
  revision: number;
  createdAt?: number;
  createdBy?: string | null;
  publishAt?: number;
  deleteAt?: number;
  likedBy?: string[];
  savedBy?: string[];
  comments?: BulletinComment[];
  media?: BulletinMedia[];
};

export type BulletinAuthor = { memberId?: string; name: string; avatarId?: string };
export type BulletinCommentView = Omit<BulletinComment, "memberId" | "likedBy"> & {
  author: BulletinAuthor;
  liked: boolean;
  likeCount: number;
};
export type BulletinPostView = Omit<BulletinPost, "createdBy" | "likedBy" | "savedBy" | "comments"> & {
  author: BulletinAuthor;
  canManage: boolean;
  published: boolean;
  liked: boolean;
  likeCount: number;
  saved: boolean;
  comments: BulletinCommentView[];
};

export function isBulletinId(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(value);
}

export function bulletinAuthorId(club: Club, post: BulletinPost) {
  if (post.createdBy !== undefined) return post.createdBy ?? undefined;
  const created = post.createdAt;
  if (created === undefined) return undefined;
  // Older posts omitted the author. Only use a matching creation record when
  // its title and timestamp identify the author unambiguously.
  const candidates = new Set<string>();
  for (const log of club.logs) {
    if (!log.actorId || log.text !== `Đăng bản tin ${post.title}`) continue;
    const at = Date.parse(log.at);
    if (at >= created && at - created <= 1000) candidates.add(log.actorId);
  }
  return candidates.size === 1 ? candidates.values().next().value : undefined;
}

const vietnamOffset = 7 * 60 * 60 * 1000;
export function bulletinDateInput(at?: number) {
  return at === undefined ? "" : new Date(at + vietnamOffset).toISOString().slice(0, 16);
}

export function parseBulletinDate(input: unknown) {
  if (input === undefined || input === "") return undefined;
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return NaN;
  const at = Date.parse(input + ":00+07:00");
  return Number.isFinite(at) && bulletinDateInput(at) === input ? at : NaN;
}

const hasExpired = (post: BulletinPost, now: number) => post.deleteAt !== undefined && post.deleteAt <= now;
export const isBulletinPublished = (post: BulletinPost, now: number) =>
  (post.publishAt ?? 0) <= now && !hasExpired(post, now);
export const canReadBulletin = (post: BulletinPost, viewer: Member, now: number) =>
  !hasExpired(post, now) && (viewer.role === "admin" || isBulletinPublished(post, now));
export const canManageBulletin = (club: Club, post: BulletinPost, viewer: Member) =>
  viewer.active && (viewer.role === "admin" || bulletinAuthorId(club, post) === viewer.id);

export function pruneExpiredBulletinPosts(club: Club, now = Date.now()) {
  const posts = club.bulletinPosts;
  if (!posts?.some(post => hasExpired(post, now))) return false;
  club.bulletinPosts = posts.filter(post => !hasExpired(post, now));
  return true;
}

export function pruneBulletinState(club: Club, now = Date.now()) {
  const postsChanged = pruneExpiredBulletinPosts(club, now);
  const uploads = club.bulletinUploads;
  if (!uploads?.some(upload => upload.expiresAt <= now)) return postsChanged;
  club.bulletinUploads = uploads.filter(upload => upload.expiresAt > now);
  return true;
}

export function bulletinView(club: Club, viewer: Member, now = Date.now()) {
  const posts = (club.bulletinPosts ?? []).filter(post => !hasExpired(post, now));
  const people = new Map(club.members.map(({ id, name, avatarId }) => [id, { memberId: id, name, avatarId }]));
  const visible: BulletinPostView[] = posts
    .filter(post => canReadBulletin(post, viewer, now))
    .sort((a, b) => (b.publishAt ?? b.createdAt ?? 0) - (a.publishAt ?? a.createdAt ?? 0))
    .map(post => {
      const { createdBy: _createdBy, likedBy, savedBy, comments, ...publicPost } = post;
      return {
        ...publicPost,
        author: people.get(bulletinAuthorId(club, post) ?? "") ?? { name: "Ban điều hành" },
        canManage: canManageBulletin(club, post, viewer),
        published: isBulletinPublished(post, now),
        liked: likedBy?.includes(viewer.id) ?? false,
        likeCount: likedBy?.length ?? 0,
        saved: savedBy?.includes(viewer.id) ?? false,
        comments: (comments ?? []).map(({ memberId, likedBy, ...comment }) => ({
          ...comment,
          author: people.get(memberId) ?? { name: "Thành viên" },
          liked: likedBy?.includes(viewer.id) ?? false,
          likeCount: likedBy?.length ?? 0,
        })),
      };
    });
  const upcoming = posts.flatMap(post => [post.publishAt, post.deleteAt])
    .filter((at): at is number => at !== undefined && at > now);
  return { posts: visible, nextChangeAt: upcoming.length ? Math.min(...upcoming) : undefined };
}
