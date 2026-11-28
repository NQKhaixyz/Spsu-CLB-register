import { markMemberNotificationsRead, visibleMemberNotifications, type MemberNotificationInbox, type NotificationFormat } from "../../../lib/feedback-notifications";
import { isNoticeId } from "../../../lib/notification-types";
import type { Club } from "../../../lib/club";
import { getNativeUserWithClub } from "../../../lib/native-auth";
import { AuthError } from "../../../lib/password";
import { readBody, verifyOrigin } from "../../../lib/photo-upload";
import { mutate } from "../../../lib/store";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store" },
});
function formatFor(request: Request): NotificationFormat {
  const include = new URL(request.url).searchParams.get("include");
  return include === "all" || include === "workspace" ? include : "feedback";
}

function inbox(club: Club, memberId: string, revision: number, format: NotificationFormat): MemberNotificationInbox {
  return { revision, notifications: visibleMemberNotifications(club, memberId, format) };
}

export async function GET(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để xem thông báo" }, 401);
    return json(inbox(user.club, user.member.id, user.revision, formatFor(request)));
  } catch (error) {
    console.error("feedback-notifications:get", error);
    return json({ error: "Chưa tải được thông báo" }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để xem thông báo" }, 401);
    verifyOrigin(request);
    const bytes = await readBody(request, "application/json", 12_000, "Thông báo không hợp lệ");
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "Thông báo không hợp lệ" }, 400);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "Thông báo không hợp lệ" }, 400);
    const { id, ids, all } = data as Record<string, unknown>;
    const format = formatFor(request);
    const single = isNoticeId(id) && ids === undefined && all === undefined;
    let selection: Set<string> | "all";
    if (single) selection = new Set([id]);
    else if (format === "all" && all === true && ids === undefined && id === undefined) selection = "all";
    else if (format === "all" && all === undefined && id === undefined &&
      Array.isArray(ids) && ids.length > 0 && ids.length <= 250 && ids.every(isNoticeId)) selection = new Set(ids);
    else return json({ error: "Thông báo không hợp lệ" }, 400);
    const now = Date.now();

    const { club, revision } = await mutate(user.userId, current => {
      if (!current.members.some(member => member.id === user.member.id && member.userId === user.userId && member.active)) {
        throw new AuthError("Vui lòng đăng nhập để xem thông báo", 401);
      }
      if (!markMemberNotificationsRead(current, user.member.id, selection, format, now) && single) {
        throw new AuthError("Thông báo không còn hiển thị", 404);
      }
    });
    return json(inbox(club, user.member.id, revision, format));
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    console.error("feedback-notifications:post", error);
    return json({ error: "Chưa cập nhật được thông báo" }, 500);
  }
}
