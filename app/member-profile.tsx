import { dateLabel, type Member, type AvailabilityDetail } from "../lib/club";
import { memberCommitteeNames } from "../lib/committees";
import { memberRoleLabel } from "../lib/member-positions";
import { Avatar } from "./ui";

const weekdays = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

export function availableDays(slots: string[], period: "am" | "pm") {
  return [1, 2, 3, 4, 5, 6, 0].filter(day => slots.includes(`${day}-${period}`)).map(day => weekdays[day]).join(", ") || "Chưa chọn";
}

export function MemberProfile({ member, details, scheduleOnly }: {
  member: Member;
  details: Pick<AvailabilityDetail, "day" | "period" | "weeks" | "note">[];
  scheduleOnly: boolean;
}) {
  const fields = [
    ["MSSV", member.studentId || "Chờ bổ sung MSSV"],
    ["Email liên hệ", member.email || "Chưa có"],
    ["Ban trực thuộc", memberCommitteeNames(member)],
    ["Vai trò", memberRoleLabel(member)],
    ["Trạng thái", member.active ? "Đang hoạt động" : "Tạm nghỉ"],
    ["Ngày tham gia", dateLabel(member.joined, true)],
    ...(member.left ? [["Ngày tạm nghỉ", dateLabel(member.left, true)]] : []),
    ...(member.loginName ? [["Tên đăng nhập được cấp", member.loginName]] : []),
    ["Nguyện vọng trực thêm", member.extraDuties ? "Có" : "Không"],
  ];
  return <div className="member-profile">
    {!scheduleOnly && (
      <>
        <Avatar name={member.name} photoId={member.avatarId} size="large" />
        <dl className="profile-fields">{fields.map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
        )}</dl>
      </>
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
