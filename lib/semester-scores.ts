import { reportMembers, scoreFor, today, type Club } from "./club";
import { memberCommitteeNames } from "./committees";
import { rankScoreRows } from "./score-ranks";

type SemesterMember = {
  memberId: string;
  name: string;
  committeeNames: string;
  points: number;
  byMonth: Record<string, number>;
};

export function semesterScores(club: Club, from: string, through: string, asOf = today()) {
  const months: string[] = [];
  const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (monthPattern.test(from) && monthPattern.test(through) && from <= through) {
    const end = Date.parse(through + "-01T00:00:00Z");
    for (const date = new Date(from + "-01T00:00:00Z"); date.getTime() <= end; date.setUTCMonth(date.getUTCMonth() + 1)) {
      months.push(date.toISOString().slice(0, 7));
    }
  }
  const totals = new Map<string, SemesterMember>();
  for (const month of months) {
    for (const member of reportMembers(club, month, asOf)) {
      const row = totals.get(member.id) ?? {
        memberId: member.id, name: member.name, committeeNames: memberCommitteeNames(member), points: 0, byMonth: {},
      };
      const { points } = scoreFor(club, member.id, month);
      row.byMonth[month] = points;
      row.points += points;
      totals.set(member.id, row);
    }
  }
  const rows = rankScoreRows([...totals.values()].map(row => ({ ...row, points: Number(row.points.toFixed(10)) })));
  return { months, rows };
}
