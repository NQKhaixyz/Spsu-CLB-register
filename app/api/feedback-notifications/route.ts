import { memberNotificationsFor, markMemberNotificationRead, type MemberNotificationInbox } from "../../../lib/feedback-notifications";
import type { Club } from "../../../lib/club";
import { getNativeUserWithClub } from "../../../lib/native-auth";
import { AuthError } from "../../../lib/password";
import { readBody, verifyOrigin } from "../../../lib/photo-upload";
import { mutate } from "../../../lib/store";

export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, {
  status, headers: { "Cache-Control": "private, no-store" },
});
// Tabs running an earlier build can only display feedback and sharing notices.
const includesWorkspace = (request: Request) => new URL(request.url).searchParams.get("include") === "workspace";

function inbox(club: Club, memberId: string, revision: number, includeWorkspace: boolean): MemberNotificationInbox {
  return { revision, notifications: memberNotificationsFor(club, memberId, includeWorkspace) };
}

export async function GET(request: Request) {
  try {
    const user = await getNativeUserWithClub(request);
    if (!user) return json({ error: "Vui lòng đăng nhập để xem thông báo" }, 401);
    return json(inbox(user.club, user.member.id, user.revision, includesWorkspace(request)));
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
    const includeWorkspace = includesWorkspace(request);

    const { club, revision } = await mutate(user.userId, current => {
      if (!current.members.some(member => member.id === user.member.id && member.userId === user.userId && member.active)) {
        throw new AuthError("Vui lòng đăng nhập để xem thông báo", 401);
      }
      if (!markMemberNotificationRead(current, user.member.id, id, includeWorkspace)) {
        throw new AuthError("Thông báo không còn hiển thị", 404);
      }
    });
    return json(inbox(club, user.member.id, revision, includeWorkspace));
  } catch (error) {
    if (error instanceof AuthError) return json({ error: error.message }, error.status);
    console.error("feedback-notifications:post", error);
    return json({ error: "Chưa cập nhật được thông báo" }, 500);
  }
}
