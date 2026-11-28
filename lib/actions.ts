import { applyActivityAction, ratedActivityKinds, type ActivityRates } from "./activity";
import {
  addDays,
  adminMemberIds,
  closeWeek,
  reopenWeek,
  shiftCapacity,
  canReplanDutyShift,
  createClub,
  createDutyShiftSlots,
  demoClub,
  makeSchedule,
  fillDutyShifts,
  canEditDutyDraft,
  canWithdrawDutyShift,
  isShiftPublished,
  isRosterMember,
  isUpcomingShift,
  newEntry,
  rosterAssignments,
  rulesFor,
  syncWeeks,
  setMemberActive,
  today,
  uid,
  weekId,
  weekday,
  type Club,
  type Member,
  type DutyResult,
  type AvailabilityDetail,
} from "./club";
import {
  activeAvailabilityDatasetFor,
  availabilityForDuty,
  clockMinutes,
  personKey,
  validateDetailRows,
  setProfileAvailability,
  syncProfileTicks,
  applyAvailabilityOverrides,
} from "./availability";
import { syncAvailabilityProfiles } from "./availability-profile-import";
import { sharedLinkUrl } from "./shared-links";
import { editMemberFeedback, eraseFeedbackMembers, recallMemberFeedback, replyToFeedback, sendMemberFeedback, setFeedbackConsent } from "./feedback";
import { applySharingAction, endSharingForMember, eraseSharingMembers } from "./sharing";
import { semesterMonthLimit, validSemesterScoreRange } from "./semester-scores";
import { bulletinAuthorId, bulletinCommentLimit, bulletinContentLimit, bulletinTitleLimit, canManageBulletin, isBulletinId, isBulletinPublished, parseBulletinDate } from "./bulletin";
import { bulletinMediaLimit, isBulletinMediaId, type BulletinMedia } from "./bulletin-media";
import { committeeKinds, isCommitteeKind, memberCommittees } from "./committees";
import { isFontId } from "./interface-fonts";
import { isMemberPosition } from "./member-positions";
import { planDutyWeek } from "./duty-week-plan";
import { captureWorkspaceNotifications } from "./activity-notifications";
import { confirmBulletinNotice, sendDirectNotice } from "./workspace-notifications";
import type { AvailabilitySettings } from "./club";

export type Identity = { userId: string; email: string; displayName: string };
export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const str = (value: unknown, max = 500) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
function bulletinCommentContent(value: unknown) {
  const content = typeof value === "string" ? value.trim() : "";
  check(content.length > 0 && content.length <= bulletinCommentLimit, `Nhập bình luận từ 1 đến ${bulletinCommentLimit} ký tự.`);
  return content;
}
const checkStudentId = (studentId: string) =>
  check(!["admin", "member"].includes(studentId.toLowerCase()), "MSSV trùng tên đăng nhập dành riêng. Vui lòng nhập MSSV khác.");
const validDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(date)) &&
  new Date(date + "T12:00:00Z").toISOString().slice(0, 10) === date;
export function applyAction(
  club: Club,
  identity: Identity,
  action: string,
  data: Record<string, any>,
) {
  const member = club.members.find(entry => entry.userId === identity.userId);
  const updateNotices = captureWorkspaceNotifications(club, member, action, data);
  applyClubAction(club, identity, action, data, member);
  updateNotices?.();
}

function applyClubAction(
  club: Club,
  identity: Identity,
  action: string,
  data: Record<string, any>,
  initialMember: Member | undefined,
) {
  let me = initialMember;
  const admin = me?.role === "admin" && me.active;
  const note = (text: string) => {
    club.logs.unshift({
      at: new Date().toISOString(),
      actor: me?.name ?? identity.displayName,
      actorId: me?.id,
      text,
    });
    club.logs = club.logs.slice(0, 2000);
  };
  if (action === "profile") {
    check(!me || me.active, "Tài khoản đã ngừng hoạt động.");
    const name = str(data.name, 100),
      studentId = str(data.studentId, 30);
    const email = data.email === undefined ? (me?.email ?? identity.email) : str(data.email, 200);
    check(!email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Email liên hệ chưa hợp lệ.");
    checkStudentId(studentId);
    check(
      name.length >= 2 && /^[a-zA-Z0-9._-]{3,30}$/.test(studentId),
      "Nhập họ tên và MSSV hợp lệ (3–30 ký tự).",
    );
    const existing = club.members.find(
      (m) =>
        m.studentId.toLowerCase() === studentId.toLowerCase() &&
        m.id !== me?.id,
    );
    if (existing) {
      throw new Error(
        "MSSV đã có trong danh sách. Nhờ BĐH cấp tài khoản cho hồ sơ này.",
      );
    } else if (me) {
      me.name = name;
      me.studentId = studentId;
      me.email = email;
      me.needsStudentId = false;
    } else {
      me = {
        id: uid(),
        name,
        studentId,
        email,
        userId: identity.userId,
        role: identity.userId === club.ownerId ? "admin" : "member",
        active: true,
        joined: today(),
        availability: [],
        extraDuties: false,
      };
      club.members.push(me);
    }
    syncWeeks(club);
    note("Cập nhật hồ sơ thành viên");
    return;
  }
  check(me?.active, "Tài khoản chưa có hồ sơ hoặc đã ngừng hoạt động.");
  if (action === "sendDirectNotice") {
    sendDirectNotice(club, me, data);
    return;
  }
  if (applySharingAction(club, me, action, data)) return;
  if (action === "sendFeedback") {
    sendMemberFeedback(club, me, data);
    return;
  }
  if (action === "editFeedback") {
    editMemberFeedback(club, me, data);
    return;
  }
  if (action === "recallFeedback") {
    recallMemberFeedback(club, me, data.id);
    return;
  }
  if (action === "replyToFeedback") {
    replyToFeedback(club, me, data);
    return;
  }
  if (action === "setFeedbackConsent") {
    setFeedbackConsent(club, me, data);
    return;
  }
  if (action === "setMyFont") {
    check(data.memberId === undefined || data.memberId === me.id, "Bạn chỉ có thể đổi phông chữ cho tài khoản của mình.");
    check(isFontId(data.font), "Phông chữ không hợp lệ.");
    me.fontPreference = data.font;
    return;
  }
  if (action === "register") {
    check(isRosterMember(me), "Đăng ký họp dành cho tài khoản thành viên.");
    check(!me.needsStudentId, "Vui lòng bổ sung MSSV trong hồ sơ trước khi đăng ký họp.");
    const w = club.weeks.find((w) => w.id === weekId());
    check(
      w && !w.closed && !w.cancelled,
      "Tuần này đã chốt hoặc không tổ chức họp.",
    );
    const e = w.entries.find((e) => e.memberId === me.id);
    check(e, "Bạn chưa có trong danh sách tuần này.");
    check(
      !e.attendanceVerified,
      "Kết quả đã được BĐH ghi nhận. Liên hệ BĐH nếu cần điều chỉnh.",
    );
    if (data.status === "attending") {
      check(
        e.status === "unregistered" || e.status === "attending",
        "Đăng ký vắng cần gửi yêu cầu để BĐH duyệt.",
      );
      e.status = "attending";
      e.absent = false;
      e.excused = false;
      e.reason = "";
      delete e.request;
      delete e.decision;
    } else if (data.status === "absent") {
      check(e.status !== "pending", "Hãy rút yêu cầu đang chờ trước.");
      const reason = str(data.reason);
      check(reason.length >= 3, "Vui lòng nhập lý do xin vắng.");
      e.status = "absent";
      e.reason = reason;
      e.excused = true;
      e.absent = true;
      e.passed = false;
      delete e.request;
      delete e.decision;
    } else if (data.status === "pending") {
      check(e.status === "absent", "Chỉ gửi yêu cầu khi đang đăng ký vắng.");
      const request = str(data.reason);
      check(request.length >= 3, "Nhập lời nhắn gửi BĐH.");
      e.status = "pending";
      e.absent = undefined;
      e.request = request;
      e.decision = "";
    } else if (data.status === "withdraw") {
      check(e.status === "pending", "Yêu cầu đã được xử lý.");
      e.status = "absent";
      e.absent = true;
      e.decision = "Thành viên rút yêu cầu";
    } else throw new Error("Lựa chọn không hợp lệ.");
    note(`Đăng ký họp: ${e.status}`);
    return;
  }
  if (action === "preferences") {
    me.extraDuties = !!data.extraDuties;
    note("Cập nhật nguyện vọng trực thêm");
    return;
  }
  if (["setBulletinLike", "setBulletinSaved", "commentOnBulletin", "setBulletinCommentLike", "editBulletinComment", "deleteBulletinComment"].includes(action)) {
    const post = club.bulletinPosts?.find(item => item.id === data.postId);
    const now = Date.now();
    check(post && isBulletinPublished(post, now), "Bản tin chưa đăng hoặc đã hết hạn.");
    if (action === "commentOnBulletin") {
      const { id, replyTo } = data;
      const content = bulletinCommentContent(data.content);
      check(isBulletinId(id), "Mã bình luận không hợp lệ.");
      const existing = post.comments?.find(comment => comment.id === id);
      if (existing) {
        check(existing.memberId === me.id && existing.replyTo === replyTo &&
          (existing.content === content || existing.editedAt !== undefined || existing.deletedAt !== undefined),
        "Bình luận đã được lưu với nội dung khác.");
        return;
      }
      check(replyTo === undefined || (isBulletinId(replyTo) && post.comments?.some(comment => comment.id === replyTo && comment.deletedAt === undefined)),
        "Không tìm thấy bình luận bạn đang trả lời.");
      (post.comments ??= []).push({ id, memberId: me.id, content, createdAt: now, replyTo });
    } else if (action === "editBulletinComment" || action === "deleteBulletinComment") {
      const comment = post.comments?.find(item => item.id === data.commentId);
      check(comment?.memberId === me.id, "Bạn chỉ có thể quản lý bình luận của mình.");
      if (action === "deleteBulletinComment" && comment.deletedAt !== undefined) return;
      check(comment.deletedAt === undefined, "Bình luận đã bị xóa.");
      const content = action === "editBulletinComment" ? bulletinCommentContent(data.content) : "";
      if (action === "editBulletinComment" && content === comment.content) return;
      check(data.previousEditedAt === comment.editedAt, "Bình luận vừa được chỉnh sửa. Cập nhật dữ liệu rồi thử lại.");
      if (action === "editBulletinComment") {
        comment.content = content;
        comment.editedAt = Math.max(now, (comment.editedAt ?? comment.createdAt) + 1);
      } else {
        // Retain the ID for existing replies and retries of the original send.
        comment.content = "";
        comment.deletedAt = now;
        delete comment.editedAt;
        delete comment.likedBy;
      }
    } else {
      const selected = (ids: string[] | undefined, enabled: unknown) => {
        check(typeof enabled === "boolean", "Thao tác với bản tin không hợp lệ.");
        const members = new Set(ids);
        if (enabled) members.add(me.id);
        else members.delete(me.id);
        return [...members];
      };
      if (action === "setBulletinLike") {
        if (data.liked || post.likedBy?.includes(me.id)) confirmBulletinNotice(post, me.id);
        post.likedBy = selected(post.likedBy, data.liked);
      }
      else if (action === "setBulletinSaved") post.savedBy = selected(post.savedBy, data.saved);
      else {
        const comment = post.comments?.find(item => item.id === data.commentId);
        check(comment && comment.deletedAt === undefined, "Không tìm thấy bình luận.");
        comment.likedBy = selected(comment.likedBy, data.liked);
      }
    }
    return;
  }
  if (action === "saveBulletinPost" || action === "deleteBulletinPost") {
    const { id, revision } = data;
    check(isBulletinId(id), "Mã bản tin không hợp lệ. Mở lại hộp thoại rồi thử lại.");
    const post = club.bulletinPosts?.find(item => item.id === id);
    check(!post || canManageBulletin(club, post, me), "Bạn chỉ có thể quản lý bản tin của mình.");
    if (action === "deleteBulletinPost") {
      if (!post) return;
      check(revision === post.revision, "Bản tin vừa được cập nhật. Tải lại để kiểm tra trước khi xóa.");
      club.bulletinPosts = club.bulletinPosts?.filter(item => item.id !== post.id);
      note(`Xóa bản tin ${post.title}`);
      return;
    }

    check(admin || (data.publishAt === undefined && data.deleteAt === undefined), "Chỉ BĐH được hẹn giờ bản tin.");
    const title = typeof data.title === "string" ? data.title.trim() : "";
    const content = typeof data.content === "string" ? data.content.trim() : "";
    check(data.contentFormat === undefined || data.contentFormat === "emphasis", "Định dạng bản tin không hợp lệ.");
    const contentFormat = data.contentFormat ?? post?.contentFormat;
    check(title.length > 0 && title.length <= bulletinTitleLimit, `Nhập tiêu đề từ 1 đến ${bulletinTitleLimit} ký tự.`);
    const now = Date.now();
    const previousMedia = post?.media ?? [];
    const mediaIds: unknown = data.mediaIds === undefined ? previousMedia.map(file => file.id) : data.mediaIds;
    check(Array.isArray(mediaIds) && mediaIds.length <= bulletinMediaLimit &&
      mediaIds.every(isBulletinMediaId) && new Set(mediaIds).size === mediaIds.length, "Danh sách tệp đính kèm không hợp lệ.");
    const media: BulletinMedia[] = mediaIds.map(fileId => {
      const file = previousMedia.find(item => item.id === fileId) ?? club.bulletinUploads?.find(upload =>
        upload.id === fileId && upload.postId === id && upload.uploaderId === me.id && upload.expiresAt > now,
      );
      check(file, "Tệp đính kèm không còn dùng được. Chọn lại tệp rồi thử lưu.");
      return { id: file.id, type: file.type, bytes: file.bytes, ...(file.name ? { name: file.name } : {}) };
    });
    check(content.length <= bulletinContentLimit, `Nội dung tối đa ${bulletinContentLimit} ký tự.`);
    check(content || media.length, "Nhập nội dung hoặc thêm tệp đính kèm.");

    const publishAt = data.publishAt === undefined ? post?.publishAt : parseBulletinDate(data.publishAt);
    const deleteAt = data.deleteAt === undefined ? post?.deleteAt : parseBulletinDate(data.deleteAt);
    check(!Number.isNaN(publishAt) && !Number.isNaN(deleteAt), "Giờ hẹn không hợp lệ. Dùng giờ Việt Nam.");
    check(deleteAt === undefined || deleteAt > Math.max(now, publishAt ?? now), "Giờ xóa phải sau thời điểm đăng và sau hiện tại.");
    const fields = { title, content, contentFormat, publishAt, deleteAt, media: media.length ? media : undefined };
    if (post) {
      const sameMedia = previousMedia.length === media.length && previousMedia.every((file, index) => file.id === media[index].id);
      if (sameMedia && post.title === title && post.content === content && post.contentFormat === contentFormat &&
        post.publishAt === publishAt && post.deleteAt === deleteAt) return;
      check(revision === post.revision, "Bản tin vừa được cập nhật. Tải lại để xem nội dung mới.");
      if (post.createdBy === undefined) post.createdBy = bulletinAuthorId(club, post) ?? null;
      if (post.notice && post.notice.appearsAt > now) {
        post.notice.appearsAt = Math.max(now, publishAt ?? now);
      }
      Object.assign(post, fields, { revision: post.revision + 1 });
    } else {
      check(revision === undefined, "Không tìm thấy bản tin cần sửa.");
      (club.bulletinPosts ??= []).unshift({
        id, ...fields, createdAt: now, createdBy: me.id, revision: 1,
        notice: { id: crypto.randomUUID(), appearsAt: Math.max(now, publishAt ?? now) },
      });
    }
    if (club.bulletinUploads && media.length)
      club.bulletinUploads = club.bulletinUploads.filter(upload => !mediaIds.includes(upload.id));
    note(`${post ? "Cập nhật" : "Đăng"} bản tin ${title}`);
    return;
  }
  if (applyActivityAction(club, me, action, data, note)) return;
  check(admin, "Chỉ BĐH được thực hiện thao tác này.");
  if (action === "setSemesterScoreRange") {
    const from = typeof data.from === "string" ? data.from : "";
    const through = typeof data.through === "string" ? data.through : "";
    check(validSemesterScoreRange(from, through), `Chọn khoảng tháng hợp lệ, tối đa ${semesterMonthLimit} tháng.`);
    if (club.semesterScoreRange?.from === from && club.semesterScoreRange.through === through) return;
    club.semesterScoreRange = { from, through };
    delete club.semesterScoreDraft;
    note(`Công bố bảng điểm học kỳ ${from} – ${through}`);
    return;
  }
  if (action === "unpublishSemesterScoreRange") {
    const published = club.semesterScoreRange;
    if (!published) return;
    check(published.from === data.from && published.through === data.through,
      "Kỳ đang công bố vừa thay đổi. Cập nhật dữ liệu rồi thử lại.");
    club.semesterScoreDraft = published;
    delete club.semesterScoreRange;
    note(`Hủy công bố bảng điểm học kỳ ${published.from} – ${published.through}`);
    return;
  }
  if (action === "setAcademicWeekAnchor") {
    const date = typeof data.date === "string" ? data.date : "";
    const anchorWeek = typeof data.weekNumber === "number" || typeof data.weekNumber === "string" ? Number(data.weekNumber) : NaN;
    check(validDate(date), "Chọn ngày hợp lệ để đặt mốc tuần học");
    check(Number.isInteger(anchorWeek) && anchorWeek >= 1 && anchorWeek <= 53, "Số tuần học phải là số nguyên từ 1 đến 53");
    const anchorDate = weekId(date);
    check(validDate(anchorDate), "Ngày bắt đầu tuần không hợp lệ");
    const anchors = club.academicWeekAnchors ?? [];
    if (anchors.find(anchor => anchor.anchorDate === anchorDate)?.anchorWeek === anchorWeek) return;
    club.academicWeekAnchors = [...anchors.filter(anchor => anchor.anchorDate !== anchorDate), { anchorDate, anchorWeek }]
      .sort((a, b) => a.anchorDate.localeCompare(b.anchorDate));
    note(`Đặt mốc tuần ${anchorWeek} từ ${anchorDate}`);
    return;
  }
  const getWeek = () => {
    const w = club.weeks.find((w) => w.id === data.week);
    check(w, "Không tìm thấy tuần.");
    return w;
  };
  const getMember = () => {
    const m = club.members.find((m) => m.id === data.memberId);
    check(m, "Không tìm thấy thành viên.");
    return m;
  };
  const getCapacity = () => {
    const value = Number(data.peoplePerShift ?? club.peoplePerShift ?? 2);
    check(Number.isInteger(value) && value >= 1 && value <= 50,
      "Số người mỗi buổi trực phải là số nguyên từ 1–50.");
    return value;
  };
  if (action === "moveSharedLink") {
    const links = club.links ?? [];
    const index = links.findIndex(link => link.id === data.id);
    const offset = data.offset;
    check(index >= 0 && (offset === -1 || offset === 1), "Không tìm thấy vị trí của link.");
    const link = links[index], neighbor = links[index + offset];
    check(neighbor && neighbor.id === data.neighborId, "Thứ tự link vừa thay đổi. Tải lại danh sách để thử lại.");
    links[index] = neighbor;
    links[index + offset] = link;
    note(`Đổi vị trí link ${link.title}`);
  } else if (action === "saveSharedLink" || action === "deleteSharedLink") {
    const links = club.links ??= [];
    const existing = data.id ? links.find(link => link.id === data.id) : undefined;
    check(!data.id || existing, "Link này đã bị xóa hoặc không còn tồn tại.");
    if (existing) {
      check(data.updatedAt === existing.updatedAt, "Link vừa được cập nhật. Tải lại để xem nội dung mới.");
    }
    if (action === "deleteSharedLink") {
      check(existing, "Không tìm thấy link cần xóa.");
      club.links = links.filter(link => link.id !== existing.id);
      note(`Xóa link ${existing.title}`);
    } else {
      const title = str(data.title, 120);
      const description = str(data.description, 1500);
      const url = sharedLinkUrl(str(data.url, 2048));
      check(title, "Nhập tên link.");
      check(url, "Nhập đường dẫn bắt đầu bằng https:// hoặc http://.");
      const fields = { title, description, url, updatedAt: new Date().toISOString() };
      if (existing) Object.assign(existing, fields);
      else links.unshift({ id: uid(), ...fields });
      note(`${existing ? "Cập nhật" : "Thêm"} link ${title}`);
    }
  } else if (action === "meeting") {
    const w = getWeek();
    const date = str(data.meetingDate, 10);
    check(
      !date || (validDate(date) && date >= w.id && date <= addDays(w.id, 6)),
      "Ngày họp phải nằm trong tuần đang chọn.",
    );
    if (w.closed) {
      check(
        !w.meetingDate && date,
        "Tuần đã chốt, chỉ được bổ sung ngày họp còn thiếu.",
      );
      const reason = str(data.note);
      check(reason.length >= 3, "Cần ghi lý do bổ sung ngày họp đã chốt.");
      w.meetingDate = date;
      note(`Bổ sung ngày họp tuần ${w.id}: ${date}; ${reason}`);
      return;
    }
    check(/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time), "Giờ họp không hợp lệ.");
    Object.assign(w, {
      meetingDate: date,
      time: data.time,
      location: str(data.location, 200),
      cancelled: !!data.cancelled,
    });
    note(`Cập nhật lịch họp tuần ${w.id}`);
  } else if (action === "close") {
    const w = getWeek();
    check(
      w.meetingDate || w.cancelled,
      "Hãy đặt ngày họp trước khi chốt để thống kê đúng tháng.",
    );
    closeWeek(w, adminMemberIds(club));
    note(`Chốt cuộc họp tuần ${w.id}`);
  } else if (action === "reopen") {
    const w = getWeek();
    check(w.closed, "Cuộc họp chưa được chốt.");
    const reason = str(data.note);
    check(reason.length >= 3, "Cần ghi lý do hủy chốt cuộc họp.");
    reopenWeek(w);
    note(`Hủy chốt cuộc họp tuần ${w.id}: ${reason}`);
  } else if (action === "review") {
    const w = getWeek();
    const member = getMember();
    check(isRosterMember(member), "Danh sách họp dành cho tài khoản thành viên.");
    check(!w.closed, "Tuần đã chốt.");
    const e = w.entries.find((e) => e.memberId === data.memberId);
    check(e?.status === "pending", "Yêu cầu đã được xử lý.");
    check(data.approved || str(data.reason).length >= 3, "Nhập lý do từ chối.");
    e.status = data.approved ? "attending" : "absent";
    e.absent = !data.approved;
    e.decision = data.approved ? "BĐH chấp thuận" : str(data.reason);
    if (data.approved) e.excused = false;
    note(
      `${data.approved ? "Duyệt" : "Từ chối"} yêu cầu của ${member.name}`,
    );
  } else if (action === "entry") {
    const w = getWeek();
    const member = getMember();
    check(isRosterMember(member), "Điểm danh họp dành cho tài khoản thành viên.");
    check(!w.cancelled, "Tuần không tổ chức họp.");
    const e = w.entries.find((e) => e.memberId === data.memberId);
    check(e, "Không tìm thấy đăng ký.");
    if (w.closed)
      check(str(data.note).length >= 3, "Cần ghi lý do sửa kết quả đã chốt.");
    if (data.status) {
      check(
        ["attending", "absent"].includes(data.status),
        "Trạng thái không hợp lệ.",
      );
      e.status = data.status;
      e.absent = data.status === "absent";
      if (data.status === "attending") e.excused = false;
    }
    if (typeof data.absent === "boolean") {
      e.absent = data.absent;
      e.status = data.absent ? "absent" : "attending";
    }
    if (typeof data.excused === "boolean") e.excused = data.excused;
    if (typeof data.passed === "boolean") {
      check(
        !data.passed || (e.status === "attending" && !e.absent),
        "Chỉ ghi nhận đạt phiếu điểm danh cho người có mặt.",
      );
      e.passed = data.passed;
    }
    if (e.absent) e.passed = false;
    if (
      data.status !== undefined ||
      typeof data.absent === "boolean" ||
      typeof data.excused === "boolean" ||
      typeof data.passed === "boolean"
    )
      e.attendanceVerified = true;
    note(
      `Cập nhật điểm danh ${member.name}${data.note ? `: ${str(data.note)}` : ""}`,
    );
  } else if (action === "schedule") {
    if (data.month === undefined) {
      const week = str(data.week, 10);
      check(validDate(week) && weekId(week) === week, "Chọn tuần trực hợp lệ.");
      const capacity = getCapacity();
      const count = planDutyWeek(club, week, capacity);
      check(count > 0, "Tuần này không còn ca nháp để xếp lại.");
      club.peoplePerShift = capacity;
      note(`Xếp ${count} ca nháp tuần ${week}: ${capacity} người/buổi trực`);
      return;
    }
    check(/^\d{4}-(0[1-9]|1[0-2])$/.test(data.month), "Tháng không hợp lệ.");
    const old = club.schedules.find((s) => s.month === data.month);
    if (data.week !== undefined) {
      check(old?.published, "Không tìm thấy lịch tháng đã công bố.");
      const now = new Date();
      if (old.pendingDutyWeek && old.pendingDutyWeek === data.week) {
        check(!old.shifts.some((shift) => weekId(shift.date) === data.week), "Tuần này đã có ca trực. Tải lại trang để xem lịch.");
        const capacity = getCapacity();
        const shifts = createDutyShiftSlots(club, old.month, capacity)
          .filter((shift) => weekId(shift.date) === data.week && isUpcomingShift(shift, now))
          .map((shift) => ({ ...shift, draft: true }));
        check(shifts.length > 0, "Tuần này không còn ca trực sắp tới để xếp.");
        fillDutyShifts(club, old.month, shifts, old.shifts);
        old.shifts = [...old.shifts, ...shifts].sort((a, b) => a.id.localeCompare(b.id));
        delete old.pendingDutyWeek;
        note(`Xếp mới ${shifts.length} ca nháp tuần ${data.week}: ${capacity} người/buổi trực`);
        return;
      }
      const adminIds = adminMemberIds(club);
      const editable = old.shifts.filter((shift) =>
        weekId(shift.date) === data.week && canEditDutyDraft(shift, now, adminIds),
      );
      check(editable.length > 0, "Tuần này không còn ca nháp trong thời gian chỉnh sửa.");
      const capacity = getCapacity();
      const previous = new Map(editable.map((shift) => [shift.id, shift.assignments]));
      for (const shift of editable) {
        shift.assignments = shift.assignments.filter(a => a.manual);
        shift.capacity = capacity;
      }
      fillDutyShifts(club, old.month, editable, old.shifts.filter((shift) => !editable.includes(shift)));
      for (const shift of editable) {
        for (const assignment of shift.assignments) {
          const prior = previous.get(shift.id)?.find((a) => a.memberId === assignment.memberId);
          if (prior?.note) assignment.note = prior.note;
          if (prior?.originalId) assignment.originalId = prior.originalId;
        }
      }
      note(`Xếp lại ${editable.length} ca nháp tuần ${data.week}: ${capacity} người/buổi trực`);
      return;
    }
    check(
      !old?.published,
      "Lịch đã công bố. Hãy sửa từng ca để giữ kết quả đã xác minh.",
    );
    const capacity = getCapacity();
    const next = makeSchedule(club, data.month, capacity);
    club.peoplePerShift = capacity;
    club.schedules = club.schedules.filter((s) => s.month !== data.month);
    club.schedules.push(next);
    note(`Xếp lịch nháp tháng ${data.month}: ${capacity} người/buổi trực`);
  } else if (action === "withdrawDutyWeek") {
    if (data.week !== undefined) {
      const week = str(data.week, 10);
      check(validDate(week) && weekId(week) === week, "Chọn tuần trực hợp lệ.");
      const shifts = club.schedules.flatMap(schedule => schedule.shifts.filter(shift =>
        weekId(shift.date) === week && isShiftPublished(schedule, shift),
      ));
      check(shifts.length > 0, "Tuần này chưa có lịch được công bố.");
      for (const shift of shifts) {
        shift.draft = true;
        shift.wasPublished = true;
      }
      note(`Hủy công bố ${shifts.length} ca trực tuần ${week}`);
      return;
    }
    const from = today();
    check(data.from === from, "Ngày đã đổi. Tải lại lịch trực để chọn đúng phạm vi.");
    const adminIds = adminMemberIds(club);
    const shifts = club.schedules.flatMap((schedule) =>
      schedule.shifts.filter((shift) => canWithdrawDutyShift(schedule, shift, from, adminIds)),
    );
    check(shifts.length > 0, "Từ hôm nay đến hết tuần không còn ca đã công bố có thể rút về nháp.");
    for (const shift of shifts) {
      shift.draft = true;
      shift.withdrawnOn = from;
    }
    note(`Hủy công bố ${shifts.length} ca trực từ ${from} đến ${addDays(weekId(from), 6)}`);
  } else if (action === "publish") {
    const week = str(data.week, 10);
    check(validDate(week) && weekId(week) === week, "Chọn tuần cần công bố.");
    let count = 0;
    for (const schedule of club.schedules) {
      const shifts = schedule.shifts.filter(shift => weekId(shift.date) === week && !isShiftPublished(schedule, shift));
      if (!shifts.length) continue;
      if (!schedule.published) {
        for (const shift of schedule.shifts) shift.draft = true;
        schedule.published = true;
      }
      for (const shift of shifts) {
        delete shift.draft;
        delete shift.withdrawnOn;
        delete shift.wasPublished;
      }
      count += shifts.length;
    }
    check(count > 0, "Tuần này không có ca nháp để công bố.");
    note(`Công bố ${count} ca trực tuần ${week}`);
  } else if (action === "addDutyMember") {
    const schedule = club.schedules.find(item => item.month === data.month);
    const shift = schedule?.shifts.find(item => item.id === data.shiftId);
    check(shift && !shift.cancelled, "Ca trực đã hủy hoặc không còn tồn tại.");
    const member = club.members.find(item => item.id === data.memberId && item.active && isRosterMember(item));
    check(member, "Chọn thành viên đang hoạt động.");
    check(!shift.assignments.some(a => a.memberId === member.id), "Thành viên đã có trong ca này.");
    shift.assignments.push({ memberId: member.id, manual: true, result: "unverified" });
    note(`Thêm người vào ca ${shift.id}: ${member.name}`);
  } else if (action === "cancelShift" || action === "restoreShift") {
    const schedule = club.schedules.find((s) => s.month === data.month),
      shift = schedule?.shifts.find((t) => t.id === data.shiftId);
    check(shift, "Không tìm thấy ca trực.");
    if (action === "cancelShift") {
      check(!shift.cancelled, "Ca này đã hủy.");
      shift.cancellationSnapshot = structuredClone(shift.assignments);
      shift.cancelled = true;
      shift.cancelReason = str(data.reason, 500) || "BĐH hủy ca trực";
      shift.cancelledAt = new Date().toISOString();
      for (const assignment of shift.assignments) {
        assignment.result = "cancelled";
        assignment.late = false;
      }
      note(`Hủy cả ca ${shift.id}: ${shift.cancelReason}`);
    } else {
      check(
        shift.cancelled && shift.cancellationSnapshot,
        "Ca này chưa bị hủy hoặc không có dữ liệu để khôi phục.",
      );
      shift.assignments = structuredClone(shift.cancellationSnapshot);
      delete shift.cancelled;
      delete shift.cancelReason;
      delete shift.cancelledAt;
      delete shift.cancellationSnapshot;
      note(`Khôi phục cả ca ${shift.id}`);
    }
  } else if (action === "shift") {
    const s = club.schedules.find((s) => s.month === data.month);
    const shift = s?.shifts.find((s) => s.id === data.shiftId);
    check(s && shift, "Không tìm thấy ca trực.");
    check(
      !shift.cancelled,
      "Ca đã hủy. Khôi phục ca trước khi sửa phân công hoặc kết quả.",
    );
    if (data.remove) {
      check(!isShiftPublished(s, shift) && !shift.wasPublished && !shift.withdrawnOn, "Chỉ bỏ ca chưa từng công bố.");
      s.shifts = s.shifts.filter((t) => t.id !== shift.id);
      note(`Bỏ ca ${shift.id}`);
      return;
    }
    const position = Number(data.position);
    const adminIds = adminMemberIds(club);
    // Current clients address the visible roster. Older callers without an
    // assignment ID still address the original positions in storage.
    const assignments = data.assignmentMemberId === undefined
      ? shift.assignments : rosterAssignments(shift.assignments, adminIds);
    check(
      Number.isInteger(position) && position >= 0 && position < Math.max(shiftCapacity(shift), assignments.length),
      "Vị trí không hợp lệ.",
    );
    let a = assignments[position];
    check(!a || !adminIds.has(a.memberId), "Phân công trực dành cho tài khoản thành viên.");
    if (data.assignmentMemberId !== undefined) {
      check((a?.memberId ?? null) === data.assignmentMemberId, "Phân công vừa thay đổi. Mở lại ca để thử lại.");
    }
    if (data.replacementId !== undefined) {
      check(!shift.draft || canEditDutyDraft(shift, new Date(), adminIds) ||
        canReplanDutyShift(s, shift, adminIds) || a?.manual, "Công bố lại ca trước khi đổi người đã xác minh.");
      const replacement = club.members.find(
        (m) => m.id === data.replacementId && m.active && isRosterMember(m),
      );
      check(
        replacement && replacement.joined <= shift.date,
        "Thành viên chưa hoạt động vào ngày trực.",
      );
      check(
        !shift.assignments.some(
          (other, i) => i !== position && other.memberId === replacement.id,
        ),
        "Thành viên đã có trong ca này.",
      );
      check(
        availabilityForDuty(club, replacement, shift.date, shift.period, shift)
          .available,
        "Thành viên không rảnh trong ca này theo dữ liệu hiện tại.",
      );
      if (a) {
        a.originalId ??= a.memberId;
        a.memberId = replacement.id;
        a.result = "unverified";
        a.late = false;
        a.note = "";
        a.availabilityNote = availabilityForDuty(
          club,
          replacement,
          shift.date,
          shift.period,
          shift,
        ).note;
      } else {
        a = {
          memberId: replacement.id,
          result: "unverified",
          late: false,
          availabilityNote: availabilityForDuty(
            club,
            replacement,
            shift.date,
            shift.period,
            shift,
          ).note,
        };
        shift.assignments.push(a);
      }
      note(`Đổi người ca ${shift.id}: ${replacement.name}`);
    }
    if (data.result !== undefined) {
      check(isShiftPublished(s, shift), "Công bố ca trước khi ghi nhận kết quả.");
      check(a, "Ca chưa có người.");
      check(
        [
          "unverified",
          "completed",
          "unexcused",
          "excused",
          "cancelled",
        ].includes(data.result),
        "Kết quả không hợp lệ.",
      );
      a.result = data.result as DutyResult;
      if (["unexcused", "excused", "cancelled"].includes(a.result)) {
        a.late = false;
      }
      note(`Xác minh ca ${shift.id}: ${data.result}`);
    }
    if (data.late !== undefined) {
      check(
        isShiftPublished(s, shift) && a,
        "Công bố lịch và phân người trước khi ghi nhận đến muộn.",
      );
      check(typeof data.late === "boolean", "Ô đến muộn không hợp lệ.");
      check(
        !data.late || !["unexcused", "excused", "cancelled"].includes(a.result),
        "Người vắng hoặc ca hủy không ghi nhận đến muộn.",
      );
      a.late = data.late;
      note(`Ghi nhận đến muộn ca ${shift.id}: ${data.late ? "Có" : "Không"}`);
    }
    if (data.note !== undefined) {
      check(a, "Ca chưa có người.");
      a.note = str(data.note, 1000);
      note(`Cập nhật ghi chú ca ${shift.id}`);
    }
  } else if (action === "member") {
    let m = data.memberId ? getMember() : null;
    const { position } = data;
    check(position === undefined || position === "" || isMemberPosition(position), "Chức vụ không hợp lệ.");
    check(!isMemberPosition(position) || (data.role ?? m?.role) !== "admin", "Chức vụ này chỉ dành cho tài khoản thành viên.");
    let selection: unknown = data.committees;
    if (selection === undefined && data.committee !== undefined) {
      // A single-select client cannot safely edit a profile with multiple committees.
      check(!m || memberCommittees(m).length <= 1, "Thành viên thuộc nhiều ban. Vui lòng tải lại trang để chỉnh sửa.");
      selection = data.committee === "" ? [] : [data.committee];
    }
    check(selection === undefined || (Array.isArray(selection) && selection.every(isCommitteeKind)), "Ban của thành viên không hợp lệ.");
    if (!m) {
      const studentId = str(data.studentId, 30),
        name = str(data.name, 100);
      checkStudentId(studentId);
      check(!club.members.some((existing) => existing.needsStudentId && personKey(existing.name) === personKey(name)), "Tên này đã có hồ sơ chờ MSSV. Hãy bổ sung MSSV tại hồ sơ hiện có.");
      check(
        name.length > 1 && /^[a-zA-Z0-9._-]{3,30}$/.test(studentId),
        "Nhập MSSV và họ tên hợp lệ.",
      );
      check(
        !club.members.some(
          (m) => m.studentId.toLowerCase() === studentId.toLowerCase(),
        ),
        "MSSV đã tồn tại.",
      );
      m = {
        id: uid(),
        name,
        studentId,
        email: str(data.email, 200),
        role: "member",
        active: true,
        joined: today(),
        availability: [],
        extraDuties: false,
      };
      club.members.push(m);
    } else {
      if (
        data.studentId !== undefined &&
        str(data.studentId, 30) !== m.studentId
      ) {
        const studentId = str(data.studentId, 30);
        checkStudentId(studentId);
        check(
          /^[a-zA-Z0-9._-]{3,30}$/.test(studentId),
          "MSSV cần có 3–30 ký tự hợp lệ.",
        );
        check(
          !club.members.some(
            (other) =>
              other.id !== data.memberId &&
              other.studentId.toLowerCase() === studentId.toLowerCase(),
          ),
          "MSSV đã tồn tại.",
        );
        m.studentId = studentId;
        m.needsStudentId = false;
      }
      if (data.name) m.name = str(data.name, 100);
      if (data.email !== undefined) m.email = str(data.email, 200);
      if (data.active !== undefined && !!data.active !== m.active) {
        check(
          m.userId !== club.ownerId,
          "Không thể ngừng hoạt động tài khoản chủ quản trị.",
        );
        if (!data.active) endSharingForMember(club, m.id);
        setMemberActive(m, !!data.active);
      }
      if (data.role) {
        check(["admin", "member"].includes(data.role), "Vai trò không hợp lệ.");
        check(
          m.userId !== club.ownerId || data.role === "admin",
          "Không thể hạ quyền chủ quản trị.",
        );
        if (data.role === "admin" && m.role !== "admin") endSharingForMember(club, m.id);
        m.role = data.role;
      }
    }
    if (m.role === "admin" || position === "") delete m.position;
    else if (isMemberPosition(position)) m.position = position;
    if (selection !== undefined) {
      const selected = committeeKinds.filter(kind => selection.includes(kind));
      delete m.committee;
      delete m.committees;
      if (selected.length === 1) m.committee = selected[0];
      if (selected.length > 1) m.committees = selected;
    }
    if (data.extraDuties !== undefined) m.extraDuties = !!data.extraDuties;
    if (data.availability) {
      check(
        Array.isArray(data.availability) &&
          data.availability.every((x: unknown) =>
            /^[0-6]-(am|pm)$/.test(String(x)),
          ),
        "Lịch rảnh không hợp lệ.",
      );
      setProfileAvailability(club, m, [...new Set<string>(data.availability)]);
    }
    syncWeeks(club);
    note(`Cập nhật thành viên ${m.name}`);
  } else if (action === "activateAvailabilityDetails") {
    const capacity = getCapacity();
    const dataset = club.availabilityDataset;
    check(dataset?.rows.length, "Chưa có file lịch rảnh chi tiết.");
    check(
      /^\d{4}-(0[1-9]|1[0-2])$/.test(data.month),
      "Tháng xếp lịch không hợp lệ.",
    );
    check(
      !club.schedules.find((s) => s.month === data.month)?.published,
      "Tháng này đã có lịch công bố. Không thể thay bằng bản nháp.",
    );
    const settings: AvailabilitySettings = {
      anchorDate: str(data.anchorDate, 10),
      anchorWeek: Number(data.anchorWeek),
      startDate: str(data.startDate, 10),
      amStart: str(data.amStart, 5),
      amEnd: str(data.amEnd, 5),
      pmStart: str(data.pmStart, 5),
      pmEnd: str(data.pmEnd, 5),
      allowedLateMinutes: Number(data.allowedLateMinutes),
      ignoreSourceNotes: true,
    };
    check(
      validDate(settings.anchorDate) && validDate(settings.startDate),
      "Mốc tuần học và ngày bắt đầu trực không hợp lệ.",
    );
    check(
      Number.isInteger(settings.anchorWeek) &&
        settings.anchorWeek >= 1 &&
        settings.anchorWeek <= 53,
      "Số tuần học phải từ 1–53.",
    );
    check(
      Number.isInteger(settings.allowedLateMinutes) &&
        settings.allowedLateMinutes >= 0 &&
        settings.allowedLateMinutes <= 60,
      "Mức đến muộn cho phép cần từ 0–60 phút.",
    );
    check(
      clockMinutes(settings.amStart) < clockMinutes(settings.amEnd) &&
        clockMinutes(settings.amEnd) <= clockMinutes(settings.pmStart) &&
        clockMinutes(settings.pmStart) < clockMinutes(settings.pmEnd),
      "Khung giờ ca sáng/chiều không hợp lệ.",
    );
    validateDetailRows(dataset.rows, settings);
    const links: Record<string, string> = {};
    for (const row of dataset.rows) {
      const key = personKey(row.name);
      if (links[key]) continue;
      const linked = dataset.memberLinks?.[key];
      let member = linked
        ? club.members.find((m) => m.id === linked)
        : undefined;
      if (!member) {
        const matches = club.members.filter((m) => personKey(m.name) === key);
        check(
          matches.length <= 1,
          `Có nhiều hồ sơ trùng tên ${row.name}. BĐH cần phân biệt trước khi áp dụng.`,
        );
        member = matches[0];
      }
      if (!member) {
        member = {
          id: uid(),
          name: row.name,
          studentId: "",
          role: "member",
          active: true,
          joined: today(),
          availability: [],
          extraDuties: false,
          needsStudentId: true,
        };
        club.members.push(member);
      }
      links[key] = member.id;
    }
    dataset.settings = settings;
    dataset.memberLinks = links;
    club.activeAvailabilityDataset = structuredClone(dataset);
    syncProfileTicks(club, club.activeAvailabilityDataset, new Set(Object.values(links)));
    club.availabilityVersion = new Date().toISOString();
    syncWeeks(club);
    const draft = makeSchedule(club, data.month, capacity);
    club.peoplePerShift = capacity;
    club.schedules = club.schedules.filter((s) => s.month !== data.month);
    club.schedules.push(draft);
    note(
      `Áp dụng lịch rảnh theo tuần học từ ${settings.startDate}; ${Object.keys(links).length} người; cho phép đến muộn ${settings.allowedLateMinutes} phút`,
    );
  } else if (action === "importAvailabilityDetails") {
    check(
      Array.isArray(data.rows) &&
        data.rows.length > 0 &&
        data.rows.length <= 5000,
      "File cần có 1–5.000 dòng lịch rảnh.",
    );
    const rows: AvailabilityDetail[] = data.rows.map(
      (row: Record<string, unknown>) => {
        check(row && typeof row === "object", "Dòng lịch rảnh không hợp lệ.");
        const sourceRow = Number(row.sourceRow);
        check(
          Number.isInteger(sourceRow) && sourceRow >= 2 && sourceRow <= 5001,
          "Số dòng nguồn không hợp lệ.",
        );
        const name = str(row.name, 100),
          day = str(row.day, 30),
          period = str(row.period, 100),
          weeks = str(row.weeks, 200);
        check(
          name.length >= 2 && day && period && weeks,
          `Dòng ${sourceRow} thiếu họ tên, thứ, buổi hoặc tuần học.`,
        );
        return {
          sourceRow,
          name,
          day,
          period,
          weeks,
          note: str(row.note, 1000),
        };
      },
    );
    const activeDataset = activeAvailabilityDatasetFor(club);
    if (activeDataset && !club.activeAvailabilityDataset)
      club.activeAvailabilityDataset = structuredClone(activeDataset);
    club.availabilityDataset = {
      filename: str(data.filename, 200) || "Lịch rảnh chi tiết.xlsx",
      importedAt: new Date().toISOString(),
      importedBy: me.name,
      rows,
    };
    if (data.syncProfiles && activeDataset?.settings) {
      syncAvailabilityProfiles(club, club.availabilityDataset);
    }
    note(
      `Nhập lịch rảnh chi tiết: ${rows.length} dòng; giữ nguyên điều kiện tuần học và khung giờ`,
    );
  } else if (action === "import") {
    check(
      Array.isArray(data.rows) &&
        data.rows.length > 0 &&
        data.rows.length <= 1500,
      "File phải có 1–1500 thành viên.",
    );
    const ids = new Set();
    if (data.kind === "availability")
      for (const m of club.members) m.availability = applyAvailabilityOverrides(m, []);
    for (const row of data.rows) {
      const studentId = str(row.studentId, 30),
        name = str(row.name, 100);
      checkStudentId(studentId);
      check(
        /^[a-zA-Z0-9._-]{3,30}$/.test(studentId) && name.length > 1,
        `Dòng MSSV ${studentId || "trống"} thiếu dữ liệu hợp lệ.`,
      );
      check(
        !ids.has(studentId.toLowerCase()),
        `MSSV ${studentId} bị trùng trong file.`,
      );
      ids.add(studentId.toLowerCase());
      let m = club.members.find(
        (m) => m.studentId.toLowerCase() === studentId.toLowerCase(),
      );
      if (!m) {
        check(!club.members.some((existing) => existing.needsStudentId && personKey(existing.name) === personKey(name)), `Hồ sơ ${name} đang chờ MSSV. Hãy bổ sung MSSV trong danh sách thành viên trước khi nhập file để giữ lịch trực hiện có.`);
        m = {
          id: uid(),
          studentId,
          name,
          email: str(row.email, 200),
          active: true,
          joined: today(),
          role: "member",
          availability: [],
          extraDuties: false,
        };
        club.members.push(m);
      }
      m.name = name;
      if (row.email) m.email = str(row.email, 200);
      if (data.kind === "availability") {
        check(
          Array.isArray(row.availability) &&
            row.availability.every((x: unknown) =>
              /^[0-6]-(am|pm)$/.test(String(x)),
            ),
          "Lịch rảnh không hợp lệ.",
        );
        m.availability = applyAvailabilityOverrides(m, row.availability);
        m.extraDuties = !!row.extraDuties;
      }
    }
    if (data.kind === "availability") {
      delete club.activeAvailabilityDataset;
      if (club.availabilityDataset) {
        delete club.availabilityDataset.settings;
        delete club.availabilityDataset.memberLinks;
      }
      club.availabilityVersion = new Date().toISOString();
    }
    syncWeeks(club);
    note(
      `Nhập ${data.rows.length} dòng ${data.kind === "availability" ? "lịch rảnh" : "thành viên"}`,
    );
  } else if (action === "settings") {
    if (data.name) club.name = str(data.name, 80);
    if (data.days) {
      check(
        Array.isArray(data.days) &&
          data.days.length > 0 &&
          data.days.every(
            (d: unknown) =>
              Number.isInteger(d) && Number(d) >= 0 && Number(d) < 7,
          ),
        "Chọn ngày trực hợp lệ.",
      );
      club.days = [...new Set<number>(data.days)];
    }
    if (data.rule) {
      const r = data.rule;
      check(
        /^\d{4}-(0[1-9]|1[0-2])$/.test(r.month),
        "Tháng áp dụng không hợp lệ.",
      );
      check(
        r.month >= today().slice(0, 7),
        "Chỉ đổi hệ số từ tháng hiện tại trở đi.",
      );
      const previousRule = rulesFor(club, r.month);
      const D = r.D ?? previousRule.D ?? 0;
      const E = r.E ?? previousRule.E;
      for (const value of [r.A, r.B, r.C, D, E])
        check(
          Number.isFinite(value) && value >= 0 && value <= 100000,
          "Hệ số điểm phải là số không âm.",
        );
      const previous = previousRule.activities ?? {};
      const activities: ActivityRates = { ...previous };
      for (const kind of ratedActivityKinds) {
        const value = r.activities?.[kind] ?? previous[kind] ?? 0;
        check(typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100000,
          "Điểm mỗi lượt phải là số không âm, tối đa 100.000.");
        activities[kind] = value;
      }
      club.rules = club.rules.filter((rule) => rule.month !== r.month);
      club.rules.push({ month: r.month, A: r.A, B: r.B, C: r.C, D, E, activities, committees: previousRule.committees });
    }
    note("Cập nhật cấu hình Đội");
  } else if (action === "activateOfficialRoster") {
    const dataset = activeAvailabilityDatasetFor(club);
    const ids = new Set(
      Object.values(dataset?.memberLinks ?? {}),
    );
    check(ids.size > 0, "Chưa có danh sách được ghép từ file lịch rảnh.");
    check(
      [...ids].every((id) => club.members.some((m) => m.id === id)),
      "Có hồ sơ trong file chưa được lưu.",
    );
    const penalty = Number(data.latePenalty);
    check(
      Number.isFinite(penalty) && penalty >= 0 && penalty <= 100000,
      "Mức trừ đi muộn không hợp lệ.",
    );
    if (club.demo) {
      const sampleIds = new Set(
        club.members
          .filter(
            (m) => m.id.startsWith("demo-") && !ids.has(m.id) && !m.userId,
          )
          .map((m) => m.id),
      );
      const sampleSchedules = club.schedules.filter(
        (s) =>
          !s.sourceFilename &&
          s.shifts.some((t) =>
            t.assignments.some((a) => sampleIds.has(a.memberId)),
          ),
      );
      club.demoArchive = {
        archivedAt: new Date().toISOString(),
        members: club.members.filter((m) => sampleIds.has(m.id)),
        weeks: club.weeks,
        schedules: sampleSchedules,
      };
      eraseSharingMembers(club, sampleIds);
      club.members = club.members.filter((m) => !sampleIds.has(m.id));
      eraseFeedbackMembers(club, sampleIds);
      club.weeks = [];
      club.schedules = club.schedules.filter(
        (s) => !sampleSchedules.includes(s),
      );
      club.demo = false;
      syncWeeks(club);
    }
    club.officialSince ??= new Date().toISOString();
    const months = new Set([
      today().slice(0, 7),
      dataset?.settings?.startDate.slice(0, 7) ??
        today().slice(0, 7),
    ]);
    for (const month of months) {
      const current = rulesFor(club, month);
      club.rules = club.rules.filter((r) => r.month !== month);
      club.rules.push({ ...current, month, D: penalty });
    }
    note(
      `Đưa ${ids.size} thành viên từ file vào hệ thống chính thức; mức trừ đi muộn D=${penalty}`,
    );
  } else if (action === "demo") {
    check(
      !club.demo &&
        club.members.length === 1 &&
        club.members[0].userId === identity.userId &&
        !club.schedules.length &&
        club.weeks.every(
          (w) =>
            !w.closed && w.entries.every((e) => e.status === "unregistered"),
        ),
      "Chỉ nạp mẫu khi chưa có dữ liệu hoạt động.",
    );
    Object.assign(club, demoClub(club.ownerId, me));
    note("Nạp dữ liệu mẫu để trải nghiệm");
  } else if (action === "resetDemo") {
    check(club.demo, "Chỉ có thể xóa dữ liệu mẫu.");
    check(data.confirm === "BAT DAU", "Chưa xác nhận bắt đầu dữ liệu thật.");
    const real = createClub(club.ownerId);
    const linkedIds = new Set(
      Object.values(activeAvailabilityDatasetFor(club)?.memberLinks ?? {}),
    );
    real.members = [
      { ...me, joined: today(), availability: [] },
      ...club.members.filter(
        (m) => m.id !== me.id && (!!m.userId || linkedIds.has(m.id)),
      ),
    ];
    if (club.availabilityDataset)
      real.availabilityDataset = club.availabilityDataset;
    if (club.activeAvailabilityDataset)
      real.activeAvailabilityDataset = club.activeAvailabilityDataset;
    const remaining = new Set(real.members.map(member => member.id));
    const removed = new Set(club.members.filter(member => !remaining.has(member.id)).map(member => member.id));
    eraseFeedbackMembers(club, removed);
    eraseSharingMembers(club, removed);
    Object.assign(club, real);
    syncWeeks(club);
    note("Bắt đầu dữ liệu thật");
  } else throw new Error("Thao tác không được hỗ trợ.");
}
