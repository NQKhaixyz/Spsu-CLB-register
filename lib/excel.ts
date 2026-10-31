import {
  addDays,
  dateLabel,
  dutyNames,
  monthLabel,
  reportMembers,
  rulesFor,
  scoreFor,
  statusNames,
  type Club,
} from "./club";

export async function makeReport(club: Club, month: string) {
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  book.creator = "Nhịp CLB";
  book.created = new Date();
  const weeks = club.weeks.filter(
    (w) => !w.cancelled && w.meetingDate.slice(0, 7) === month,
  );
  const schedules = club.schedules.filter(
    (s) => s.month === month && s.published,
  );
  const member = (id: string) => club.members.find((m) => m.id === id);
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
      col.width = Math.min(48, Math.max(16, columns[i]?.length + 5 || 16));
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
  const participants = reportMembers(club, month);
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
      "Qua quy chế",
      "Tổng điểm",
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
      "Qua quy chế",
      "Đã chốt",
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
          a.result === "completed"
            ? rulesFor(club, month).A
            : a.result === "unexcused"
              ? -rulesFor(club, month).B
              : 0,
        ]),
      ),
    ),
  );
  const rule = rulesFor(club, month);
  addSheet(
    "Quy tắc điểm",
    ["Mục", "Giá trị", "Diễn giải"],
    [
      ["A", rule.A, "Cộng cho mỗi ca đã trực và được xác minh"],
      ["B", rule.B, "Trừ cho mỗi ca trực vắng không phép"],
      ["C", rule.C, "Trừ cho mỗi buổi họp vắng không phép đã chốt"],
      ["D", 0, "Dự phòng, chưa áp dụng"],
      [
        "Công thức",
        "A × trực đủ − B × vắng trực − C × vắng họp",
        "Quy chế không cộng/trừ điểm",
      ],
      [
        "Lịch trực",
        "2 ca/người/tháng là mức ưu tiên",
        "Cho phép hơn 2 ca, ưu tiên người muốn trực thêm",
      ],
      [
        "Ngày bắt đầu áp dụng hệ số",
        rule.month,
        "Theo ngày họp/ngày trực thực tế",
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
export async function readImport(file: File, kind: "members" | "availability") {
  if (file.size > 3_000_000) throw new Error("File cần nhỏ hơn 3 MB.");
  const { default: ExcelJS } = await import("exceljs");
  const b = new ExcelJS.Workbook();
  await b.xlsx.load(await file.arrayBuffer());
  const s = b.worksheets[0];
  if (!s) throw new Error("File không có trang dữ liệu.");
  const text = (row: number, col: number) => s.getCell(row, col).text.trim();
  if (
    text(1, 1).toUpperCase() !== "MSSV" ||
    text(1, 2).toLowerCase() !== "họ tên"
  )
    throw new Error("Dùng file mẫu với hai cột đầu là MSSV, Họ tên.");
  if (kind === "availability") {
    const expected = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"].flatMap((d) => [
      `${d} sáng`,
      `${d} chiều`,
    ]);
    expected.forEach((name, i) => {
      if (text(1, 4 + i).toLowerCase() !== name.toLowerCase())
        throw new Error("Các cột lịch rảnh cần theo thứ tự trong file mẫu.");
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
