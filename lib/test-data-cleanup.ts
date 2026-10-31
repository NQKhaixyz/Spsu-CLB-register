import { check, type Identity } from "./actions";
import { activeAvailabilityDatasetFor } from "./availability";
import type { Club } from "./club";

export function planTestDataCleanup(club: Club, identity: Identity, data: Record<string, unknown>) {
  const me = club.members.find((m) => m.userId === identity.userId);
  check(me?.active && me.role === "admin" && identity.userId === club.ownerId, "Chỉ chủ quản trị được dọn dữ liệu thử.");
  check(data.confirm === "DON DU LIEU THU", "Chưa xác nhận dọn dữ liệu thử.");
  if (club.testDataCleanedAt) return { removedUserIds: [], removedMembers: 0, resetAssignments: 0, alreadyDone: true };
  const source = activeAvailabilityDatasetFor(club);
  const linked = new Set(Object.values(source?.memberLinks ?? {}));
  check(source?.rows.length && linked.size, "Chưa có danh sách thật đang áp dụng.");
  check(linked.size === data.expectedSourcePeople && source.rows.length === data.expectedSourceRows, "Danh sách nguồn đã thay đổi. Cần đối chiếu lại trước khi dọn.");
  check([...linked].every((id) => club.members.some((m) => m.id === id)), "Danh sách nguồn thiếu hồ sơ thành viên.");
  check(!club.members.some((m) => linked.has(m.id) && m.userId === "native:test-member"), "Tài khoản thử đang liên kết với hồ sơ nguồn. Cần đối chiếu thủ công trước khi dọn.");
  check(Array.isArray(data.memberIds) && data.memberIds.every((id) => typeof id === "string"), "Danh sách hồ sơ thử không hợp lệ.");
  check(Array.isArray(data.resetMonths) && data.resetMonths.every((month) => typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)), "Tháng cần đặt lại không hợp lệ.");
  const explicit = new Set(data.memberIds as string[]);
  const removed = club.members.filter((m) => explicit.has(m.id) || (m.id.startsWith("demo-") && !m.userId));
  check([...explicit].every((id) => removed.some((m) => m.id === id)), "Có hồ sơ thử không còn tồn tại. Cần đối chiếu lại.");
  check(removed.every((m) => !linked.has(m.id) && m.userId !== club.ownerId && m.role !== "admin"), "Không thể xóa hồ sơ nguồn hoặc quản trị viên.");
  const ids = new Set(removed.map((m) => m.id));
  const names = new Set(removed.map((m) => m.name));
  const removedUserIds = [...new Set(["native:test-member", ...removed.flatMap((m) => m.userId ? [m.userId] : [])])];
  club.members = club.members.filter((m) => !ids.has(m.id));
  for (const week of club.weeks) week.entries = week.entries.filter((e) => !ids.has(e.memberId));
  club.schedules = club.schedules.filter((s) => s.shifts.length || s.published).filter((s) => s.sourceFilename || !s.shifts.every((t) => t.assignments.every((a) => ids.has(a.memberId))));
  let resetAssignments = 0;
  for (const schedule of club.schedules) {
    for (const shift of schedule.shifts) {
      shift.assignments = shift.assignments.filter((a) => !ids.has(a.memberId));
      if (shift.cancellationSnapshot) shift.cancellationSnapshot = shift.cancellationSnapshot.filter((a) => !ids.has(a.memberId));
      for (const assignment of [...shift.assignments, ...(shift.cancellationSnapshot ?? [])]) {
        if (assignment.originalId && ids.has(assignment.originalId)) delete assignment.originalId;
      }
      if (!(data.resetMonths as string[]).includes(schedule.month)) continue;
      check(schedule.sourceFilename === source.filename, "Chỉ đặt lại kết quả của lịch từ file nguồn đã đối chiếu.");
      delete shift.cancelled;
      delete shift.cancelReason;
      delete shift.cancelledAt;
      delete shift.cancellationSnapshot;
      for (const assignment of shift.assignments) {
        assignment.result = "unverified";
        assignment.late = false;
        resetAssignments++;
      }
    }
  }
  delete club.demoArchive;
  club.demo = false;
  club.testAccountsDisabled = true;
  club.testDataCleanedAt = new Date().toISOString();
  club.logs = club.logs.filter((log) => !names.has(log.actor) && !log.text.includes("Nạp dữ liệu mẫu"));
  club.logs.unshift({ at: club.testDataCleanedAt, actor: me.name, text: `Dọn ${removed.length} hồ sơ thử và kho mẫu; đặt lại ${resetAssignments} kết quả trực về chưa xác minh, giữ nguyên phân công; ngừng tài khoản member thử nghiệm.` });
  return { removedUserIds, removedMembers: removed.length, resetAssignments, alreadyDone: false };
}
