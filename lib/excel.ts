import { visibleActivityKinds, ratedActivityKinds, activityLabels, activityName, activityPointsFor, activityUnitPoints, registrationStatusLabel, eventForActivity, isManualActivityKind } from "./activity";
import {
  addDays,
  dateLabel,
  dutyNames,
  monthLabel,
  monthlyReportRoster,
  rulesFor,
  scoreFor,
  dutyPointsFor,
  latePenaltyFor,
  statusNames,
  isDutyReportShift,
  today,
  type Club,
  type AvailabilityDetail,
} from "./club";
import { memberCommitteeNames } from "./committees";
import type { Worksheet } from "exceljs";

export async function makeReport(club: Club, month: string, asOf = today()) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Nhịp Đội";
  book.created = new Date();
  const { hidden, members: participants } = monthlyReportRoster(club, month, asOf);
  const membersById = new Map(club.members.filter(m => !hidden.has(m.id)).map(m => [m.id, m]));
  const member = (id: string) => membersById.get(id);
  const weeks = club.weeks.filter(
    (w) => !w.cancelled && w.meetingDate.slice(0, 7) === month,
  ).map(w => ({ ...w, entries: w.entries.filter(e => !hidden.has(e.memberId)) }));
  const schedules = club.schedules.filter(
    (s) => s.month === month,
  ).map(s => ({ ...s, shifts: s.shifts.filter(shift => isDutyReportShift(s, shift))
    .map(shift => ({ ...shift, assignments: shift.assignments.filter(a => !hidden.has(a.memberId)) })) }));
  const eventIds = new Set((club.events ?? []).map(event => event.id));
  const activityRegistrations = (club.activityRegistrations ?? [])
    .filter(r => !hidden.has(r.memberId) && r.kind === "event" && eventIds.has(r.eventId ?? "") && r.date.slice(0, 7) === month);
  const pendingDuties = schedules
    .flatMap((s) => s.shifts.flatMap((t) => t.assignments))
    .filter((a) => a.result === "unverified").length;
  const warnings = [
    weeks.some((w) => !w.closed) ? "Có tuần chưa chốt" : "",
    pendingDuties ? `${pendingDuties} lượt trực chưa xác minh` : "",
    club.weeks.some(
      (w) =>
        !w.meetingDate &&
        !w.cancelled &&
        (w.id.slice(0, 7) === month || addDays(w.id, 6).slice(0, 7) === month),
    )
      ? "Có tuần chưa đặt ngày họp; chưa tính vào điểm"
      : "",
    activityRegistrations.some(r => r.status === "pending" && !eventForActivity(club, r)?.cancelledAt) ? "Có đăng ký hoạt động chưa xác nhận" : "",
    club.demo ? "DỮ LIỆU MẪU" : "",
  ].filter(Boolean);
  const addSheet = (
    name: string,
    columns: string[],
    rows: (string | number | boolean)[][],
  ) => {
    const sheet = book.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 3 }],
    });
    sheet.addRow([`${club.name} · ${monthLabel(month)}`]);
    sheet.addRow([
      warnings.length
        ? `BẢN TẠM · ${warnings.join("; ")}`
        : "Báo cáo theo dữ liệu đã ghi nhận",
      `Xuất lúc: ${new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}`,
    ]);
    sheet.addRow(columns);
    rows.forEach((r) => sheet.addRow(r));
    sheet.columns.forEach((col, i) => {
      col.width = columns[i]?.startsWith("Ban ") ? 52 : Math.min(48, Math.max(16, columns[i]?.length + 5 || 16));
    });
    sheet.getRow(1).font = {
      bold: true,
      size: 16,
      color: { argb: "FF17674A" },
    };
    sheet.getRow(2).font = {
      italic: true,
      size: 10,
      color: { argb: warnings.length ? "FF9A6817" : "FF65736A" },
    };
    sheet.getRow(3).height = 30;
    sheet.getRow(3).eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF17674A" },
      };
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      cell.alignment = { vertical: "middle" };
    });
    sheet.autoFilter = {
      from: { row: 3, column: 1 },
      to: { row: Math.max(3, sheet.rowCount), column: columns.length },
    };
    sheet.eachRow((r, n) => {
      if (n > 3 && n % 2 === 0)
        r.eachCell((c) => {
          c.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF1F6F3" },
          };
        });
    });
  };
  addSheet(
    "Tổng hợp tháng",
    [
      "STT",
      "MSSV",
      "Họ tên",
      "Trực hoàn thành",
      "Trực vắng không phép",
      "Họp có mặt",
      "Họp vắng không phép",
      "Đạt phiếu điểm danh",
      "Tổng điểm",
      "Lượt đi muộn trừ điểm",
      "Điểm trừ đi muộn",
      "Ban trực thuộc",
      ...visibleActivityKinds.map(k => activityLabels[k] + (["deduction", "special", "committee"].includes(k) ? "" : " (lượt)")),
    ],
    participants.map((m, i) => {
      const s = scoreFor(club, m.id, month);
      return [
        i + 1,
        m.studentId,
        m.name,
        s.completed,
        s.dutyMissed,
        s.attended,
        s.meetingMissed,
        s.passed,
        s.points,
        s.lateCount,
        s.lateDeduction,
        memberCommitteeNames(m),
        ...visibleActivityKinds.map(k => s.activityCounts[k]),
      ];
    }),
  );
  addSheet(
    "Chi tiết họp",
    [
      "Ngày họp",
      "Tuần",
      "MSSV",
      "Họ tên",
      "Đăng ký",
      "Kết quả",
      "Có phép",
      "Lý do",
      "Đạt phiếu điểm danh",
      "Đã chốt",
      "Ban trực thuộc",
    ],
    weeks.flatMap((w) =>
      w.entries.map((e) => [
        dateLabel(w.meetingDate, true),
        w.id,
        member(e.memberId)?.studentId ?? "",
        member(e.memberId)?.name ?? "",
        statusNames[e.status],
        e.absent
          ? "Vắng"
          : e.status === "attending"
            ? "Có mặt"
            : "Chưa ghi nhận",
        e.excused ? "Có" : "Không",
        e.reason,
        e.passed ? "Có" : "Không",
        w.closed ? "Có" : "Không",
        memberCommitteeNames(member(e.memberId)),
      ]),
    ),
  );
  addSheet(
    "Chi tiết trực",
    [
      "Ngày",
      "Ca",
      "MSSV",
      "Người được phân ban đầu",
      "Người thực tế phụ trách",
      "Kết quả",
      "Điểm",
      "Khung giờ ca",
      "Tuần học",
      "Ghi chú",
      "Đến muộn",
      "Điểm trừ đi muộn",
      "Trạng thái ca",
      "Lý do hủy ca",
      "Ban của người được phân ban đầu",
      "Ban của người thực tế phụ trách",
    ],
    schedules.flatMap((s) =>
      s.shifts.flatMap((t) =>
        t.assignments.map((a) => [
          dateLabel(t.date, true),
          t.period === "am" ? "Sáng" : "Chiều",
          member(a.memberId)?.studentId ?? "",
          member(a.originalId ?? a.memberId)?.name ?? "",
          member(a.memberId)?.name ?? "",
          dutyNames[a.result],
          t.cancelled ? 0 : dutyPointsFor(a, rulesFor(club, month)),
          t.startTime ? `${t.startTime}–${t.endTime}` : "",
          t.academicWeek ?? "",
          [a.availabilityNote, a.note].filter(Boolean).join(" · "),
          a.late ? "Có" : "Không",
          t.cancelled ? 0 : latePenaltyFor(a, rulesFor(club, month)),
          t.cancelled ? "Đã hủy" : "Hoạt động",
          t.cancelReason ?? "",
          memberCommitteeNames(member(a.originalId ?? a.memberId)),
          memberCommitteeNames(member(a.memberId)),
        ]),
      ),
    ),
  );
  const activityRows = [
    ...activityRegistrations.map(r => {
      const cancelled = !!eventForActivity(club, r)?.cancelledAt;
      return {
        ...r,
        state: cancelled ? "Sự kiện đã hủy" : registrationStatusLabel(r),
        credited: !cancelled && r.status === "confirmed",
        actor: r.reviewedBy ?? "",
        decision: r.decision ?? "",
      };
    }),
    ...(club.manualActivities ?? [])
      .filter(r => isManualActivityKind(r.kind) && r.date.slice(0, 7) === month)
      .map(r => ({ ...r, state: "BĐH nhập", credited: true, actor: r.updatedBy, decision: "" })),
    ...(club.pointDeductions ?? []).filter(r => r.date.slice(0, 7) === month).map(r => ({ ...r, kind: "deduction" as const, quantity: r.points, note: r.reason, state: r.cancelledAt ? "Đã hủy khoản trừ" : "BĐH trừ điểm", credited: !r.cancelledAt, actor: r.createdBy, decision: r.cancelReason ?? "" })),
  ].filter(r => !hidden.has(r.memberId)).sort((a, b) => a.date.localeCompare(b.date) || a.memberId.localeCompare(b.memberId));
  addSheet("Chi tiết hoạt động",
    ["Tuần", "Ngày hoạt động / tính điểm", "MSSV", "Họ tên", "Hoạt động / tên sự kiện", "Số lượt / số điểm trừ", "Điểm/lượt", "Điểm", "Trạng thái", "Ghi chú / lý do trừ điểm", "Người xác nhận / nhập", "Lý do điều chỉnh", "Sự kiện từ ngày", "Sự kiện đến hết ngày", "Ban trực thuộc"],
    activityRows.map(r => {
      const event = eventForActivity(club, r);
      const count = r.kind === "committee" ? "" : r.quantity;
      const rate = r.kind === "committee" ? "" : activityUnitPoints(club, r);
      return [r.week, dateLabel(r.date, true), member(r.memberId)?.studentId ?? "", member(r.memberId)?.name ?? "", activityName(club, r), count, rate, r.credited ? activityPointsFor(club, r) : 0, r.state, r.note, member(r.actor)?.name ?? "", r.decision, event?.startDate ?? "", event?.endDate ?? "", memberCommitteeNames(member(r.memberId))];
    }),
  );
  const rule = rulesFor(club, month);
  addSheet(
    "Quy tắc điểm",
    ["Mục", "Giá trị", "Diễn giải"],
    [
      ["A", rule.A, "Cộng cho mỗi ca đã trực và được xác minh"],
      ["B", rule.B, "Trừ cho mỗi ca trực vắng không phép"],
      ["C", rule.C, "Trừ cho mỗi buổi họp vắng không phép đã chốt"],
      ["D", rule.D ?? 0, "Trừ mỗi lượt BĐH tích Đến muộn trên lịch đã công bố"],
      ["E", rule.E, "Cộng cho mỗi phiếu được BĐH tích đạt, theo ngày họp"],
      ...ratedActivityKinds.map(k => [activityLabels[k], rule.activities?.[k] ?? 0, "Nhân số lượt do BĐH nhập với mức điểm mỗi lượt"]),
      ["Sự kiện", "Điểm theo từng lượt được duyệt", "Ghi vào ngày kết thúc. Với sự kiện nhiều lượt, điểm lượt đầu nhân với hệ số qua từng lượt được duyệt và làm tròn đến hai chữ số thập phân"],
      ["Điểm theo ban", "Nhập trực tiếp", "BĐH chọn một ban và nhập số điểm cho mỗi thành viên trong tuần"],
      ["Điểm riêng", "Nhập trực tiếp", "BĐH nhập số điểm cho từng thành viên trong tuần, không nhân số lượt; dữ liệu cũ giữ cách tính đã lưu"],
      ["Điểm trừ", "Nhập trực tiếp", "BĐH nhập số điểm trừ và lý do; trừ đúng số điểm vào tuần/tháng của ngày ghi nhận, khoản đã hủy không tính điểm"],
      [
        "Công thức",
        "A × trực đủ − B × vắng trực − C × vắng họp − D × đi muộn + E × phiếu điểm danh đạt + điểm sáng kiến + điểm đồng đẳng viên + điểm sự kiện + điểm theo ban + điểm riêng − điểm trừ",
        "BĐH tích đạt để cộng E theo ngày họp",
      ],
      [
        "Lịch trực",
        "2 ca/người/tháng là mức ưu tiên",
        "Cho phép hơn 2 ca, ưu tiên người muốn trực thêm",
      ],
      [
        "Ngày bắt đầu áp dụng hệ số",
        rule.month,
        "Theo ngày họp/ngày trực/ngày hoạt động thực tế; số lượt hoạt động bắt đầu lại ở mỗi tuần mới, giữ lịch sử",
      ],
    ],
  );
  return { buffer: await book.xlsx.writeBuffer(), warnings };
}
export function saveFile(buffer: ArrayBuffer | Uint8Array, filename: string) {
  const blob = new Blob([new Uint8Array(buffer as ArrayBuffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function downloadTemplate(kind: "members" | "availability") {
  const { default: ExcelJS } = await import("exceljs");
  const b = new ExcelJS.Workbook();
  const s = b.addWorksheet("Dữ liệu");
  const days = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
  s.addRow([
    "MSSV",
    "Họ tên",
    "Email",
    ...(kind === "availability"
      ? [...days.flatMap((d) => [`${d} sáng`, `${d} chiều`]), "Muốn trực thêm"]
      : []),
  ]);
  s.addRow([
    "20241001",
    "Nguyễn Minh Anh",
    "minhanh@example.com",
    ...(kind === "availability" ? [...Array(14).fill(1), 0] : []),
  ]);
  s.columns.forEach((c) => (c.width = 22));
  s.getRow(1).font = { bold: true };
  saveFile(
    await b.xlsx.writeBuffer(),
    `mau-${kind === "members" ? "thanh-vien" : "lich-ranh"}.xlsx`,
  );
}
async function loadImportSheet(file: File) {
  if (file.size > 3_000_000) throw new Error("File cần nhỏ hơn 3 MB");
  const { default: ExcelJS } = await import("exceljs");
  const b = new ExcelJS.Workbook();
  await b.xlsx.load(await file.arrayBuffer());
  const s = b.worksheets[0];
  if (!s) throw new Error("File không có trang dữ liệu");
  return s;
}
function parseTemplate(s: Worksheet, kind: "members" | "availability") {
  const text = (row: number, col: number) => s.getCell(row, col).text.trim();
  if (
    text(1, 1).toUpperCase() !== "MSSV" ||
    text(1, 2).toLowerCase() !== "họ tên"
  )
    throw new Error("Dùng file mẫu với hai cột đầu là MSSV, Họ tên");
  if (kind === "availability") {
    const expected = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"].flatMap((d) => [
      `${d} sáng`,
      `${d} chiều`,
    ]);
    expected.forEach((name, i) => {
      if (text(1, 4 + i).toLowerCase() !== name.toLowerCase())
        throw new Error("Các cột lịch rảnh cần theo thứ tự trong file mẫu");
    });
  }
  const truthy = (v: string) =>
    ["1", "x", "có", "rảnh", "true", "yes"].includes(v.toLowerCase());
  const rows = [];
  for (let r = 2; r <= Math.min(s.rowCount, 1502); r++) {
    if (!text(r, 1) && !text(r, 2)) continue;
    const availability = [1, 2, 3, 4, 5, 6, 0].flatMap((d, i) =>
      ["am", "pm"]
        .filter((_, p) => truthy(text(r, 4 + i * 2 + p)))
        .map((p) => `${d}-${p}`),
    );
    rows.push({
      studentId: text(r, 1),
      name: text(r, 2),
      email: text(r, 3),
      availability,
      extraDuties: truthy(text(r, 18)),
    });
  }
  return rows;
}
export async function readImport(file: File, kind: "members" | "availability") {
  return parseTemplate(await loadImportSheet(file), kind);
}
export async function readAvailabilityUpload(file: File) {
  const s = await loadImportSheet(file);
  const text = (row: number, col: number) => s.getCell(row, col).text.trim();
  const header = (col: number) =>
    text(1, col).normalize("NFC").toLowerCase().replace(/\s+/g, " ");
  if (
    ["họ và tên", "họ tên"].includes(header(1)) &&
    header(2) === "thứ" &&
    header(3) === "buổi" &&
    header(4) === "tuần học"
  ) {
    if (s.rowCount > 5001)
      throw new Error("File chi tiết cần có tối đa 5.000 dòng lịch rảnh");
    const rows: AvailabilityDetail[] = [];
    for (let r = 2; r <= s.rowCount; r++) {
      if (![1, 2, 3, 4, 5].some((c) => text(r, c))) continue;
      const name = text(r, 1),
        day = text(r, 2),
        period = text(r, 3),
        weeks = text(r, 4),
        note = text(r, 5);
      if (!name || !day || !period || !weeks)
        throw new Error(`Dòng ${r} thiếu họ tên, thứ, buổi hoặc tuần học`);
      if (
        name.length > 100 ||
        day.length > 30 ||
        period.length > 100 ||
        weeks.length > 200 ||
        note.length > 1000
      )
        throw new Error(`Nội dung dòng ${r} quá dài, kiểm tra lại các cột`);
      rows.push({ sourceRow: r, name, day, period, weeks, note });
    }
    if (!rows.length) throw new Error("File không có dòng lịch rảnh nào");
    return { format: "details" as const, filename: file.name, rows };
  }
  return {
    format: "template" as const,
    filename: file.name,
    rows: parseTemplate(s, "availability"),
  };
}
