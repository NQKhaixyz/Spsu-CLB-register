import { feedbackNotificationsFor, markFeedbackNotificationRead, type FeedbackNotificationInbox } from "../../../lib/feedback-notifications";
import type { Club } from "../../../lib/club";
import { getNativeUserWithClub } from "../../../lib/native-auth";
import { AuthError } from "../../../lib/password";
import { readBody, verifyOrigin } from "../../../lib/photo-upload";
import { mutate } from "../../../lib/store";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store" },
});
function inbox(club: Club, memberId: string, revision: number): FeedbackNotificationInbox {
  return { revision, notifications: feedbackNotificationsFor(club, memberId) };
}

export async function GET(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để xem thông báo" }, 401);
    return json(inbox(user.club, user.member.id, user.revision));
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
    const bytes = await readBody(request, "application/json", 512, "Thông báo không hợp lệ");
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return json({ error: "Thông báo không hợp lệ" }, 400);
    }
    const id = data && typeof data === "object" && "id" in data ? data.id : undefined;
    if (typeof id !== "string" || id.length !== 36) return json({ error: "Thông báo không hợp lệ" }, 400);

    const { club, revision } = await mutate(user.userId, current => {
      if (!current.members.some(member => member.id === user.member.id && member.userId === user.userId && member.active)) {
        throw new AuthError("Vui lòng đăng nhập để xem thông báo", 401);
      }
      if (!markFeedbackNotificationRead(current, user.member.id, id)) {
        throw new AuthError("Thông báo không còn hiển thị", 404);
      }
    });
    return json(inbox(club, user.member.id, revision));
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    console.error("feedback-notifications:post", error);
    return json({ error: "Chưa cập nhật được thông báo" }, 500);
  }
}
