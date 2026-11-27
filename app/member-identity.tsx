"use client";

import { createContext, Fragment, useContext, type ReactNode } from "react";
import type { Member } from "../lib/club";

type MemberIdentity = {
  members: ReadonlyMap<string, Member>;
  weeklyRanks: ReadonlyMap<string, number>;
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
  return <Tag className={className ? `member-name ${className}` : "member-name"} data-weekly-rank={rank}>
    {name ?? member?.name ?? "Thành viên"}
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
