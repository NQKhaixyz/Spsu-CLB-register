import {
  addDays,
  closeWeek,
  createClub,
  demoClub,
  makeSchedule,
  newEntry,
  rulesFor,
  syncWeeks,
  today,
  uid,
  weekId,
  weekday,
  type Club,
  type Member,
  type DutyResult,
  type AvailabilityDetail,
} from "./club";
import {
  activeAvailabilityDatasetFor,
  availabilityForDuty,
  clockMinutes,
  personKey,
  validateDetailRows,
} from "./availability";
import type { AvailabilitySettings } from "./club";

export type Identity = { userId: string; email: string; displayName: string };
export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const str = (value: unknown, max = 500) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const checkStudentId = (studentId: string) =>
  check(!["admin", "member"].includes(studentId.toLowerCase()), "MSSV trùng tên đăng nhập dành riêng. Vui lòng nhập MSSV khác.");
const validDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(date)) &&
  new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date;
export function applyAction(
  club: Club,
  identity: Identity,
  action: string,
  data: Record<string, any>,
) {
  let me = club.members.find((m) => m.userId === identity.userId);
  const admin = me?.role === "admin" && me.active;
  const note = (text: string) => {
    club.logs.unshift({
      at: new Date().toISOString(),
      actor: me?.name ?? identity.displayName,
      text,
    });
    club.logs = club.logs.slice(0, 2000);
  };
  if (action === "profile") {
    check(!me || me.active, "Tài khoản đã ngừng hoạt động.");
    const name = str(data.name, 100),
      studentId = str(data.studentId, 30);
    checkStudentId(studentId);
    check(
      name.length >= 2 && /^[a-zA-Z0-9._-]{3,30}$/.test(studentId),
      "Nhập họ tên và MSSV hợp lệ (3–30 ký tự).",
    );
    const existing = club.members.find(
      (m) =>
        m.studentId.toLowerCase() === studentId.toLowerCase() &&
        m.id !== me?.id,
    );
    if (existing) {
      throw new Error(
        "MSSV đã có trong danh sách. Nhờ BCS cấp tài khoản cho hồ sơ này.",
      );
    } else if (me) {
      me.name = name;
      me.studentId = studentId;
    } else {
      me = {
        id: uid(),
        name,
        studentId,
        email: identity.email,
        userId: identity.userId,
        role: identity.userId === club.ownerId ? "admin" : "member",
        active: true,
        joined: today(),
        availability: [],
        extraDuties: false,
      };
      club.members.push(me);
    }
    syncWeeks(club);
    note("Cập nhật hồ sơ thành viên");
    return;
  }
  check(me?.active, "Tài khoản chưa có hồ sơ hoặc đã ngừng hoạt động.");
  if (action === "register") {
    const w = club.weeks.find((w) => w.id === weekId());
    check(
      w && !w.closed && !w.cancelled,
      "Tuần này đã chốt hoặc không tổ chức họp.",
    );
    const e = w.entries.find((e) => e.memberId === me.id);
    check(e, "Bạn chưa có trong danh sách tuần này.");
    check(
      !e.attendanceVerified,
      "Kết quả đã được BCS ghi nhận. Liên hệ BCS nếu cần điều chỉnh.",
    );
    if (data.status === "attending") {
      check(
        e.status === "unregistered" || e.status === "attending",
        "Đăng ký vắng cần gửi yêu cầu để BCS duyệt.",
      );
      e.status = "attending";
      e.absent = false;
      e.excused = false;
      e.reason = "";
      delete e.request;
      delete e.decision;
    } else if (data.status === "absent") {
      check(e.status !== "pending", "Hãy rút yêu cầu đang chờ trước.");
      const reason = str(data.reason);
      check(reason.length >= 3, "Vui lòng nhập lý do xin vắng.");
      e.status = "absent";
      e.reason = reason;
      e.excused = true;
      e.absent = true;
      e.passed = false;
      delete e.request;
      delete e.decision;
    } else if (data.status === "pending") {
      check(e.status === "absent", "Chỉ gửi yêu cầu khi đang đăng ký vắng.");
      const request = str(data.reason);
      check(request.length >= 3, "Nhập lời nhắn gửi BCS.");
      e.status = "pending";
      e.absent = undefined;
      e.request = request;
      e.decision = "";
    } else if (data.status === "withdraw") {
      check(e.status === "pending", "Yêu cầu đã được xử lý.");
      e.status = "absent";
      e.absent = true;
      e.decision = "Thành viên rút yêu cầu";
    } else throw new Error("Lựa chọn không hợp lệ.");
    note(`Đăng ký họp: ${e.status}`);
    return;
  }
  if (action === "preferences") {
    me.extraDuties = !!data.extraDuties;
    note("Cập nhật nguyện vọng trực thêm");
    return;
  }
  check(admin, "Chỉ BCS được thực hiện thao tác này.");
  const getWeek = () => {
    const w = club.weeks.find((w) => w.id === data.week);
    check(w, "Không tìm thấy tuần.");
    return w;
  };
  const getMember = () => {
    const m = club.members.find((m) => m.id === data.memberId);
    check(m, "Không tìm thấy thành viên.");
    return m;
  };
  if (action === "meeting") {
    const w = getWeek();
    const date = str(data.meetingDate, 10);
    check(
      !date || (validDate(date) && date >= w.id && date <= addDays(w.id, 6)),
      "Ngày họp phải nằm trong tuần đang chọn.",
    );
    if (w.closed) {
      check(
        !w.meetingDate && date,
        "Tuần đã chốt, chỉ được bổ sung ngày họp còn thiếu.",
      );
      const reason = str(data.note);
      check(reason.length >= 3, "Cần ghi lý do bổ sung ngày họp đã chốt.");
      w.meetingDate = date;
      note(`Bổ sung ngày họp tuần ${w.id}: ${date}; ${reason}`);
      return;
    }
    check(/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time), "Giờ họp không hợp lệ.");
    Object.assign(w, {
      meetingDate: date,
      time: data.time,
      location: str(data.location, 200),
      cancelled: !!data.cancelled,
    });
    note(`Cập nhật lịch họp tuần ${w.id}`);
  } else if (action === "close") {
    const w = getWeek();
    check(
      w.meetingDate || w.cancelled,
      "Hãy đặt ngày họp trước khi chốt để thống kê đúng tháng.",
    );
    closeWeek(w);
    note(`Chốt cuộc họp tuần ${w.id}`);
  } else if (action === "review") {
    const w = getWeek();
    check(!w.closed, "Tuần đã chốt.");
    const e = w.entries.find((e) => e.memberId === data.memberId);
    check(e?.status === "pending", "Yêu cầu đã được xử lý.");
    check(data.approved || str(data.reason).length >= 3, "Nhập lý do từ chối.");
    e.status = data.approved ? "attending" : "absent";
    e.absent = !data.approved;
    e.decision = data.approved ? "BCS chấp thuận" : str(data.reason);
    if (data.approved) e.excused = false;
    note(
      `${data.approved ? "Duyệt" : "Từ chối"} yêu cầu của ${getMember().name}`,
    );
  } else if (action === "entry") {
    const w = getWeek();
    check(!w.cancelled, "Tuần không tổ chức họp.");
    const e = w.entries.find((e) => e.memberId === data.memberId);
    check(e, "Không tìm thấy đăng ký.");
    if (w.closed)
      check(str(data.note).length >= 3, "Cần ghi lý do sửa kết quả đã chốt.");
    if (data.status) {
      check(
        ["attending", "absent"].includes(data.status),
        "Trạng thái không hợp lệ.",
      );
      e.status = data.status;
      e.absent = data.status === "absent";
      if (data.status === "attending") e.excused = false;
    }
    if (typeof data.absent === "boolean") {
      e.absent = data.absent;
      e.status = data.absent ? "absent" : "attending";
    }
    if (typeof data.excused === "boolean") e.excused = data.excused;
    if (typeof data.passed === "boolean") {
      check(
        !data.passed || (e.status === "attending" && !e.absent),
        "Chỉ ghi nhận qua quy chế cho người có mặt.",
      );
      e.passed = data.passed;
    }
    if (e.absent) e.passed = false;
    if (
      data.status !== undefined ||
      typeof data.absent === "boolean" ||
      typeof data.excused === "boolean" ||
      typeof data.passed === "boolean"
    )
      e.attendanceVerified = true;
    note(
      `Cập nhật điểm danh ${getMember().name}${data.note ? `: ${str(data.note)}` : ""}`,
    );
  } else if (action === "schedule") {
    check(/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month), "Tháng không hợp lệ.");
    const old = club.schedules.find((s) => s.month === data.month);
    check(
      !old?.published,
      "Lịch đã công bố. Hãy sửa từng ca để giữ kết quả đã xác minh.",
    );
    const next = makeSchedule(club, data.month);
    club.schedules = club.schedules.filter((s) => s.month !== data.month);
    club.schedules.push(next);
    note(`Xếp lịch nháp tháng ${data.month}`);
  } else if (action === "publish") {
    const s = club.schedules.find((s) => s.month === data.month);
    check(s && !s.published, "Không có lịch nháp để công bố.");
    check(s.shifts.length, "Lịch không có ca trực.");
    s.published = true;
    note(`Công bố lịch trực ${s.month}`);
  } else if (action === "cancelShift" || action === "restoreShift") {
    const schedule = club.schedules.find((s) => s.month === data.month),
      shift = schedule?.shifts.find((t) => t.id === data.shiftId);
    check(shift, "Không tìm thấy ca trực.");
    if (action === "cancelShift") {
      check(!shift.cancelled, "Ca này đã hủy.");
      shift.cancellationSnapshot = structuredClone(shift.assignments);
      shift.cancelled = true;
      shift.cancelReason = str(data.reason, 500) || "BCS hủy ca trực";
      shift.cancelledAt = new Date().toISOString();
      for (const assignment of shift.assignments) {
        assignment.result = "cancelled";
        assignment.late = false;
      }
      note(`Hủy cả ca ${shift.id}: ${shift.cancelReason}`);
    } else {
      check(
        shift.cancelled && shift.cancellationSnapshot,
        "Ca này chưa bị hủy hoặc không có dữ liệu để khôi phục.",
      );
      shift.assignments = structuredClone(shift.cancellationSnapshot);
      delete shift.cancelled;
      delete shift.cancelReason;
      delete shift.cancelledAt;
      delete shift.cancellationSnapshot;
      note(`Khôi phục cả ca ${shift.id}`);
    }
  } else if (action === "shift") {
    const s = club.schedules.find((s) => s.month === data.month);
    const shift = s?.shifts.find((s) => s.id === data.shiftId);
    check(s && shift, "Không tìm thấy ca trực.");
    check(
      !shift.cancelled,
      "Ca đã hủy. Khôi phục ca trước khi sửa phân công hoặc kết quả.",
    );
    const position = Number(data.position);
    check(
      Number.isInteger(position) && position >= 0 && position < 2,
      "Vị trí không hợp lệ.",
    );
    let a = shift.assignments[position];
    if (data.replacementId !== undefined) {
      const replacement = club.members.find(
        (m) => m.id === data.replacementId && m.active,
      );
      check(
        replacement && replacement.joined <= shift.date,
        "Thành viên chưa hoạt động vào ngày trực.",
      );
      check(
        !shift.assignments.some(
          (other, i) => i !== position && other.memberId === replacement.id,
        ),
        "Thành viên đã có trong ca này.",
      );
      check(
        availabilityForDuty(club, replacement, shift.date, shift.period, shift)
          .available,
        "Thành viên không rảnh trong ca này theo dữ liệu hiện tại.",
      );
      if (a) {
        a.originalId ??= a.memberId;
        a.memberId = replacement.id;
        a.result = "unverified";
        a.late = false;
        a.note = "";
        a.availabilityNote = availabilityForDuty(
          club,
          replacement,
          shift.date,
          shift.period,
          shift,
        ).note;
      } else {
        a = {
          memberId: replacement.id,
          result: "unverified",
          late: false,
          availabilityNote: availabilityForDuty(
            club,
            replacement,
            shift.date,
            shift.period,
            shift,
          ).note,
        };
        shift.assignments.push(a);
      }
      note(`Đổi người ca ${shift.id}: ${replacement.name}`);
    }
    if (data.result !== undefined) {
      check(s?.published, "Công bố lịch trước khi ghi nhận kết quả.");
      check(a, "Ca chưa có người.");
      check(
        [
          "unverified",
          "completed",
          "unexcused",
          "excused",
          "cancelled",
        ].includes(data.result),
        "Kết quả không hợp lệ.",
      );
      a.result = data.result as DutyResult;
      if (["unexcused", "excused", "cancelled"].includes(a.result)) {
        a.late = false;
      }
      note(`Xác minh ca ${shift.id}: ${data.result}`);
    }
    if (data.late !== undefined) {
      check(
        s.published && a,
        "Công bố lịch và phân người trước khi ghi nhận đến muộn.",
      );
      check(typeof data.late === "boolean", "Ô đến muộn không hợp lệ.");
      check(
        !data.late || !["unexcused", "excused", "cancelled"].includes(a.result),
        "Người vắng hoặc ca hủy không ghi nhận đến muộn.",
      );
      a.late = data.late;
      note(`Ghi nhận đến muộn ca ${shift.id}: ${data.late ? "Có" : "Không"}`);
    }
    if (data.note !== undefined) {
      check(a, "Ca chưa có người.");
      a.note = str(data.note, 1000);
      note(`Cập nhật ghi chú ca ${shift.id}`);
    }
    if (data.remove) {
      check(!s?.published, "Chỉ bỏ ca khi còn là bản nháp.");
      s.shifts = s.shifts.filter((t) => t.id !== shift.id);
      note(`Bỏ ca ${shift.id}`);
    }
  } else if (action === "member") {
    let m = data.memberId ? getMember() : null;
    if (!m) {
      const studentId = str(data.studentId, 30),
        name = str(data.name, 100);
      checkStudentId(studentId);
      check(!club.members.some((existing) => existing.needsStudentId && personKey(existing.name) === personKey(name)), "Tên này đã có hồ sơ chờ MSSV. Hãy bổ sung MSSV tại hồ sơ hiện có.");
      check(
        name.length > 1 && /^[a-zA-Z0-9._-]{3,30}$/.test(studentId),
        "Nhập MSSV và họ tên hợp lệ.",
      );
      check(
        !club.members.some(
          (m) => m.studentId.toLowerCase() === studentId.toLowerCase(),
        ),
        "MSSV đã tồn tại.",
      );
      m = {
        id: uid(),
        name,
        studentId,
        email: str(data.email, 200),
        role: "member",
        active: true,
        joined: today(),
        availability: [],
        extraDuties: false,
      };
      club.members.push(m);
    } else {
      if (
        data.studentId !== undefined &&
        str(data.studentId, 30) !== m.studentId
      ) {
        const studentId = str(data.studentId, 30);
        checkStudentId(studentId);
        check(
          /^[a-zA-Z0-9._-]{3,30}$/.test(studentId),
          "MSSV cần có 3–30 ký tự hợp lệ.",
        );
        check(
          !club.members.some(
            (other) =>
              other.id !== data.memberId &&
              other.studentId.toLowerCase() === studentId.toLowerCase(),
          ),
          "MSSV đã tồn tại.",
        );
        m.studentId = studentId;
        m.needsStudentId = false;
      }
      if (data.name) m.name = str(data.name, 100);
      if (data.email !== undefined) m.email = str(data.email, 200);
      if (data.active !== undefined && !!data.active !== m.active) {
        check(
          m.userId !== club.ownerId,
          "Không thể ngừng hoạt động tài khoản chủ quản trị.",
        );
        m.active = !!data.active;
        m.left = m.active ? undefined : today();
      }
      if (data.role) {
        check(["admin", "member"].includes(data.role), "Vai trò không hợp lệ.");
        check(
          m.userId !== club.ownerId || data.role === "admin",
          "Không thể hạ quyền chủ quản trị.",
        );
        m.role = data.role;
      }
    }
    if (data.extraDuties !== undefined) m.extraDuties = !!data.extraDuties;
    if (data.availability) {
      check(
        Array.isArray(data.availability) &&
          data.availability.every((x: unknown) =>
            /^[0-6]-(am|pm)$/.test(String(x)),
          ),
        "Lịch rảnh không hợp lệ.",
      );
      m.availability = [...new Set<string>(data.availability)];
    }
    syncWeeks(club);
    note(`Cập nhật thành viên ${m.name}`);
  } else if (action === "activateAvailabilityDetails") {
    const dataset = club.availabilityDataset;
    check(dataset?.rows.length, "Chưa có file lịch rảnh chi tiết.");
    check(
      /^\d{4}-(0[1-9]|1[0-2])$/.test(data.month),
      "Tháng xếp lịch không hợp lệ.",
    );
    check(
      !club.schedules.find((s) => s.month === data.month)?.published,
      "Tháng này đã có lịch công bố. Không thể thay bằng bản nháp.",
    );
    const settings: AvailabilitySettings = {
      anchorDate: str(data.anchorDate, 10),
      anchorWeek: Number(data.anchorWeek),
      startDate: str(data.startDate, 10),
      amStart: str(data.amStart, 5),
      amEnd: str(data.amEnd, 5),
      pmStart: str(data.pmStart, 5),
      pmEnd: str(data.pmEnd, 5),
      allowedLateMinutes: Number(data.allowedLateMinutes),
      ignoreSourceNotes: true,
    };
    check(
      validDate(settings.anchorDate) && validDate(settings.startDate),
      "Mốc tuần học và ngày bắt đầu trực không hợp lệ.",
    );
    check(
      Number.isInteger(settings.anchorWeek) &&
        settings.anchorWeek >= 1 &&
        settings.anchorWeek <= 53,
      "Số tuần học phải từ 1–53.",
    );
    check(
      Number.isInteger(settings.allowedLateMinutes) &&
        settings.allowedLateMinutes >= 0 &&
        settings.allowedLateMinutes <= 60,
      "Mức đến muộn cho phép cần từ 0–60 phút.",
    );
    check(
      clockMinutes(settings.amStart) < clockMinutes(settings.amEnd) &&
        clockMinutes(settings.amEnd) <= clockMinutes(settings.pmStart) &&
        clockMinutes(settings.pmStart) < clockMinutes(settings.pmEnd),
      "Khung giờ ca sáng/chiều không hợp lệ.",
    );
    validateDetailRows(dataset.rows, settings);
    const links: Record<string, string> = {};
    for (const row of dataset.rows) {
      const key = personKey(row.name);
      if (links[key]) continue;
      const linked = dataset.memberLinks?.[key];
      let member = linked
        ? club.members.find((m) => m.id === linked)
        : undefined;
      if (!member) {
        const matches = club.members.filter((m) => personKey(m.name) === key);
        check(
          matches.length <= 1,
          `Có nhiều hồ sơ trùng tên ${row.name}. BCS cần phân biệt trước khi áp dụng.`,
        );
        member = matches[0];
      }
      if (!member) {
        member = {
          id: uid(),
          name: row.name,
          studentId: "",
          role: "member",
          active: true,
          joined: today(),
          availability: [],
          extraDuties: false,
          needsStudentId: true,
        };
        club.members.push(member);
      }
      links[key] = member.id;
    }
    dataset.settings = settings;
    dataset.memberLinks = links;
    club.activeAvailabilityDataset = structuredClone(dataset);
    club.availabilityVersion = new Date().toISOString();
    syncWeeks(club);
    const draft = makeSchedule(club, data.month);
    club.schedules = club.schedules.filter((s) => s.month !== data.month);
    club.schedules.push(draft);
    note(
      `Áp dụng lịch rảnh theo tuần học từ ${settings.startDate}; ${Object.keys(links).length} người; cho phép đến muộn ${settings.allowedLateMinutes} phút`,
    );
  } else if (action === "importAvailabilityDetails") {
    check(
      Array.isArray(data.rows) &&
        data.rows.length > 0 &&
        data.rows.length <= 5000,
      "File cần có 1–5.000 dòng lịch rảnh.",
    );
    const rows: AvailabilityDetail[] = data.rows.map(
      (row: Record<string, unknown>) => {
        check(row && typeof row === "object", "Dòng lịch rảnh không hợp lệ.");
        const sourceRow = Number(row.sourceRow);
        check(
          Number.isInteger(sourceRow) && sourceRow >= 2 && sourceRow <= 5001,
          "Số dòng nguồn không hợp lệ.",
        );
        const name = str(row.name, 100),
          day = str(row.day, 30),
          period = str(row.period, 100),
          weeks = str(row.weeks, 200);
        check(
          name.length >= 2 && day && period && weeks,
          `Dòng ${sourceRow} thiếu họ tên, thứ, buổi hoặc tuần học.`,
        );
        return {
          sourceRow,
          name,
          day,
          period,
          weeks,
          note: str(row.note, 1000),
        };
      },
    );
    const activeDataset = activeAvailabilityDatasetFor(club);
    if (activeDataset && !club.activeAvailabilityDataset)
      club.activeAvailabilityDataset = structuredClone(activeDataset);
    club.availabilityDataset = {
      filename: str(data.filename, 200) || "Lịch rảnh chi tiết.xlsx",
      importedAt: new Date().toISOString(),
      importedBy: me.name,
      rows,
    };
    note(
      `Nhập lịch rảnh chi tiết: ${rows.length} dòng; giữ nguyên điều kiện tuần học và khung giờ`,
    );
  } else if (action === "import") {
    check(
      Array.isArray(data.rows) &&
        data.rows.length > 0 &&
        data.rows.length <= 1500,
      "File phải có 1–1500 thành viên.",
    );
    const ids = new Set();
    if (data.kind === "availability")
      for (const m of club.members) m.availability = [];
    for (const row of data.rows) {
      const studentId = str(row.studentId, 30),
        name = str(row.name, 100);
      checkStudentId(studentId);
      check(
        /^[a-zA-Z0-9._-]{3,30}$/.test(studentId) && name.length > 1,
        `Dòng MSSV ${studentId || "trống"} thiếu dữ liệu hợp lệ.`,
      );
      check(
        !ids.has(studentId.toLowerCase()),
        `MSSV ${studentId} bị trùng trong file.`,
      );
      ids.add(studentId.toLowerCase());
      let m = club.members.find(
        (m) => m.studentId.toLowerCase() === studentId.toLowerCase(),
      );
      if (!m) {
        check(!club.members.some((existing) => existing.needsStudentId && personKey(existing.name) === personKey(name)), `Hồ sơ ${name} đang chờ MSSV. Hãy bổ sung MSSV trong danh sách thành viên trước khi nhập file để giữ lịch trực hiện có.`);
        m = {
          id: uid(),
          studentId,
          name,
          email: str(row.email, 200),
          active: true,
          joined: today(),
          role: "member",
          availability: [],
          extraDuties: false,
        };
        club.members.push(m);
      }
      m.name = name;
      if (row.email) m.email = str(row.email, 200);
      if (data.kind === "availability") {
        check(
          Array.isArray(row.availability) &&
            row.availability.every((x: unknown) =>
              /^[0-6]-(am|pm)$/.test(String(x)),
            ),
          "Lịch rảnh không hợp lệ.",
        );
        m.availability = row.availability;
        m.extraDuties = !!row.extraDuties;
      }
    }
    if (data.kind === "availability") {
      delete club.activeAvailabilityDataset;
      if (club.availabilityDataset) {
        delete club.availabilityDataset.settings;
        delete club.availabilityDataset.memberLinks;
      }
      club.availabilityVersion = new Date().toISOString();
    }
    syncWeeks(club);
    note(
      `Nhập ${data.rows.length} dòng ${data.kind === "availability" ? "lịch rảnh" : "thành viên"}`,
    );
  } else if (action === "settings") {
    if (data.name) club.name = str(data.name, 80);
    if (data.days) {
      check(
        Array.isArray(data.days) &&
          data.days.length > 0 &&
          data.days.every(
            (d: unknown) =>
              Number.isInteger(d) && Number(d) >= 0 && Number(d) < 7,
          ),
        "Chọn ngày trực hợp lệ.",
      );
      club.days = [...new Set<number>(data.days)];
    }
    if (data.rule) {
      const r = data.rule;
      check(
        /^\d{4}-(0[1-9]|1[0-2])$/.test(r.month),
        "Tháng áp dụng không hợp lệ.",
      );
      check(
        r.month >= today().slice(0, 7),
        "Chỉ đổi hệ số từ tháng hiện tại trở đi.",
      );
      const D = r.D ?? rulesFor(club, r.month).D ?? 0;
      for (const key of ["A", "B", "C", "D"])
        check(
          Number.isFinite(key === "D" ? D : r[key]) &&
            (key === "D" ? D : r[key]) >= 0 &&
            (key === "D" ? D : r[key]) <= 100000,
          "Hệ số điểm phải là số không âm.",
        );
      club.rules = club.rules.filter((rule) => rule.month !== r.month);
      club.rules.push({ month: r.month, A: r.A, B: r.B, C: r.C, D });
    }
    note("Cập nhật cấu hình CLB");
  } else if (action === "activateOfficialRoster") {
    const dataset = activeAvailabilityDatasetFor(club);
    const ids = new Set(
      Object.values(dataset?.memberLinks ?? {}),
    );
    check(ids.size > 0, "Chưa có danh sách được ghép từ file lịch rảnh.");
    check(
      [...ids].every((id) => club.members.some((m) => m.id === id)),
      "Có hồ sơ trong file chưa được lưu.",
    );
    const penalty = Number(data.latePenalty);
    check(
      Number.isFinite(penalty) && penalty >= 0 && penalty <= 100000,
      "Mức trừ đi muộn không hợp lệ.",
    );
    if (club.demo) {
      const sampleIds = new Set(
        club.members
          .filter(
            (m) => m.id.startsWith("demo-") && !ids.has(m.id) && !m.userId,
          )
          .map((m) => m.id),
      );
      const sampleSchedules = club.schedules.filter(
        (s) =>
          !s.sourceFilename &&
          s.shifts.some((t) =>
            t.assignments.some((a) => sampleIds.has(a.memberId)),
          ),
      );
      club.demoArchive = {
        archivedAt: new Date().toISOString(),
        members: club.members.filter((m) => sampleIds.has(m.id)),
        weeks: club.weeks,
        schedules: sampleSchedules,
      };
      club.members = club.members.filter((m) => !sampleIds.has(m.id));
      club.weeks = [];
      club.schedules = club.schedules.filter(
        (s) => !sampleSchedules.includes(s),
      );
      club.demo = false;
      syncWeeks(club);
    }
    club.officialSince ??= new Date().toISOString();
    const months = new Set([
      today().slice(0, 7),
      dataset?.settings?.startDate.slice(0, 7) ??
        today().slice(0, 7),
    ]);
    for (const month of months) {
      const current = rulesFor(club, month);
      club.rules = club.rules.filter((r) => r.month !== month);
      club.rules.push({ ...current, month, D: penalty });
    }
    note(
      `Đưa ${ids.size} thành viên từ file vào hệ thống chính thức; mức trừ đi muộn D=${penalty}`,
    );
  } else if (action === "demo") {
    check(
      !club.demo &&
        club.members.length === 1 &&
        club.members[0].userId === identity.userId &&
        !club.schedules.length &&
        club.weeks.every(
          (w) =>
            !w.closed && w.entries.every((e) => e.status === "unregistered"),
        ),
      "Chỉ nạp mẫu khi chưa có dữ liệu hoạt động.",
    );
    Object.assign(club, demoClub(club.ownerId, me));
    note("Nạp dữ liệu mẫu để trải nghiệm");
  } else if (action === "resetDemo") {
    check(club.demo, "Chỉ có thể xóa dữ liệu mẫu.");
    check(data.confirm === "BAT DAU", "Chưa xác nhận bắt đầu dữ liệu thật.");
    const real = createClub(club.ownerId);
    const linkedIds = new Set(
      Object.values(activeAvailabilityDatasetFor(club)?.memberLinks ?? {}),
    );
    real.members = [
      { ...me, joined: today(), availability: [] },
      ...club.members.filter(
        (m) => m.id !== me.id && (!!m.userId || linkedIds.has(m.id)),
      ),
    ];
    if (club.availabilityDataset)
      real.availabilityDataset = club.availabilityDataset;
    if (club.activeAvailabilityDataset)
      real.activeAvailabilityDataset = club.activeAvailabilityDataset;
    Object.assign(club, real);
    syncWeeks(club);
    note("Bắt đầu dữ liệu thật");
  } else throw new Error("Thao tác không được hỗ trợ.");
}
