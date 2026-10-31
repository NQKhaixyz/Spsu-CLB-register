import {
  addDays,
  closeWeek,
  createClub,
  demoClub,
  makeSchedule,
  newEntry,
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

export type Identity = { userId: string; email: string; displayName: string };
export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const str = (value: unknown, max = 500) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
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
    if (data.status === "attending") {
      check(
        e.status === "unregistered" || e.status === "attending",
        "Đăng ký vắng cần gửi yêu cầu để BCS duyệt.",
      );
      e.status = "attending";
      e.absent = false;
      e.excused = false;
      e.reason = "";
    } else if (data.status === "absent") {
      check(e.status !== "pending", "Hãy rút yêu cầu đang chờ trước.");
      const reason = str(data.reason);
      check(reason.length >= 3, "Vui lòng nhập lý do xin vắng.");
      e.status = "absent";
      e.reason = reason;
      e.excused = true;
      e.absent = true;
      e.passed = false;
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
    check(!w.closed, "Tuần đã chốt, không đổi lịch họp.");
    const date = str(data.meetingDate, 10);
    check(
      !date || (validDate(date) && date >= w.id && date <= addDays(w.id, 6)),
      "Ngày họp phải nằm trong tuần đang chọn.",
    );
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
      if (!data.absent) e.status = "attending";
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
  } else if (action === "shift") {
    const s = club.schedules.find((s) => s.month === data.month);
    const shift = s?.shifts.find((s) => s.id === data.shiftId);
    check(s && shift, "Không tìm thấy ca trực.");
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
        replacement.availability.includes(
          `${weekday(shift.date)}-${shift.period}`,
        ),
        "Thành viên không rảnh trong ca này theo dữ liệu hiện tại.",
      );
      if (a) {
        a.originalId ??= a.memberId;
        a.memberId = replacement.id;
        a.result = "unverified";
      } else {
        a = { memberId: replacement.id, result: "unverified" };
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
      note(`Xác minh ca ${shift.id}: ${data.result}`);
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
    if (data.kind === "availability")
      club.availabilityVersion = new Date().toISOString();
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
      for (const key of ["A", "B", "C"])
        check(
          Number.isFinite(r[key]) && r[key] >= 0 && r[key] <= 100000,
          "Hệ số điểm phải là số không âm.",
        );
      club.rules = club.rules.filter((rule) => rule.month !== r.month);
      club.rules.push({ month: r.month, A: r.A, B: r.B, C: r.C, D: 0 });
    }
    note("Cập nhật cấu hình CLB");
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
    real.members = [{ ...me, joined: today(), availability: [] }];
    if (club.availabilityDataset)
      real.availabilityDataset = club.availabilityDataset;
    Object.assign(club, real);
    syncWeeks(club);
    note("Bắt đầu dữ liệu thật");
  } else throw new Error("Thao tác không được hỗ trợ.");
}
