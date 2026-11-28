import { reportMembers, scoreFor, today, type Club } from "./club";
import { memberCommitteeNames } from "./committees";
import { rankScoreRows } from "./score-ranks";
import { roundSharingScore, sharingScoreBook, type SharingScoreIndex } from "./sharing-scores";
import type { SharingAmounts } from "./sharing-types";

export type SemesterScoreRange = { from: string; through: string };
export const semesterMonthLimit = 48;
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

export function validSemesterScoreRange(from: unknown, through: unknown): boolean {
  const monthIndex = (month: string) => Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7));
  return typeof from === "string" && typeof through === "string" && monthPattern.test(from) && monthPattern.test(through) &&
    from <= through && monthIndex(through) - monthIndex(from) < semesterMonthLimit;
}

type SemesterMember = {
  memberId: string;
  name: string;
  committeeNames: string;
  points: number;
  byMonth: Record<string, number>;
  sharingAdjustment?: SharingAmounts;
};

export function semesterScores(club: Club, from: string, through: string, asOf = today(),
  sharingIndex: SharingScoreIndex = sharingScoreBook(club).index) {
  const months: string[] = [];
  if (validSemesterScoreRange(from, through)) {
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
      const score = scoreFor(club, member.id, month, undefined, sharingIndex);
      row.byMonth[month] = score.points;
      row.points += score.pointsBeforeSharing - score.redeemedPoints;
      if (score.sharingAdjustment.cupid || score.sharingAdjustment.guild) {
        const adjustment = row.sharingAdjustment ??= { cupid: 0, guild: 0 };
        adjustment.cupid += score.sharingAdjustment.cupid;
        adjustment.guild += score.sharingAdjustment.guild;
      }
      totals.set(member.id, row);
    }
  }
  const rows = rankScoreRows([...totals.values()].map(row => ({ ...row,
    points: roundSharingScore(row.points + (row.sharingAdjustment?.cupid ?? 0) + (row.sharingAdjustment?.guild ?? 0)),
  })));
  return { months, rows };
}

export function publishedSemesterScores(club: Club, asOf = today()) {
  const range = club.semesterScoreRange;
  return range && validSemesterScoreRange(range.from, range.through)
    ? { range, ...semesterScores(club, range.from, range.through, asOf) }
    : null;
}
