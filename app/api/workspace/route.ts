import { env } from "cloudflare:workers";
import { getNativeUser, updateOwnProfile } from "../../../lib/native-auth";
import { applyAction } from "../../../lib/actions";
import { mutate, ClubNotReadyError } from "../../../lib/store";
import { workspaceView as view } from "../../../lib/workspace-view";
import { purgeTestData } from "../../../lib/maintenance";
import { deleteEvent } from "../../../lib/delete-event";
import { deleteMember } from "../../../lib/delete-member";
import { AuthError } from "../../../lib/password";
import { removeDutyMember } from "../../../lib/remove-duty-member";
import { deleteQueuedPhotos } from "../../../lib/photo-deletion";

export const dynamic = "force-dynamic";
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
export async function GET(request: Request) {
  try {
    const user = await getNativeUser(request);
    if (!user) return json({ error: "Vui lòng đăng nhập." }, 401);
    const allowed = false;
    const { club, revision } = await mutate(user.userId, () => null, allowed);
    return json(view(club, user, revision));
  } catch (e) {
    if (e instanceof ClubNotReadyError) return json({ error: e.message }, 409);
    console.error("workspace:get", e);
    return json({ error: "Không tải được dữ liệu. Vui lòng thử lại." }, 500);
  }
}
export async function POST(request: Request) {
  try {
    const user = await getNativeUser(request);
    if (!user) return json({ error: "Vui lòng đăng nhập." }, 401);
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return json({ error: "Nguồn yêu cầu không hợp lệ." }, 403);
    if (Number(request.headers.get("content-length")) > 1_000_000)
      return json({ error: "Dữ liệu quá lớn." }, 413);
    const { action, data = {} } = (await request.json()) as {
      action: string;
      data?: Record<string, unknown>;
    };
    const allowed = false;
    if (action === "profile") {
      const { club, revision } = await updateOwnProfile(request, data);
      return json(view(club, user, revision));
    }
    if (action === "purgeTestData") {
      const { club, revision } = await purgeTestData(user, data);
      return json(view(club, user, revision));
    }
    if (action === "deleteMember") {
      const { club, revision, photosDeleted } = await deleteMember(user, data);
      return json({ ...view(club, user, revision), ...(photosDeleted ? {} : {
        notice: "Đã xóa hồ sơ. Hệ thống sẽ thử lại việc dọn các tệp đính kèm.",
      }) });
    }
    if (action === "deleteEvent") {
      const { club, revision, photosDeleted } = await deleteEvent(user, data);
      return json({ ...view(club, user, revision), ...(photosDeleted ? {} : {
        notice: "Đã xóa sự kiện. Hệ thống sẽ thử lại việc dọn các tệp ảnh.",
      }) });
    }
    if (action === "removeDutyMember") {
      const { club, revision, photoDeleted } = await removeDutyMember(user, data);
      return json({ ...view(club, user, revision), ...(photoDeleted ? {} : {
        notice: "Đã gỡ người khỏi ca. Hệ thống sẽ thử lại việc dọn ảnh minh chứng.",
      }) });
    }
    const { club, revision, removedObjects } = await mutate(
      user.userId,
      (c) => applyAction(c, user, action, data),
      allowed,
    );
    if (removedObjects.length && env.BUCKET && env.DB)
      await deleteQueuedPhotos(env.BUCKET, env.DB).catch(error => console.error("workspace:bulletin-media", error));
    return json(view(club, user, revision));
  } catch (e) {
    return json(
      {
        error: e instanceof Error ? e.message : "Không lưu được thay đổi.",
      },
      e instanceof AuthError ? e.status : 400,
    );
  }
}
