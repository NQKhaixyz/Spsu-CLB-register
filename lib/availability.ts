import type {
  Club,
  Member,
  Shift,
  AvailabilityDetail,
  AvailabilitySettings,
} from "./club";

export const personKey = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
const plain = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase()
    .trim();
export function activeAvailabilityDatasetFor(club: Club) {
  const dataset = club.activeAvailabilityDataset ?? club.availabilityDataset;
  return dataset?.settings && dataset.memberLinks ? dataset : undefined;
}
export function academicWeekFor(date: string, settings: AvailabilitySettings) {
  return (
    settings.anchorWeek +
    Math.floor(
      (Date.parse(date + "T12:00:00Z") -
        Date.parse(settings.anchorDate + "T12:00:00Z")) /
        604800000,
    )
  );
}
export function clockMinutes(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw new Error("Giờ phải có dạng HH:MM.");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
const formatTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const dayNumber = (day: string) => {
  const text = plain(day).replace(/\s/g, "");
  if (["cn", "chunhat"].includes(text)) return 0;
  const value = text.match(/^(?:thu|t)?([2-7])$/)?.[1];
  if (!value) throw new Error(`Thứ không hợp lệ: ${day}`);
  return Number(value) - 1;
};
function weekNumbers(text: string): number[] {
  if (!text.trim()) return [];
  const result: number[] = [];
  for (const token of text.replace(/tuan/g, "").replace(/\s/g, "").split(",")) {
    const match = token.match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
    if (!match) throw new Error(`Tuần học không hợp lệ: ${text}`);
    const start = Number(match[1]),
      end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > 53)
      throw new Error(`Tuần học không hợp lệ: ${text}`);
    for (let n = start; n <= end; n++) result.push(n);
  }
  return result;
}
export function parseWeekSpec(spec: string) {
  const parts = plain(spec)
    .replace(/[–—]/g, "-")
    .split(/tru\s*(?:tuan)?/);
  if (parts.length > 2) throw new Error(`Tuần học không hợp lệ: ${spec}`);
  return {
    included: weekNumbers(parts[0]),
    excluded: weekNumbers(parts[1] ?? ""),
  };
}
export function weekMatches(spec: string, week: number, maxWeek = 53) {
  const { included, excluded } = parseWeekSpec(spec);
  return (
    week >= 1 &&
    week <= maxWeek &&
    (!included.length || included.includes(week)) &&
    !excluded.includes(week)
  );
}
export function periodInterval(
  period: string,
  settings: AvailabilitySettings,
): [number, number] {
  const value = plain(period).replace(/\s/g, "");
  if (value === "sang")
    return [clockMinutes(settings.amStart), clockMinutes(settings.amEnd)];
  if (value === "chieu")
    return [clockMinutes(settings.pmStart), clockMinutes(settings.pmEnd)];
  if (value === "cangay") return [0, 1440];
  const match = value
    .replace(/[–—]/g, "-")
    .match(/^(\d{1,2})(?:h|:)?(\d{2})?-(\d{1,2})(?:h|:)?(\d{2})?$/);
  if (!match) throw new Error(`Khung giờ chưa nhận diện được: ${period}`);
  let startHour = Number(match[1]),
    endHour = Number(match[3]);
  if (startHour < 7 && endHour <= 7) {
    startHour += 12;
    endHour += 12;
  }
  const startMin = Number(match[2] ?? 0),
    endMin = Number(match[4] ?? 0),
    start = startHour * 60 + startMin,
    end = endHour * 60 + endMin;
  if (
    startHour > 23 ||
    endHour > 23 ||
    startMin > 59 ||
    endMin > 59 ||
    end <= start
  )
    throw new Error(`Khung giờ không hợp lệ: ${period}`);
  return [start, end];
}
export function validateDetailRows(
  rows: AvailabilityDetail[],
  settings: AvailabilitySettings,
) {
  for (const row of rows) {
    dayNumber(row.day);
    parseWeekSpec(row.weeks);
    periodInterval(row.period, settings);
  }
}
export function createDutyAvailability(club: Club) {
  const dataset = activeAvailabilityDatasetFor(club),
    settings = dataset?.settings;
  const maxWeek =
    dataset && settings
      ? Math.max(
          1,
          ...dataset.rows.flatMap((r) => parseWeekSpec(r.weeks).included),
        )
      : 53;
  const rowsByMember = new Map<string, AvailabilityDetail[]>();
  if (dataset?.memberLinks)
    for (const row of dataset.rows) {
      const id = dataset.memberLinks[personKey(row.name)];
      if (id) rowsByMember.set(id, [...(rowsByMember.get(id) ?? []), row]);
    }
  const cache = new Map<
    string,
    { available: boolean; note: string; lateMinutes: number }
  >();
  return (
    member: Member,
    date: string,
    period: "am" | "pm",
    shift?: Pick<Shift, "startTime" | "endTime">,
  ): { available: boolean; note: string; lateMinutes: number } => {
    const cacheKey = `${member.id}:${date}:${period}:${shift?.startTime ?? ""}:${shift?.endTime ?? ""}`;
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const no = { available: false, note: "", lateMinutes: 0 };
    if (!member.active || member.joined > date) return no;
    if (!dataset || !settings || !dataset.memberLinks)
      return {
        available: member.availability.includes(
          `${new Date(date + "T12:00:00Z").getUTCDay()}-${period}`,
        ),
        note: "",
        lateMinutes: 0,
      };
    if (date < settings.startDate) return no;
    const allRows = rowsByMember.get(member.id) ?? [];
    if (!allRows.length) return no;
    const week = academicWeekFor(date, settings),
      weekday = new Date(date + "T12:00:00Z").getUTCDay();
    const matching = allRows.filter(
      (r) =>
        dayNumber(r.day) === weekday && weekMatches(r.weeks, week, maxWeek),
    );
    const intervals = matching
      .map((r) => periodInterval(r.period, settings))
      .sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const interval of intervals) {
      const last = merged.at(-1);
      if (last && interval[0] <= last[1])
        last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    const start = clockMinutes(
        shift?.startTime ??
          (period === "am" ? settings.amStart : settings.pmStart),
      ),
      end = clockMinutes(
        shift?.endTime ?? (period === "am" ? settings.amEnd : settings.pmEnd),
      );
    const window = merged.find(
      ([from, to]) => from <= start + settings.allowedLateMinutes && to >= end,
    );
    if (!window) {
      cache.set(cacheKey, no);
      return no;
    }
    const lateMinutes = Math.max(0, window[0] - start);
    const notes = [
      `Tuần học ${week}`,
      lateMinutes
        ? `Có ca học tan lúc ${formatTime(window[0])} · dự kiến đến muộn ${lateMinutes} phút`
        : "",
      ...(!settings.ignoreSourceNotes
        ? new Set(allRows.map((r) => r.note).filter(Boolean))
        : []),
    ].filter(Boolean);
    const result = { available: true, lateMinutes, note: notes.join(" · ") };
    cache.set(cacheKey, result);
    return result;
  };
}
export function availabilityForDuty(
  club: Club,
  member: Member,
  date: string,
  period: "am" | "pm",
  shift?: Pick<Shift, "startTime" | "endTime">,
) {
  return createDutyAvailability(club)(member, date, period, shift);
}
