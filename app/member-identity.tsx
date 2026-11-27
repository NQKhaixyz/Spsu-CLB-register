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

export function MemberName({ memberId, name, as: Tag = "span", className }: {
  memberId?: string; name?: string; as?: "span" | "strong"; className?: string;
}) {
  const identity = useMemberIdentity();
  const member = memberId ? identity?.members.get(memberId) : undefined;
  const rank = memberId ? identity?.weeklyRanks.get(memberId) : undefined;
  const group = memberId ? identity?.sharingGroups?.get(memberId) : undefined;
  return <Tag className={className ? `member-identity ${className}` : "member-identity"}>
    <span className="member-name" data-weekly-rank={rank}>{name ?? member?.name ?? "Thành viên"}</span>
    {group?.hashtag ? <>{" "}<span className="member-sharing-tag" data-kind={group.kind}
      title={group.kind === "cupid" ? "Hashtag Cupid" : group.name}>#{group.hashtag}</span></>
      : group?.kind === "cupid" ? <span className="sharing-name-wing" title="Cupid"><Feather size={12} aria-label="Cupid" /></span> : null}
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

export function MemberOption({ memberId, children }: { memberId: string; children?: ReactNode }) {
  const identity = useMemberIdentity();
  const name = identity?.members.get(memberId)?.name ?? "Thành viên";
  const rank = identity?.weeklyRanks.get(memberId);
  const hashtag = identity?.sharingGroups?.get(memberId)?.hashtag;
  return <option value={memberId} data-weekly-rank={rank}>
    {name}{hashtag ? ` #${hashtag}` : ""}{children}
  </option>;
}
