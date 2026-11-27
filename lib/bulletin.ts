import type { Club, Member } from "./club";

export const bulletinTitleLimit = 120;
export const bulletinContentLimit = 8000;
export const bulletinCommentLimit = 1500;

type BulletinComment = { id: string; memberId: string; content: string; createdAt: number };

export type BulletinPost = {
  id: string;
  title: string;
  content: string;
  revision: number;
  createdAt?: number;
  publishAt?: number;
  deleteAt?: number;
  likedBy?: string[];
  comments?: BulletinComment[];
};

export type BulletinPostView = Omit<BulletinPost, "likedBy" | "comments"> & {
  published: boolean;
  liked: boolean;
  likeCount: number;
  comments: (Omit<BulletinComment, "memberId"> & { authorName: string })[];
};

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

export function pruneExpiredBulletinPosts(club: Club, now = Date.now()) {
  const posts = club.bulletinPosts;
  if (!posts?.some(post => hasExpired(post, now))) return false;
  club.bulletinPosts = posts.filter(post => !hasExpired(post, now));
  return true;
}

export function bulletinView(club: Club, viewer: Member, now = Date.now()) {
  const posts = (club.bulletinPosts ?? []).filter(post => !hasExpired(post, now));
  const names = new Map(club.members.map(member => [member.id, member.name]));
  const visible: BulletinPostView[] = posts
    .filter(post => viewer.role === "admin" || isBulletinPublished(post, now))
    .sort((a, b) => (b.publishAt ?? b.createdAt ?? 0) - (a.publishAt ?? a.createdAt ?? 0))
    .map(({ likedBy, comments, ...post }) => ({
      ...post,
      published: isBulletinPublished(post, now),
      liked: likedBy?.includes(viewer.id) ?? false,
      likeCount: likedBy?.length ?? 0,
      comments: (comments ?? []).map(({ memberId, ...comment }) => ({ ...comment, authorName: names.get(memberId) ?? "Thành viên" })),
    }));
  const upcoming = posts.flatMap(post => [post.publishAt, post.deleteAt])
    .filter((at): at is number => at !== undefined && at > now);
  return { posts: visible, nextChangeAt: upcoming.length ? Math.min(...upcoming) : undefined };
}
