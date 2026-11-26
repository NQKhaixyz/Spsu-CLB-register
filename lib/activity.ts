import { addDays, isMemberOnDate, rulesFor, today, uid, weekId, type Club, type Member } from "./club";
import { committeeLabels, isCommitteeKind, type CommitteeKind } from "./committees";

export const activityLabels = {
  lecture: "Hoạt động giảng đường",
  c2: "Hoạt động C2",
  ddv: "Đồng đẳng viên",
  project: "Hoạt động dự án",
  initiative: "Sáng kiến",
  special: "Điểm riêng",
  event: "Sự kiện",
  deduction: "Điểm trừ",
  committee: "Điểm theo ban",
} as const;
export type ActivityKind = keyof typeof activityLabels;
export const activityKinds = Object.keys(activityLabels) as ActivityKind[];
// Keep legacy kinds readable in stored records. Only these columns count in reports.
export const visibleActivityKinds = ["initiative", "ddv", "event", "committee", "special", "deduction"] as const;
export const ratedActivityKinds = ["initiative", "ddv"] as const;
export const manualKinds = ["initiative", "ddv", "special", "committee"] as const;
export type ManualActivityKind = (typeof manualKinds)[number];
export const isManualActivityKind = (kind: unknown): kind is ManualActivityKind =>
  manualKinds.some(activeKind => activeKind === kind);
// Historical awards can still reference a retired committee and its rate.
type StoredCommitteeKind = CommitteeKind | "dh" | "hc";
export type CommitteeRates = Partial<Record<StoredCommitteeKind, number>>;
export type ActivityRates = Partial<Record<ActivityKind, number>>;
export const eventDescriptionLimit = 1000;
export type ClubEvent = {
  id: string;
  name: string;
  description?: string;
  requiresEvidence?: boolean;
  points: number;
  startDate: string;
  endDate: string;
  createdAt: string;
  createdBy: string;
  cancelledAt?: string;
};
export type PointDeduction = {
  id: string;
  memberId: string;
  week: string;
  date: string;
  points: number;
  reason: string;
  createdAt: string;
  createdBy: string;
  cancelledAt?: string;
  cancelledBy?: string;
  cancelReason?: string;
};
export type ActivityRegistration = {
  id: string;
  memberId: string;
  week: string;
  date: string;
  kind: "event" | "lecture" | "c2";
  eventId?: string;
  quantity: number;
  note: string;
  status: "pending" | "confirmed" | "declined" | "withdrawn";
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  decision?: string;
  evidence?: { id: string; submittedAt: number };
};
export type ManualActivity = {
  id: string;
  memberId: string;
  week: string;
  date: string;
  kind: ManualActivityKind | "project";
  quantity: number;
  points?: number;
  committee?: StoredCommitteeKind;
  note: string;
  updatedAt: string;
  updatedBy: string;
};
export const activityStatusLabels = {
  pending: "Chờ duyệt",
  confirmed: "Đã duyệt tham gia",
  declined: "Không được duyệt",
  withdrawn: "Đã rút đăng ký",
};
export const activityRate = (club: Club, kind: ActivityKind, date: string) =>
  rulesFor(club, date.slice(0, 7)).activities?.[kind] ?? 0;
const committeeRate = (club: Club, committee: StoredCommitteeKind, date: string) =>
  rulesFor(club, date.slice(0, 7)).committees?.[committee] ?? 0;
export const eventForActivity = (club: Club, row: { kind: ActivityKind; eventId?: string }) =>
  row.kind === "event" ? club.events?.find(event => event.id === row.eventId) : undefined;
export const isEventOpen = (event: ClubEvent, date: string) => !event.cancelledAt && event.endDate >= date;
export const eventEvidenceExpiry = (event: ClubEvent) =>
  Date.parse(addDays(event.endDate, 3) + "T00:00:00+07:00");

type EventHistory = {
  events?: ClubEvent[];
  activityRegistrations?: ActivityRegistration[];
  registrations?: ActivityRegistration[];
};

export function eraseEventFromHistory(history: EventHistory, eventId: string) {
  const photoIds: string[] = [];
  if (history.events) history.events = history.events.filter(event => event.id !== eventId);
  for (const field of ["activityRegistrations", "registrations"] as const) {
    if (!history[field]) continue;
    history[field] = history[field].filter(row => {
      if (row.kind !== "event" || row.eventId !== eventId) return true;
      if (row.evidence) photoIds.push(row.evidence.id);
      return false;
    });
  }
  return photoIds;
}

type ActivityPointRow = { kind: ActivityKind; date: string; eventId?: string; points?: number; committee?: StoredCommitteeKind };

export function activityUnitPoints(club: Club, row: ActivityPointRow) {
  if (row.kind === "committee") {
    // Older records store only the selected ban and use its historical rate.
    return row.points ?? (row.committee ? committeeRate(club, row.committee, row.date) : 0);
  }
  if (row.kind === "special" && row.points !== undefined) return row.points;
  if (row.kind === "deduction") return -1;
  if (row.kind === "event") {
    const event = eventForActivity(club, row);
    return event && !event.cancelledAt ? event.points : 0;
  }
  return activityRate(club, row.kind, row.date);
}

export function activityPointsFor(club: Club, row: ActivityPointRow & { quantity: number }) {
  if ((row.kind === "committee" || row.kind === "special") && row.points !== undefined) return row.points;
  return row.quantity * activityUnitPoints(club, row);
}

export function activityName(club: Club, row: { kind: ActivityKind; eventId?: string; committee?: StoredCommitteeKind }) {
  if (row.kind === "committee") {
    if (isCommitteeKind(row.committee)) return committeeLabels[row.committee];
    if (row.committee === "dh") return "Ban điều hành";
  }
  if (row.kind === "event") return eventForActivity(club, row)?.name ?? "Sự kiện";
  return activityLabels[row.kind];
}
export function creditedActivities(club: Club) {
  const eventIds = new Set((club.events ?? []).filter(event => !event.cancelledAt).map(event => event.id));
  return [
    ...(club.activityRegistrations ?? []).filter(r => r.kind === "event" && r.status === "confirmed" && eventIds.has(r.eventId ?? "")),
    ...(club.manualActivities ?? []).filter(r => isManualActivityKind(r.kind) && r.quantity > 0),
    ...(club.pointDeductions ?? []).filter(r => !r.cancelledAt).map(r => ({ ...r, kind: "deduction" as const, quantity: r.points })),
  ];
}
export function activityScoreFor(club: Club, memberId: string, period: string, weekly = false, weekFilter?: string) {
  const counts = Object.fromEntries(activityKinds.map((kind) => [kind, 0])) as Record<ActivityKind, number>;
  const points = { ...counts };
  for (const row of creditedActivities(club)) {
    if ((weekFilter && row.week !== weekFilter) || row.memberId !== memberId || (weekly ? row.week !== period : row.date.slice(0, 7) !== period)) continue;
    const value = activityPointsFor(club, row);
    counts[row.kind] = Number((counts[row.kind] + (["special", "committee"].includes(row.kind) ? value : row.quantity)).toFixed(10));
    points[row.kind] = Number((points[row.kind] + value).toFixed(10));
  }
  return { activityCounts: counts, activityPoints: points, activityTotal: Number(Object.values(points).reduce((sum, n) => sum + n, 0).toFixed(10)) };
}
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(date)) && new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date;
function quantity(value: unknown, min: number) {
  requireValue(typeof value === "number" && Number.isSafeInteger(value) && value >= min && value <= 10000,
    `Số lượt phải là số nguyên từ ${min} đến 10.000.`);
  return value;
}
function pointAmount(value: unknown, message: string) {
  requireValue(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100000 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, message);
  return value;
}
function datedWeek(club: Club, member: Member, data: Record<string, unknown>) {
  const week = text(data.week, 10), date = text(data.date, 10);
  requireValue(club.weeks.some((w) => w.id === week) && week <= weekId(), "Tuần hoạt động không hợp lệ.");
  requireValue(validDate(date) && date >= week && date <= addDays(week, 6), "Ngày hoạt động phải nằm trong tuần đang chọn.");
  requireValue(isMemberOnDate(member, date), "Thành viên chưa hoạt động tại ngày này.");
  return { week, date };
}

export function reviewEventRegistration(
  club: Club, me: Member, data: Record<string, unknown>, log: (message: string) => void,
  checkedPhoto?: string,
) {
  requireValue(me.active && me.role === "admin", "Chỉ BĐH được duyệt đăng ký sự kiện.");
  const row = club.activityRegistrations?.find(r => r.id === data.id);
  requireValue(row, "Không tìm thấy đăng ký.");
  requireValue(row.kind === "event", "Mục hoạt động này đã ngừng dùng. Hãy ghi điểm qua Tạo sự kiện.");
  const event = eventForActivity(club, row);
  requireValue(event, "Không tìm thấy sự kiện của đăng ký.");
  requireValue(!event.cancelledAt, "Sự kiện đã hủy.");
  requireValue(typeof data.confirmed === "boolean", "Kết quả xác nhận không hợp lệ.");
  requireValue(row.status !== "withdrawn", "Thành viên đã rút đăng ký này.");
  const next = data.confirmed ? "confirmed" : "declined";
  if (row.status === next) return;
  const now = Date.now();
  if (event.requiresEvidence && (row.status === "pending" || next === "confirmed")) {
    requireValue(now < eventEvidenceExpiry(event), "Đã hết hạn duyệt minh chứng.");
    requireValue(checkedPhoto && row.evidence?.id === checkedPhoto,
      "Mở và duyệt ảnh minh chứng trước khi xác nhận đăng ký này.");
  }
  const reason = text(data.reason);
  requireValue(row.status === "pending" || reason.length >= 3, "Ghi lý do khi sửa kết quả đã xác nhận.");
  row.status = next;
  row.reviewedAt = new Date(now).toISOString();
  row.reviewedBy = me.id;
  row.decision = reason;
  log(`${data.confirmed ? "Xác nhận tham gia" : "Không xác nhận"} ${event.name}: ${club.members.find(m => m.id === row.memberId)?.name ?? "Thành viên"}, ${row.quantity} lượt ngày ${row.date}${reason ? "; " + reason : ""}`);
}

export function applyActivityAction(club: Club, me: Member, action: string, data: Record<string, unknown>, log: (message: string) => void) {
  if (!["createEvent", "editEvent", "cancelEvent", "restoreEvent", "registerEvent", "registerActivity", "withdrawActivity", "reviewActivity", "saveManualActivity", "deductPoints", "cancelPointDeduction"].includes(action)) return false;
  requireValue(me.active, "Tài khoản đã ngừng hoạt động.");
  if (action === "createEvent" || action === "editEvent") {
    requireValue(me.role === "admin", "Chỉ BĐH được quản lý sự kiện.");
    const id = text(data.id, 80), name = text(data.name, 160);
    const startDate = text(data.startDate, 10), endDate = text(data.endDate, 10);
    requireValue(/^[a-zA-Z0-9_-]{8,80}$/.test(id), "Mã sự kiện không hợp lệ. Tải lại trang và thử lại.");
    requireValue(name.length >= 2, "Nhập tên sự kiện từ 2 ký tự.");
    requireValue(validDate(startDate) && validDate(endDate) && startDate <= endDate, "Ngày bắt đầu và kết thúc không hợp lệ.");
    const points = pointAmount(data.points,
      "Điểm sự kiện phải từ 0 đến 100.000, tối đa 2 chữ số thập phân.");
    const existing = club.events?.find(event => event.id === id);
    if (action === "editEvent") requireValue(existing, "Không tìm thấy sự kiện.");
    requireValue(data.requiresEvidence === undefined || typeof data.requiresEvidence === "boolean", "Chọn yêu cầu minh chứng hợp lệ.");
    const requiresEvidence = data.requiresEvidence ?? (action === "editEvent" && !!existing?.requiresEvidence);
    const description = action === "editEvent" && data.description === undefined
      ? existing?.description ?? ""
      : text(data.description, eventDescriptionLimit);
    if (existing) {
      requireValue(!existing.cancelledAt, "Sự kiện đã hủy.");
      const same = existing.name === name && (existing.description ?? "") === description &&
        existing.startDate === startDate && existing.endDate === endDate && existing.points === points &&
        !!existing.requiresEvidence === requiresEvidence;
      if (same) return true;
      requireValue(action === "editEvent",
        "Sự kiện đã được lưu với nội dung khác. Tải lại trang.");
      if (existing.endDate !== endDate) {
        const week = weekId(endDate);
        const evidenceExpired = Date.now() >= Math.min(eventEvidenceExpiry(existing), eventEvidenceExpiry({ ...existing, endDate }));
        for (const row of club.activityRegistrations ?? []) {
          if (row.kind !== "event" || row.eventId !== id) continue;
          row.date = endDate;
          row.week = week;
          // Extending dates cannot bring back a photo whose retention already ended.
          if (evidenceExpired) delete row.evidence;
        }
      }
      Object.assign(existing, { name, description, startDate, endDate, points, requiresEvidence });
      log(`Sửa sự kiện ${name}: ${startDate} – ${endDate}, ${points} điểm/người được duyệt`);
      return true;
    }
    requireValue(endDate >= today(), "Ngày kết thúc sự kiện không được trước hôm nay.");
    (club.events ??= []).push({ id, name, description, startDate, endDate, points, requiresEvidence, createdAt: new Date().toISOString(), createdBy: me.id });
    log(`Tạo sự kiện ${name}: ${startDate} – ${endDate}, ${points} điểm/người được duyệt`);
    return true;
  }
  if (action === "registerActivity") {
    throw new Error("Vui lòng đăng ký vào sự kiện do BĐH tạo.");
  }
  if (action === "registerEvent") {
    requireValue(!me.needsStudentId, "Bổ sung MSSV trước khi đăng ký hoạt động.");
    const event = club.events?.find(event => event.id === data.eventId);
    requireValue(event, "Không tìm thấy sự kiện.");
    requireValue(!event.cancelledAt, "Sự kiện đã hủy.");
    const rows = club.activityRegistrations ??= [];
    const existing = rows.find(row => row.eventId === event.id && row.memberId === me.id);
    if (existing && existing.status !== "withdrawn") return true;
    requireValue(today() <= event.endDate, "Sự kiện đã kết thúc đăng ký.");
    requireValue(isMemberOnDate(me, today()) && isMemberOnDate(me, event.endDate), "Thành viên chưa hoạt động trong thời gian sự kiện.");
    if (existing) {
      existing.status = "pending";
      existing.submittedAt = new Date().toISOString();
      delete existing.reviewedAt;
      delete existing.reviewedBy;
      delete existing.decision;
      delete existing.evidence;
    } else {
      rows.push({ id: uid(), eventId: event.id, memberId: me.id, week: weekId(event.endDate), date: event.endDate,
        kind: "event", quantity: 1, note: "", status: "pending", submittedAt: new Date().toISOString() });
    }
    log(`Đăng ký sự kiện ${event.name}`);
    return true;
  }
  if (action === "withdrawActivity") {
    const row = club.activityRegistrations?.find((r) => r.id === data.id && r.memberId === me.id);
    requireValue(row?.status === "pending", "Chỉ rút đăng ký của bạn khi đang chờ xác nhận.");
    requireValue(!eventForActivity(club, row)?.cancelledAt, "Sự kiện đã hủy.");
    row.status = "withdrawn";
    delete row.evidence;
    log(`Rút đăng ký ${activityName(club, row)} ngày ${row.date}`);
    return true;
  }
  requireValue(me.role === "admin", "Chỉ BĐH được xác nhận hoặc nhập điểm hoạt động.");
  if (action === "cancelEvent") {
    const event = club.events?.find(event => event.id === data.id);
    requireValue(event, "Không tìm thấy sự kiện.");
    if (event.cancelledAt) return true;
    event.cancelledAt = new Date().toISOString();
    log(`Hủy sự kiện ${event.name}`);
    return true;
  }
  if (action === "restoreEvent") {
    const event = club.events?.find(event => event.id === data.id);
    requireValue(event, "Không tìm thấy sự kiện.");
    if (!event.cancelledAt) return true;
    requireValue(event.cancelledAt === data.cancelledAt, "Sự kiện vừa thay đổi. Tải lại và kiểm tra trước khi khôi phục.");
    delete event.cancelledAt;
    log(`Khôi phục sự kiện ${event.name}`);
    return true;
  }
  if (action === "deductPoints") {
    const member = club.members.find(m => m.id === data.memberId);
    requireValue(member, "Không tìm thấy thành viên.");
    const { week, date } = datedWeek(club, member, data);
    const id = text(data.id, 80), reason = text(data.reason);
    requireValue(/^[a-zA-Z0-9_-]{8,80}$/.test(id), "Mã khoản trừ không hợp lệ. Tải lại trang và thử lại.");
    requireValue(typeof data.points === "number" && Number.isFinite(data.points) && data.points > 0 && data.points <= 100000 && Math.abs(data.points * 100 - Math.round(data.points * 100)) < 0.000001,
      "Số điểm trừ phải lớn hơn 0, tối đa 100.000 và tối đa 2 chữ số thập phân.");
    requireValue(reason.length >= 3, "Nhập lý do trừ điểm từ 3 ký tự.");
    const existing = club.pointDeductions?.find(r => r.id === id);
    if (existing) {
      requireValue(existing.memberId === member.id && existing.week === week && existing.date === date && existing.points === data.points && existing.reason === reason,
        "Khoản trừ đã được lưu với nội dung khác. Tải lại trang.");
      return true;
    }
    (club.pointDeductions ??= []).push({ id, memberId: member.id, week, date, points: data.points, reason, createdAt: new Date().toISOString(), createdBy: me.id });
    log(`Trừ ${data.points} điểm: ${member.name}, ngày ${date}. Lý do: ${reason}`);
    return true;
  }
  if (action === "cancelPointDeduction") {
    const row = club.pointDeductions?.find(r => r.id === data.id);
    requireValue(row, "Không tìm thấy khoản trừ điểm.");
    if (row.cancelledAt) return true;
    const reason = text(data.reason);
    requireValue(reason.length >= 3, "Nhập lý do hủy khoản trừ từ 3 ký tự.");
    row.cancelledAt = new Date().toISOString();
    row.cancelledBy = me.id;
    row.cancelReason = reason;
    log(`Hủy khoản trừ ${row.points} điểm: ${club.members.find(m => m.id === row.memberId)?.name ?? "Thành viên"}, ngày ${row.date}. Lý do hủy: ${reason}`);
    return true;
  }
  if (action === "reviewActivity") {
    reviewEventRegistration(club, me, data, log);
    return true;
  }
  const member = club.members.find((m) => m.id === data.memberId);
  requireValue(member, "Không tìm thấy thành viên.");
  const { week, date } = datedWeek(club, member, data);
  requireValue(isManualActivityKind(data.kind), "Chọn mục điểm hợp lệ. Các hoạt động khác được ghi qua Tạo sự kiện.");
  const kind = data.kind;
  let count: number, points: number | undefined, committee: CommitteeKind | undefined;
  if (kind === "special") {
    points = pointAmount(data.points,
      "Điểm riêng phải từ 0 đến 100.000, tối đa 2 chữ số thập phân. Nhập số điểm trực tiếp.");
    count = points > 0 ? 1 : 0;
  } else if (kind === "committee") {
    requireValue(data.committee === "" || isCommitteeKind(data.committee), "Chọn một trong các ban đang hoạt động.");
    committee = data.committee || undefined;
    points = committee ? pointAmount(data.points, "Điểm theo ban phải từ 0 đến 100.000, tối đa 2 chữ số thập phân.") : 0;
    count = committee ? 1 : 0;
  } else {
    count = quantity(data.quantity, 0);
  }
  const rows = club.manualActivities ??= [];
  const old = rows.find((r) => r.memberId === member.id && r.week === week && r.kind === kind);
  const row: ManualActivity = { id: old?.id ?? uid(), memberId: member.id, week, date, kind, quantity: count, points, committee, note: text(data.note), updatedAt: new Date().toISOString(), updatedBy: me.id };
  if (old) Object.assign(old, row); else rows.push(row);
  const value = kind === "special" ? `${points} điểm` : kind === "committee" ? (committee ? `${committeeLabels[committee]} · ${points} điểm` : "Bỏ điểm theo ban") : `${count} lượt`;
  log(`Nhập ${activityLabels[kind]}: ${member.name}, ${value}, ngày ${date} (tuần ${week})`);
  return true;
}
