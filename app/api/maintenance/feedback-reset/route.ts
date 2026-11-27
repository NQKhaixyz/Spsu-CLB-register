import { applyRequestedFeedbackReset, requestedFeedbackResetId } from "../../../../lib/feedback";
import { tokenHash } from "../../../../lib/password";
import { readState, writeState } from "../../../../lib/store";

export const dynamic = "force-dynamic";
const verifier = "6136c2f9af638e34fc3657a24e3eece9314bc91909188eb225bf19d546652ed0";
const deadline = 1795810523329;
const json = (body: object, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const token = request.headers.get("X-Nhip-Feedback-Reset");
  if (Date.now() >= deadline || !token || !/^[a-f0-9]{64}$/.test(token) || await tokenHash(token) !== verifier) {
    return json({ error: "Không có quyền thực hiện thao tác này" }, 403);
  }
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { club, revision } = await readState("", false);
      if (club.feedbackResetReceipt?.id === requestedFeedbackResetId) {
        return json({ receipt: club.feedbackResetReceipt, remaining: club.memberFeedback?.length ?? 0, alreadyDone: true });
      }
      const receipt = applyRequestedFeedbackReset(club);
      if (await writeState(club, revision)) return json({ receipt, remaining: 0, alreadyDone: false });
    }
    return json({ error: "Dữ liệu vừa thay đổi. Vui lòng thử lại" }, 409);
  } catch (error) {
    console.error("maintenance:feedback-reset", error);
    return json({ error: "Chưa thể đặt lại dữ liệu Feedback" }, 503);
  }
}
