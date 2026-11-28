import { addDays, dateLabel, isMemberOnDate, rulesFor, today, uid, weekId, type Club, type Member } from "./club";
import { committeeLabels, isCommitteeKind, type CommitteeKind } from "./committees";
import { sharingSourceKey } from "./sharing-types";

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
export const eventLocationLimit = 200;
export const defaultEventPoints = 0.25;
export const eventQuantityPoints = (points: number, count: number) => Math.round(points * 100) * count / 100;
export const eventRoundQuantityLimit = 10000;
export const isEventRoundQuantity = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= eventRoundQuantityLimit;
export const eventScoringLabels = {
  single: "Tính theo 1 lượt",
  perRound: "Tính theo số lượt",
  contribution: "Tính theo đóng góp",
} as const;
export type EventScoringMode = keyof typeof eventScoringLabels;
const isEventScoringMode = (value: unknown): value is EventScoringMode =>
  typeof value === "string" && Object.hasOwn(eventScoringLabels, value);
export type ClubEvent = {
  id: string;
  name: string;
  description?: string;
  descriptionFormat?: "emphasis";
  location?: string;
  requiresEvidence?: boolean;
  scoringMode?: EventScoringMode;
  participationMultiplier?: number;
  points: number;
  startDate: string;
  startTime?: string;
  endDate: string;
  endTime?: string;
  createdAt: string;
  createdBy: string;
  cancelledAt?: string;
};
export type PointDeduction = {
  id: string;
  memberId: string;
  week: string;
  date: string;
  time?: string;
  individual?: true;
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
  confirmedDirectly?: true;
  supersededBy?: string;
  contributionPoints?: number;
  evidence?: {
    id: string;
    submittedAt: number;
    linkUrl?: string;
    review?: { status: "attached" | "rejected"; at?: string; note?: string };
  };
};
export type ManualActivity = {
  id: string;
  memberId: string;
  week: string;
  date: string;
  time?: string;
  individual?: true;
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
export const registrationStatusLabel = (row: ActivityRegistration) =>
  row.status === "confirmed" && row.quantity === 0 ? "Đã ghi nhận 0 lượt"
    : row.status === "confirmed" && row.confirmedDirectly ? "BĐH xác nhận trực tiếp" : activityStatusLabels[row.status];
export const activityRate = (club: Club, kind: ActivityKind, date: string) =>
  rulesFor(club, date.slice(0, 7)).activities?.[kind] ?? 0;
const committeeRate = (club: Club, committee: StoredCommitteeKind, date: string) =>
  rulesFor(club, date.slice(0, 7)).committees?.[committee] ?? 0;
export const eventForActivity = (club: Club, row: { kind: ActivityKind; eventId?: string }) =>
  row.kind === "event" ? club.events?.find(event => event.id === row.eventId) : undefined;
export const isEventOpen = (event: ClubEvent, date: string) => !event.cancelledAt && event.endDate >= date;
export function eventScheduleLabel({ startDate, startTime, endDate, endTime }: ClubEvent) {
  const date = dateLabel(startDate, true);
  if (startDate !== endDate) {
    const from = startTime ? `${date} ${startTime}` : date;
    const until = dateLabel(endDate, true) + (endTime ? ` ${endTime}` : "");
    return `${from} – ${until}`;
  }
  if (startTime && endTime) return `${date} · ${startTime} – ${endTime}`;
  if (startTime) return `${date} · Bắt đầu ${startTime}`;
  if (endTime) return `${date} · Kết thúc ${endTime}`;
  return date;
}
export const canAttendEvent = (member: Member, event: ClubEvent) =>
  (member.active || !!member.left) && isMemberOnDate(member, event.endDate);
export const allowsMultipleEventRounds = (event?: Pick<ClubEvent, "scoringMode" | "participationMultiplier">) =>
  !!event && event.scoringMode === undefined && event.participationMultiplier !== undefined;
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
      if (row.evidence && !row.evidence.linkUrl) photoIds.push(row.evidence.id);
      return false;
    });
  }
  return photoIds;
}

type ActivityPointRow = {
  kind: ActivityKind; date: string; id?: string; memberId?: string; eventId?: string; points?: number;
  committee?: StoredCommitteeKind; contributionPoints?: number;
};

function eventRoundCents(event: Pick<ClubEvent, "points" | "participationMultiplier">, round: number) {
  if (event.points === 0) return 0;
  const cents = Math.round(event.points * 100) * (event.participationMultiplier ?? 1) ** (round - 1);
  return Math.round(cents + cents * Number.EPSILON);
}

export function eventRounds(club: Club, eventId: string, memberId: string) {
  return memberEventRegistrations(club, eventId, memberId).filter(row => !row.supersededBy && row.status === "confirmed");
}

export function memberEventRegistrations(club: Club, eventId: string, memberId: string) {
  return (club.activityRegistrations ?? []).filter(row =>
    row.kind === "event" && row.eventId === eventId && row.memberId === memberId);
}

export function recordedEventQuantity(rows: readonly ActivityRegistration[]) {
  return rows.reduce((total, row) => total + (!row.supersededBy && row.status === "confirmed" ? row.quantity : 0), 0);
}

export function eventRoundRegistration(rows: readonly ActivityRegistration[]) {
  const active = rows.filter(row => !row.supersededBy);
  return active.find(row => row.status === "confirmed")
    ?? active.find(row => row.status === "pending" && row.evidence)
    ?? active.find(row => row.status === "pending")
    ?? active.find(row => row.status === "declined")
    ?? active[0];
}

function checkEventPointsFit(event: Pick<ClubEvent, "points" | "participationMultiplier">, count: number) {
  if (event.participationMultiplier === undefined) return;
  let cents = 0;
  for (let round = 1; round <= count; round++) {
    cents += eventRoundCents(event, round);
    requireValue(Number.isSafeInteger(cents), "Điểm của sự kiện vượt giới hạn tính toán. Hãy giảm điểm hoặc hệ số nhân.");
  }
}

export function activityUnitPoints(club: Club, row: ActivityPointRow) {
  if (row.memberId && club.members.some(member => member.id === row.memberId && member.role === "admin")) return 0;
  if (row.kind === "committee") {
    // Older records store only the selected ban and use its historical rate.
    return row.points ?? (row.committee ? committeeRate(club, row.committee, row.date) : 0);
  }
  if (row.kind === "special" && row.points !== undefined) return row.points;
  if (row.kind === "deduction") return -1;
  if (row.kind === "event") {
    const event = eventForActivity(club, row);
    if (!event || event.cancelledAt) return 0;
    if (event.scoringMode === "contribution") return row.contributionPoints ?? 0;
    if (event.scoringMode || event.participationMultiplier === undefined || !row.memberId || !row.id) return event.points;
    const round = eventRounds(club, event.id, row.memberId).findIndex(approved => approved.id === row.id) + 1;
    return round > 0 ? eventRoundCents(event, round) / 100 : event.points;
  }
  return activityRate(club, row.kind, row.date);
}

export function activityPointsFor(club: Club, row: ActivityPointRow & { quantity: number }) {
  const unit = activityUnitPoints(club, row);
  if ((row.kind === "committee" || row.kind === "special") && row.points !== undefined) return unit;
  return row.kind === "event" ? eventQuantityPoints(unit, row.quantity) : row.quantity * unit;
}

export function activityName(club: Club, row: { kind: ActivityKind; eventId?: string; committee?: StoredCommitteeKind }) {
  if (row.kind === "committee") {
    if (isCommitteeKind(row.committee)) return committeeLabels[row.committee];
    if (row.committee === "dh") return committeeLabels.cs;
  }
  if (row.kind === "event") return eventForActivity(club, row)?.name ?? "Sự kiện";
  return activityLabels[row.kind];
}
export function creditedActivities(club: Club) {
  const eventIds = new Set((club.events ?? []).filter(event => !event.cancelledAt).map(event => event.id));
  return [
    ...(club.activityRegistrations ?? []).filter(r => r.kind === "event" && !r.supersededBy && r.status === "confirmed" && eventIds.has(r.eventId ?? "")),
    ...(club.manualActivities ?? []).filter(r => isManualActivityKind(r.kind) && r.quantity > 0),
    ...(club.pointDeductions ?? []).filter(r => !r.cancelledAt).map(r => ({ ...r, kind: "deduction" as const, quantity: r.points })),
  ];
}
export function activityScoreFor(club: Club, memberId: string, period: string, weekly = false, weekFilter?: string) {
  const counts = Object.fromEntries(activityKinds.map((kind) => [kind, 0])) as Record<ActivityKind, number>;
  const points = { ...counts };
  const admin = club.members.some(member => member.id === memberId && member.role === "admin");
  const rows = admin ? [] : creditedActivities(club);
  for (const row of rows) {
    if ((weekFilter && row.week !== weekFilter) || row.memberId !== memberId || (weekly ? row.week !== period : row.date.slice(0, 7) !== period)) continue;
    const value = activityPointsFor(club, row);
    counts[row.kind] = Number((counts[row.kind] + (["special", "committee"].includes(row.kind) ? value : row.quantity)).toFixed(10));
    points[row.kind] = Number((points[row.kind] + value).toFixed(10));
  }
  if (!admin && !weekly && !weekFilter) {
    const used = (club.monthlyCreditUses ?? []).filter(use => use.memberId === memberId && use.month === period)
      .reduce((sum, use) => sum + use.units, 0) / 20;
    const earned = (club.monthlyCreditAwards?.find(award => award.memberId === memberId && award.month === period)?.pointCents ?? 0) / 100;
    counts.special = points.special = Number((points.special + earned).toFixed(10));
    counts.deduction = Number((counts.deduction + used).toFixed(10));
    points.deduction = Number((points.deduction - used).toFixed(10));
  }
  return { activityCounts: counts, activityPoints: points, activityTotal: Number(Object.values(points).reduce((sum, n) => sum + n, 0).toFixed(10)) };
}
function requireValue(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const text = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(date)) && new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date;
const optionalTime = (value: unknown): value is string =>
  typeof value === "string" && (value === "" || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value));
function manualPointTime(value: unknown, previous?: string) {
  requireValue(value === undefined || optionalTime(value), "Giờ thực tế không hợp lệ.");
  return value === undefined ? previous : value || undefined;
}
function quantity(value: unknown, min: number) {
  requireValue(isEventRoundQuantity(value) && value >= min,
    `Số lượt phải là số nguyên từ ${min} đến 10.000.`);
  return value;
}
export const isPointAmount = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100000 &&
  Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
function pointAmount(value: unknown, message: string) {
  requireValue(isPointAmount(value), message);
  return value;
}
export const eventContributionError = "Nhập điểm đóng góp từ 0 đến 100.000, tối đa 2 chữ số thập phân.";
function datedWeek(club: Club, member: Member, data: Record<string, unknown>) {
  const week = text(data.week, 10), date = text(data.date, 10);
  requireValue(club.weeks.some((w) => w.id === week) && week <= weekId(), "Tuần hoạt động không hợp lệ.");
  requireValue(validDate(date) && date >= week && date <= addDays(week, 6), "Ngày hoạt động phải nằm trong tuần đang chọn.");
  requireValue(isMemberOnDate(member, date), "Thành viên chưa hoạt động tại ngày này.");
  return { week, date };
}

function newEventRegistration(event: ClubEvent, memberId: string, submittedAt: string, id = uid()): ActivityRegistration {
  return { id, eventId: event.id, memberId, week: weekId(event.endDate), date: event.endDate,
    kind: "event", quantity: 1, note: "", status: "pending", submittedAt };
}

function eventRegistration(club: Club, event: ClubEvent, memberId: string, id: unknown) {
  const rows = club.activityRegistrations ?? [];
  if (allowsMultipleEventRounds(event)) {
    requireValue(typeof id === "string" && /^[a-zA-Z0-9_-]{8,80}$/.test(id), "Mã lượt tham gia không hợp lệ. Tải lại rồi thử lại.");
    const existing = rows.find(row => row.id === id);
    requireValue(!existing || (existing.kind === "event" && existing.eventId === event.id && existing.memberId === memberId), "Mã lượt tham gia đã được sử dụng.");
    return existing;
  }
  const memberRows = memberEventRegistrations(club, event.id, memberId).filter(row => !row.supersededBy);
  if (event.scoringMode === "perRound") return eventRoundRegistration(memberRows);
  return memberRows.find(row => row.status !== "withdrawn") ?? memberRows[0];
}

function saveEventRoundCount(
  club: Club, reviewer: Member, event: ClubEvent, member: Member, data: Record<string, unknown>,
  log: (message: string) => void, source: "review" | "direct" | "photo", photoRow?: ActivityRegistration,
) {
  const count = quantity(data.quantity, source === "direct" ? 1 : 0);
  const records = memberEventRegistrations(club, event.id, member.id);
  const existing = photoRow ?? eventRoundRegistration(records);
  const current = records.filter(row => !row.supersededBy && row.status !== "withdrawn");
  const previous = recordedEventQuantity(current);
  if (source !== "photo" && current.length === 1 && existing?.status === "confirmed" && existing.quantity === count) return;
  requireValue(data.previousQuantity === previous, "Số lượt đã thay đổi. Tải lại danh sách rồi thử lại.");
  requireValue(source !== "review" || !!existing && existing.status !== "withdrawn", "Không tìm thấy đăng ký đang xử lý.");
  requireValue(source !== "review" || !event.requiresEvidence || current.some(row => row.status === "confirmed"),
    "Mở và duyệt minh chứng trước khi nhập số lượt.");
  requireValue(source !== "direct" || canAttendEvent(member, event), "Thành viên không hoạt động vào ngày tính điểm của sự kiện.");
  const reason = text(data.reason);
  if (existing?.status === "declined" && source !== "photo" && count > 0) {
    requireValue(reason.length >= 3, "Ghi lý do khi sửa kết quả đã xác nhận.");
  }
  const at = new Date().toISOString();
  const row = existing ?? newEventRegistration(event, member.id, at);
  if (row.evidence) {
    if (source === "photo") delete row.evidence.review;
    else if (!row.evidence.review && row.status !== "confirmed") {
      row.evidence.review = row.status === "declined"
        ? { status: "rejected", at: row.reviewedAt, note: row.decision } : { status: "attached" };
    }
  }
  Object.assign(row, { date: event.endDate, week: weekId(event.endDate), quantity: count,
    status: "confirmed", reviewedAt: at, reviewedBy: reviewer.id, decision: reason });
  if (source === "direct") row.confirmedDirectly = true;
  else if (source === "photo") delete row.confirmedDirectly;
  if (!existing) (club.activityRegistrations ??= []).push(row);
  // Keep original evidence and decisions for the old per-visit registrations.
  for (const other of current) if (other !== row) other.supersededBy = row.id;
  log(`Ghi số lượt ${event.name} · ${member.name} · ${previous} thành ${count} lượt${reason ? " · " + reason : ""}`);
}

export function reviewEventRegistration(
  club: Club, me: Member, data: Record<string, unknown>, log: (message: string) => void,
  checkedEvidence?: string,
) {
  requireValue(me.active && me.role === "admin", "Chỉ BĐH được duyệt đăng ký sự kiện.");
  const row = club.activityRegistrations?.find(r => r.id === data.id);
  requireValue(row, "Không tìm thấy đăng ký.");
  requireValue(row.kind === "event", "Mục hoạt động này đã ngừng dùng. Hãy ghi điểm qua Tạo sự kiện.");
  const member = club.members.find(item => item.id === row.memberId && item.role === "member");
  requireValue(member, "Chỉ duyệt đăng ký sự kiện của tài khoản thành viên.");
  const event = eventForActivity(club, row);
  requireValue(event, "Không tìm thấy sự kiện của đăng ký.");
  requireValue(!event.cancelledAt, "Sự kiện đã hủy.");
  requireValue(typeof data.confirmed === "boolean", "Kết quả xác nhận không hợp lệ.");
  requireValue(!row.supersededBy && row.status !== "withdrawn", "Đăng ký này đã rút hoặc đã gộp vào kết quả.");
  requireValue(event.scoringMode !== "perRound" || checkedEvidence, "Nhập tổng số lượt ở kết quả của thành viên.");
  const next = data.confirmed ? "confirmed" : "declined";
  if (row.status === next) return;
  const now = Date.now();
  if (event.requiresEvidence && (row.status === "pending" || next === "confirmed")) {
    requireValue(now < eventEvidenceExpiry(event), "Đã hết hạn duyệt minh chứng.");
    requireValue(checkedEvidence && row.evidence?.id === checkedEvidence,
      "Mở và duyệt minh chứng trước khi xác nhận đăng ký này.");
  }
  if (event.scoringMode === "perRound" && data.confirmed) {
    saveEventRoundCount(club, me, event, member, data, log, "photo", row);
    return;
  }
  const reason = text(data.reason);
  requireValue(row.status === "pending" || reason.length >= 3, "Ghi lý do khi sửa kết quả đã xác nhận.");
  const contributionPoints = next === "confirmed" && event.scoringMode === "contribution"
    ? pointAmount(data.contributionPoints, eventContributionError) : undefined;
  if (next === "confirmed") checkEventPointsFit(event, eventRounds(club, event.id, row.memberId).length + 1);
  row.status = next;
  row.reviewedAt = new Date(now).toISOString();
  row.reviewedBy = me.id;
  row.decision = reason;
  if (contributionPoints === undefined) delete row.contributionPoints;
  else row.contributionPoints = contributionPoints;
  delete row.confirmedDirectly;
  if (checkedEvidence && row.evidence) delete row.evidence.review;
  log(`${data.confirmed ? "Xác nhận tham gia" : "Không xác nhận"} ${event.name}: ${club.members.find(m => m.id === row.memberId)?.name ?? "Thành viên"}, ${row.quantity} lượt ngày ${row.date}${reason ? "; " + reason : ""}`);
}

export function applyActivityAction(club: Club, me: Member, action: string, data: Record<string, unknown>, log: (message: string) => void) {
  if (!["createEvent", "editEvent", "cancelEvent", "restoreEvent", "registerEvent", "addEventParticipant", "saveEventContribution", "saveEventRounds", "registerActivity", "withdrawActivity", "reviewActivity", "saveManualActivity", "deductPoints", "cancelPointDeduction"].includes(action)) return false;
  requireValue(me.active, "Tài khoản đã ngừng hoạt động.");
  if (action === "createEvent" || action === "editEvent") {
    requireValue(me.role === "admin", "Chỉ BĐH được quản lý sự kiện.");
    const id = text(data.id, 80), name = text(data.name, 160);
    const startDate = text(data.startDate, 10), endDate = text(data.endDate, 10);
    requireValue(/^[a-zA-Z0-9_-]{8,80}$/.test(id), "Mã sự kiện không hợp lệ. Tải lại trang và thử lại.");
    requireValue(name.length >= 2, "Nhập tên sự kiện từ 2 ký tự.");
    requireValue(validDate(startDate) && validDate(endDate) && startDate <= endDate, "Ngày bắt đầu và kết thúc không hợp lệ.");
    const existing = club.events?.find(event => event.id === id);
    if (action === "editEvent") requireValue(existing, "Không tìm thấy sự kiện.");
    requireValue(data.scoringMode === undefined || isEventScoringMode(data.scoringMode), "Chọn cách tính điểm sự kiện hợp lệ.");
    const scoringMode = data.scoringMode ?? existing?.scoringMode;
    const previousPoints = existing?.scoringMode === scoringMode ? existing?.points : undefined;
    const requestedPoints = data.points === undefined ? previousPoints ?? (scoringMode ? defaultEventPoints : undefined) : data.points;
    const points = scoringMode === "contribution" ? 0
      : pointAmount(requestedPoints, "Điểm sự kiện phải từ 0 đến 100.000, tối đa 2 chữ số thập phân.");
    const startTime = data.startTime === undefined ? existing?.startTime ?? "" : data.startTime;
    const endTime = data.endTime === undefined ? existing?.endTime ?? "" : data.endTime;
    requireValue(optionalTime(startTime) && optionalTime(endTime), "Giờ sự kiện phải theo dạng HH:mm.");
    requireValue(startDate !== endDate || !startTime || !endTime || startTime <= endTime,
      "Cùng ngày, giờ kết thúc phải từ giờ bắt đầu trở đi.");
    const schedule = { startDate, endDate, startTime: startTime || undefined, endTime: endTime || undefined };
    requireValue(data.requiresEvidence === undefined || typeof data.requiresEvidence === "boolean", "Chọn yêu cầu minh chứng hợp lệ.");
    const requiresEvidence = data.requiresEvidence ?? (action === "editEvent" && !!existing?.requiresEvidence);
    const description = action === "editEvent" && data.description === undefined
      ? existing?.description ?? ""
      : text(data.description, eventDescriptionLimit);
    requireValue(data.descriptionFormat === undefined || data.descriptionFormat === "emphasis", "Định dạng mô tả không hợp lệ.");
    const descriptionFormat = data.descriptionFormat ?? existing?.descriptionFormat;
    const location = action === "editEvent" && data.location === undefined
      ? existing?.location ?? ""
      : text(data.location, eventLocationLimit);
    const participationMultiplier = scoringMode ? undefined
      : data.participationMultiplier === undefined ? existing?.participationMultiplier
      : data.participationMultiplier === null ? undefined
      : pointAmount(data.participationMultiplier, "Hệ số nhân phải là số từ 1 đến 100.000, tối đa 2 chữ số thập phân.");
    requireValue(participationMultiplier === undefined || participationMultiplier >= 1, "Hệ số nhân phải từ 1 trở lên.");
    const scoring = { scoringMode, points, participationMultiplier };
    const scoringLabel = scoringMode === "contribution" ? eventScoringLabels.contribution
      : scoringMode ? `${eventScoringLabels[scoringMode]} · ${points} điểm` : `${points} điểm/lượt đầu`;
    if (existing) {
      requireValue(!existing.cancelledAt, "Sự kiện đã hủy.");
      const same = existing.name === name && (existing.description ?? "") === description && existing.descriptionFormat === descriptionFormat &&
        (existing.location ?? "") === location &&
        existing.startDate === startDate && existing.endDate === endDate && existing.points === points &&
        (existing.startTime ?? "") === startTime && (existing.endTime ?? "") === endTime &&
        !!existing.requiresEvidence === requiresEvidence && existing.participationMultiplier === participationMultiplier &&
        existing.scoringMode === scoringMode;
      if (same) return true;
      requireValue(action === "editEvent",
        "Sự kiện đã được lưu với nội dung khác. Tải lại trang.");
      const counts = new Map<string, number>();
      const eventRows = (club.activityRegistrations ?? []).filter(row => row.kind === "event" && row.eventId === id);
      const multiple = scoringMode === "perRound" || allowsMultipleEventRounds(scoring);
      for (const row of eventRows) {
        if (row.supersededBy || row.status === "withdrawn" || (multiple && row.status !== "confirmed")) continue;
        const rounds = existing.scoringMode === "perRound" && row.status === "confirmed" ? Math.max(1, row.quantity) : 1;
        counts.set(row.memberId, (counts.get(row.memberId) ?? 0) + rounds);
      }
      for (const count of counts.values()) {
        requireValue(multiple || count <= 1, "Sự kiện đã có người đăng ký nhiều lượt. Chọn cách tính theo số lượt để giữ các đăng ký này.");
        checkEventPointsFit(scoring, count);
      }
      if (scoringMode !== existing.scoringMode) {
        const previousAwards = scoringMode === "contribution" ? eventRows.filter(row => !row.supersededBy && row.status === "confirmed").map(row => ({
          row, points: pointAmount(activityPointsFor(club, row), eventContributionError),
        })) : [];
        for (const row of eventRows) {
          delete row.contributionPoints;
          if (row.supersededBy || scoringMode === "perRound") continue;
          if (row.quantity === 0 && row.status === "confirmed" && scoringMode !== "contribution") row.status = "declined";
          row.quantity = 1;
        }
        for (const award of previousAwards) award.row.contributionPoints = award.points;
      }
      if (existing.endDate !== endDate) {
        const week = weekId(endDate);
        const evidenceExpired = Date.now() >= Math.min(eventEvidenceExpiry(existing), eventEvidenceExpiry({ ...existing, endDate }));
        for (const row of eventRows) {
          row.date = endDate;
          row.week = week;
          // Extending dates cannot bring back a photo whose retention already ended.
          if (evidenceExpired) delete row.evidence;
        }
      }
      Object.assign(existing, { name, description, descriptionFormat, location, ...schedule, ...scoring, requiresEvidence });
      log(`Sửa sự kiện ${name}: ${startDate} – ${endDate}, ${scoringLabel}`);
      return true;
    }
    requireValue(endDate >= today(), "Ngày kết thúc sự kiện không được trước hôm nay.");
    const createdAt = Date.now();
    (club.events ??= []).push({ id, name, description, descriptionFormat, location, ...schedule, ...scoring,
      requiresEvidence, createdAt: new Date(createdAt).toISOString(), createdBy: me.id });
    (club.eventAnnouncements ??= []).push({ id: crypto.randomUUID(), eventId: id, createdAt });
    log(`Tạo sự kiện ${name}: ${startDate} – ${endDate}, ${scoringLabel}`);
    return true;
  }
  if (action === "registerActivity") {
    throw new Error("Vui lòng đăng ký vào sự kiện do BĐH tạo.");
  }
  if (action === "registerEvent") {
    requireValue(me.role === "member", "Đăng ký sự kiện dành cho tài khoản thành viên.");
    requireValue(!me.needsStudentId, "Bổ sung MSSV trước khi đăng ký hoạt động.");
    const event = club.events?.find(event => event.id === data.eventId);
    requireValue(event, "Không tìm thấy sự kiện.");
    requireValue(!event.cancelledAt, "Sự kiện đã hủy.");
    const rows = club.activityRegistrations ??= [];
    const existing = eventRegistration(club, event, me.id, data.registrationId);
    const multiple = allowsMultipleEventRounds(event);
    if (existing && (multiple || existing.status !== "withdrawn")) return true;
    requireValue(today() <= event.endDate, "Sự kiện đã kết thúc đăng ký.");
    requireValue(isMemberOnDate(me, today()) && isMemberOnDate(me, event.endDate), "Thành viên chưa hoạt động trong thời gian sự kiện.");
    if (existing) {
      existing.status = "pending";
      existing.quantity = 1;
      existing.submittedAt = new Date().toISOString();
      delete existing.reviewedAt;
      delete existing.reviewedBy;
      delete existing.decision;
      delete existing.evidence;
      delete existing.contributionPoints;
    } else {
      rows.push(newEventRegistration(event, me.id, new Date().toISOString(),
        multiple ? data.registrationId as string : undefined));
    }
    log(`Đăng ký sự kiện ${event.name}`);
    return true;
  }
  if (action === "withdrawActivity") {
    requireValue(me.role === "member", "Đăng ký sự kiện dành cho tài khoản thành viên.");
    const row = club.activityRegistrations?.find((r) => r.id === data.id && r.memberId === me.id);
    requireValue(row?.status === "pending" && !row.supersededBy, "Chỉ rút đăng ký của bạn khi đang chờ xác nhận.");
    const event = eventForActivity(club, row);
    requireValue(!event?.cancelledAt, "Sự kiện đã hủy.");
    const targets = event?.scoringMode === "perRound"
      ? memberEventRegistrations(club, event.id, me.id).filter(item => !item.supersededBy && item.status === "pending") : [row];
    for (const pending of targets) {
      pending.status = "withdrawn";
      delete pending.evidence;
    }
    log(`Rút đăng ký ${activityName(club, row)} ngày ${row.date}`);
    return true;
  }
  requireValue(me.role === "admin", "Chỉ BĐH được xác nhận hoặc nhập điểm hoạt động.");
  if (action === "saveEventRounds") {
    const event = club.events?.find(item => item.id === data.eventId);
    requireValue(event?.scoringMode === "perRound" && !event.cancelledAt, "Chỉ nhập số lượt cho sự kiện đang tính theo số lượt.");
    const member = club.members.find(item => item.id === data.memberId);
    requireValue(member, "Không tìm thấy thành viên.");
    saveEventRoundCount(club, me, event, member, data, log, "review");
    return true;
  }
  if (action === "saveEventContribution") {
    const row = club.activityRegistrations?.find(item => item.id === data.id);
    const event = row && eventForActivity(club, row);
    requireValue(row?.status === "confirmed" && event?.scoringMode === "contribution" && !event.cancelledAt,
      "Chỉ chỉnh điểm đóng góp của thành viên đã được duyệt trong sự kiện đang áp dụng cách tính này.");
    const member = club.members.find(item => item.id === row.memberId && item.role !== "admin");
    requireValue(member, "Điểm chỉ áp dụng cho tài khoản thành viên.");
    const points = pointAmount(data.contributionPoints, eventContributionError);
    if (row.contributionPoints === points) return true;
    row.contributionPoints = points;
    log(`Chỉnh điểm đóng góp ${event.name}: ${member.name} · ${points} điểm`);
    return true;
  }
  if (action === "addEventParticipant") {
    const event = club.events?.find(item => item.id === data.eventId);
    requireValue(event, "Không tìm thấy sự kiện.");
    requireValue(!event.cancelledAt, "Sự kiện đã hủy.");
    const member = club.members.find(item => item.id === data.memberId);
    requireValue(member && member.role !== "admin", "Chỉ thêm tài khoản thành viên vào danh sách tính điểm sự kiện.");
    if (event.scoringMode === "perRound") {
      saveEventRoundCount(club, me, event, member, data, log, "direct");
      return true;
    }
    const existing = eventRegistration(club, event, member.id, data.registrationId);
    if (existing?.status === "confirmed") return true;
    requireValue(canAttendEvent(member, event), "Thành viên không hoạt động vào ngày tính điểm của sự kiện.");
    const reason = text(data.reason);
    if (existing?.status === "declined" || existing?.status === "withdrawn") {
      requireValue(data.previousStatus === existing.status && data.previousDecisionAt === (existing.reviewedAt ?? existing.submittedAt),
        "Đăng ký đã thay đổi. Tải lại danh sách trước khi xác nhận.");
      if (existing.status === "declined") requireValue(reason.length >= 3, "Ghi lý do khi sửa kết quả đã xác nhận.");
    }
    const at = new Date().toISOString();
    const contributionPoints = event.scoringMode === "contribution"
      ? pointAmount(data.contributionPoints, eventContributionError) : undefined;
    checkEventPointsFit(event, eventRounds(club, event.id, member.id).length + 1);
    const row = existing ?? newEventRegistration(event, member.id, at,
      allowsMultipleEventRounds(event) ? data.registrationId as string : undefined);
    // Confirm attendance without recording a photo approval the reviewer did not make.
    if (row.evidence && !row.evidence.review) {
      row.evidence.review = row.status === "declined"
        ? { status: "rejected", at: row.reviewedAt, note: row.decision }
        : { status: "attached" };
    }
    row.date = event.endDate;
    row.week = weekId(event.endDate);
    row.quantity = 1;
    row.status = "confirmed";
    row.confirmedDirectly = true;
    row.reviewedAt = at;
    row.reviewedBy = me.id;
    row.decision = reason;
    if (contributionPoints !== undefined) row.contributionPoints = contributionPoints;
    if (!existing) (club.activityRegistrations ??= []).push(row);
    log(`Xác nhận trực tiếp ${member.name} đã tham gia ${event.name}${reason ? " · " + reason : ""}`);
    return true;
  }
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
    requireValue(member.role !== "admin", "Điểm chỉ áp dụng cho tài khoản thành viên.");
    const { week, date } = datedWeek(club, member, data);
    const time = manualPointTime(data.time);
    const individual = data.individual === true ? true : undefined;
    const id = text(data.id, 80), reason = text(data.reason);
    requireValue(/^[a-zA-Z0-9_-]{8,80}$/.test(id), "Mã khoản trừ không hợp lệ. Tải lại trang và thử lại.");
    requireValue(typeof data.points === "number" && Number.isFinite(data.points) && data.points > 0 && data.points <= 100000 && Math.abs(data.points * 100 - Math.round(data.points * 100)) < 0.000001,
      "Số điểm trừ phải lớn hơn 0, tối đa 100.000 và tối đa 2 chữ số thập phân.");
    requireValue(reason.length >= 3, "Nhập lý do trừ điểm từ 3 ký tự.");
    const existing = club.pointDeductions?.find(r => r.id === id);
    if (existing) {
      requireValue(existing.memberId === member.id && existing.week === week && existing.date === date && existing.time === time &&
        existing.individual === individual && existing.points === data.points && existing.reason === reason,
        "Khoản trừ đã được lưu với nội dung khác. Tải lại trang.");
      return true;
    }
    (club.pointDeductions ??= []).push({ id, memberId: member.id, week, date, time, individual, points: data.points, reason,
      createdAt: new Date().toISOString(), createdBy: me.id });
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
  requireValue(member.role !== "admin", "Điểm chỉ áp dụng cho tài khoản thành viên.");
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
  const individual = data.individual === true ? true : undefined;
  const locked = new Set(club.sharing?.locked.map(entry => entry.sourceKey));
  const replay = typeof data.entryId === "string" ? rows.find(row => row.id === data.entryId) : undefined;
  const note = text(data.note);
  if (replay) {
    const time = manualPointTime(data.time, replay.time);
    requireValue(replay.memberId === member.id && replay.week === week && replay.date === date && replay.kind === kind &&
      replay.quantity === count && replay.points === points && replay.committee === committee && replay.time === time &&
      replay.individual === individual && replay.note === note, "Khoản điểm đã được lưu với nội dung khác. Tải lại trang.");
    return true;
  }
  const old = individual ? undefined : rows.find(r => r.memberId === member.id && r.week === week && r.kind === kind &&
    !r.individual && !locked.has(sharingSourceKey("manual", r.id)));
  requireValue(data.previousEntryId === undefined || data.previousEntryId === (old?.id ?? null),
    "Khoản điểm vừa thay đổi hoặc đã chốt. Tải lại trước khi nhập điểm.");
  const time = manualPointTime(data.time, old?.date === date ? old.time : undefined);
  const entryId = typeof data.entryId === "string" && /^[\w-]{8,80}$/.test(data.entryId) ? data.entryId : uid();
  const row: ManualActivity = { id: old?.id ?? entryId, memberId: member.id, week, date, time, individual, kind, quantity: count, points,
    committee, note, updatedAt: new Date().toISOString(), updatedBy: me.id };
  if (old) Object.assign(old, row); else rows.push(row);
  const value = kind === "special" ? `${points} điểm` : kind === "committee" ? (committee ? `${committeeLabels[committee]} · ${points} điểm` : "Bỏ điểm theo ban") : `${count} lượt`;
  log(`Nhập ${activityLabels[kind]}: ${member.name}, ${value}, ngày ${date} (tuần ${week})`);
  return true;
}
