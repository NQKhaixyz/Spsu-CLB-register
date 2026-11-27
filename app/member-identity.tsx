"use client";

import { createContext, Fragment, useContext, type ReactNode } from "react";
import { Feather } from "lucide-react";
import type { Member } from "../lib/club";
import type { ScoreStanding } from "../lib/score-ranks";
import type { PublicSharingGroup } from "../lib/sharing-types";

type MemberIdentity = {
  members: ReadonlyMap<string, Member>;
  sharingGroups?: ReadonlyMap<string, PublicSharingGroup>;
  weeklyRanks: ReadonlyMap<string, number>;
  monthlyRanks: ReadonlyMap<string, number>;
  weeklyScores: ReadonlyMap<string, ScoreStanding>;
  monthlyScores: ReadonlyMap<string, ScoreStanding>;
  rankWeek: string;
  rankMonth: string;
  openProfile: (memberId: string) => void;
};

export const MemberIdentityContext = createContext<MemberIdentity | null>(null);
export const useMemberIdentity = () => useContext(MemberIdentityContext);

export function MemberName({ memberId, name, as: Tag = "span", className, showSharing = true }: {
  memberId?: string; name?: string; as?: "span" | "strong"; className?: string; showSharing?: boolean;
}) {
  const identity = useMemberIdentity();
  const member = memberId ? identity?.members.get(memberId) : undefined;
  const rank = memberId ? identity?.weeklyRanks.get(memberId) : undefined;
  const group = memberId && showSharing ? identity?.sharingGroups?.get(memberId) : undefined;
  return <Tag className={className ? `member-name ${className}` : "member-name"} data-weekly-rank={rank}>
    {name ?? member?.name ?? "Thành viên"}
    {group?.kind === "guild" && <span className="sharing-code" title={group.name}>#{group.code}</span>}
    {group?.kind === "cupid" && <span className="sharing-name-wing" title="Cupid"><Feather size={12} aria-label="Cupid" /></span>}
  </Tag>;
}

export function MemberNames({ memberIds, fallback, separator = ", ", short = false }: {
  memberIds: readonly string[]; fallback: string; separator?: string; short?: boolean;
}) {
  const identity = useMemberIdentity();
  const members = memberIds.flatMap(id => {
    const member = identity?.members.get(id);
    return member ? [member] : [];
  });
  return members.length ? members.map((member, index) => (
    <Fragment key={member.id}>
      {index ? separator : ""}
      <MemberName memberId={member.id} name={short ? member.name.split(" ").slice(-2).join(" ") : member.name} />
    </Fragment>
  )) : fallback;
}

export function MemberOption({ memberId, children }: { memberId: string; children: ReactNode }) {
  const rank = useMemberIdentity()?.weeklyRanks.get(memberId);
  return <option value={memberId} data-weekly-rank={rank}>{children}</option>;
}
