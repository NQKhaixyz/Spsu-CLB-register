import type { AvailabilityDataset, AvailabilityDetail, Club, Member } from "./club";
import {
  activeAvailabilityDatasetFor,
  periodInterval,
  personKey,
  syncProfileTicks,
  validateDetailRows,
} from "./availability";

export function syncAvailabilityProfiles(club: Club, incoming: AvailabilityDataset) {
  const active = activeAvailabilityDatasetFor(club);
  if (!active?.settings) throw new Error("Cần thiết lập giờ ca trước khi đồng bộ lịch rảnh.");
  const groups = new Map<string, AvailabilityDetail[]>();
  for (const row of incoming.rows) {
    const key = personKey(row.name);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const matched = new Map<string, Member>();
  const unmatchedNames: string[] = [];
  for (const [key, rows] of groups) {
    const linkedId = active.memberLinks?.[key];
    const candidates = club.members.filter((member) => member.id === linkedId || personKey(member.name) === key);
    if (candidates.length > 1) throw new Error("Có nhiều hồ sơ khớp " + rows[0].name + ". Cần đối chiếu lại.");
    if (candidates.length === 1) matched.set(key, candidates[0]);
    else unmatchedNames.push(rows[0].name);
  }

  const reusedWeeks: number[] = [];
  const missingWeeks: number[] = [];
  const rows: AvailabilityDetail[] = [];
  for (const [key, sourceRows] of groups) {
    for (const original of sourceRows) {
      const row = { ...original };
      if (!row.weeks.trim()) {
        const member = matched.get(key);
        const previous = active.rows.filter((candidate) =>
          member && active.memberLinks?.[personKey(candidate.name)] === member.id &&
          personKey(candidate.day) === personKey(row.day) &&
          periodInterval(candidate.period, active.settings!).join() === periodInterval(row.period, active.settings!).join() &&
          candidate.weeks.trim(),
        );
        const knownWeeks = [...new Set(previous.map((candidate) => candidate.weeks))];
        if (knownWeeks.length === 1) {
          row.weeks = knownWeeks[0];
          reusedWeeks.push(row.sourceRow);
        } else {
          missingWeeks.push(row.sourceRow);
          continue;
        }
      }
      rows.push(row);
    }
  }
  validateDetailRows(rows, active.settings);
  const matchedIds = new Set([...matched.values()].map((member) => member.id));
  const links = Object.fromEntries(
    Object.entries(active.memberLinks ?? {}).filter(([, id]) => !matchedIds.has(id)),
  );
  for (const [key, member] of matched) links[key] = member.id;
  const next: AvailabilityDataset = {
    ...incoming,
    settings: { ...active.settings },
    memberLinks: links,
    rows: [
      ...active.rows.filter((row) => !matchedIds.has(active.memberLinks?.[personKey(row.name)] ?? "")),
      ...rows.filter((row) => matched.has(personKey(row.name))),
    ],
  };
  const changedProfiles = club.members.filter((member) => matchedIds.has(member.id))
    .map((member) => ({ member, before: JSON.stringify(member.availability) }));
  club.activeAvailabilityDataset = next;
  club.availabilityDataset = {
    ...incoming,
    rows,
    settings: { ...active.settings },
    memberLinks: Object.fromEntries([...matched].map(([key, member]) => [key, member.id])),
  };
  syncProfileTicks(club, next, matchedIds);
  club.availabilityVersion = incoming.importedAt;
  return {
    matched: matchedIds.size,
    rows: rows.filter((row) => matched.has(personKey(row.name))).length,
    changedProfiles: changedProfiles.filter(({ member, before }) => JSON.stringify(member.availability) !== before).length,
    unmatchedNames,
    reusedWeeks,
    missingWeeks,
  };
}
