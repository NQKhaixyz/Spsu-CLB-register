"use client";

import { ImagePlus, X } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import { dateLabel, monthLabel, type Member, type AvailabilityDetail } from "../lib/club";
import { memberCommitteeNames } from "../lib/committees";
import { memberRoleLabel } from "../lib/member-positions";
import { monthlyScoreTier } from "../lib/score-ranks";
import { MemberName, useMemberIdentity } from "./member-identity";
import { Avatar, Button } from "./ui";

const weekdays = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

export function availableDays(slots: string[], period: "am" | "pm") {
  return [1, 2, 3, 4, 5, 6, 0].filter(day => slots.includes(`${day}-${period}`)).map(day => weekdays[day]).join(", ") || "Chưa chọn";
}

function ProfileDetails({ member, details, scheduleOnly }: {
  member: Member;
  details: Pick<AvailabilityDetail, "day" | "period" | "weeks" | "note">[];
  scheduleOnly: boolean;
}) {
  const fields = [
    ["MSSV", member.studentId || "Chờ bổ sung MSSV"],
    ["Email liên hệ", member.email || "Chưa có"],
    ["Trạng thái", member.active ? "Đang hoạt động" : "Tạm nghỉ"],
    ["Ngày tham gia", dateLabel(member.joined, true)],
    ...(member.left ? [["Ngày tạm nghỉ", dateLabel(member.left, true)]] : []),
    ...(member.loginName ? [["Tên đăng nhập được cấp", member.loginName]] : []),
    ["Nguyện vọng trực thêm", member.extraDuties ? "Có" : "Không"],
  ];
  return <div className="member-profile">
    {!scheduleOnly && (
      <dl className="profile-fields">{fields.map(([label, value]) =>
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      )}</dl>
    )}
    <h3>Khung giờ rảnh</h3>
    <dl className="profile-fields">
      <div><dt>Sáng</dt><dd>{availableDays(member.availability, "am")}</dd></div>
      <div><dt>Chiều</dt><dd>{availableDays(member.availability, "pm")}</dd></div>
    </dl>
    {details.length > 0 && <><h3>Lịch rảnh theo Excel</h3>
      <ul>{details.map((row, index) => <li key={index}>{row.day} · {row.period} · {row.weeks ? `Tuần ${row.weeks}` : "Chưa ghi tuần học"}{row.note && ` · ${row.note}`}</li>)}</ul>
    </>}
  </div>;
}

export function MemberProfileDialog({ member, details, scheduleOnly, onClose, onEditAvatar }: {
  member: Member;
  details: Pick<AvailabilityDetail, "day" | "period" | "weeks" | "note">[];
  scheduleOnly: boolean;
  onClose: () => void;
  onEditAvatar?: () => void;
}) {
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const identity = useMemberIdentity();
  const rank = identity?.monthlyRanks.get(member.id) ?? 0;
  const profileTier = rank <= 5 ? monthlyScoreTier(rank) : undefined;
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog ref={ref} className="member-profile-dialog" data-tier={profileTier?.id} aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
        if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) onClose();
      }}>
      <header className="member-profile-header">
        {profileTier && identity && <div className="member-profile-cover">
          <span className="member-profile-cover-art" aria-hidden="true" />
          <div className="member-profile-rank">
            <small>{monthLabel(identity.rankMonth)}</small>
            <strong>{profileTier.label}</strong>
          </div>
        </div>}
        <div className="member-profile-identity">
          <Avatar memberId={member.id} name={member.name} photoId={member.avatarId} size="large" profileLink={false} />
          <div>
            <h2 id={titleId}><MemberName memberId={member.id} name={member.name} /></h2>
            <p>{scheduleOnly ? "Lịch rảnh" : `${memberRoleLabel(member)} · ${memberCommitteeNames(member)}`}</p>
          </div>
        </div>
        <button type="button" className="icon-button member-profile-close" aria-label="Đóng hồ sơ" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <ProfileDetails member={member} details={details} scheduleOnly={scheduleOnly} />
      {onEditAvatar && !scheduleOnly && <footer className="member-profile-actions">
        <Button variant="secondary" onClick={onEditAvatar}>
          <ImagePlus size={16} aria-hidden="true" /> Đổi ảnh đại diện
        </Button>
      </footer>}
    </dialog>
  );
}
