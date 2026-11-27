"use client";
import Activities, { WeeklyActivityPoints } from "./activities";
import { visibleActivityKinds, activityLabels, eventForActivity, isEventOpen, ratedActivityKinds } from "../lib/activity";
import { eventEvidenceView } from "../lib/event-evidence";
import { canDeleteMember } from "../lib/member-deletion";
import { committeeKinds, committeeLabels, memberCommittees, memberCommitteeNames, matchesCommittee, type CommitteeFilter } from "../lib/committees";
import { availableDays, MemberProfile } from "./member-profile";
import { displayMessage } from "../lib/display-message";
import { resolveFont } from "../lib/interface-fonts";
import { sidebarTabs, sidebarTabLabels, type SidebarTab } from "../lib/workspace-navigation";
import { isMemberPosition, memberPositions, memberPositionLabels, memberRoleLabel } from "../lib/member-positions";
import { FontSettings } from "./font-settings";
import { AvatarEditor } from "./avatar-editor";
import { MemberMonthlyScoreboard, Scoreboard, type ScoreScope } from "./scoreboard";
import Login from "./login";
import MusicPlayer from "./music-player";
import AvailabilityPage, { AvailabilityPreview } from "./availability";
import DutyRegister from "./duty-register";
import DutyEvidenceAction from "./duty-evidence";
import SharedLinks from "./shared-links";
import BulletinBoard from "./bulletin-board";
import { evidenceSubmissionOpen } from "../lib/duty-evidence";
import { activeAvailabilityDatasetFor, availabilityForDuty, profileAvailability, profileAvailabilityRows } from "../lib/availability";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bell,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  Clock3,
  Coffee,
  FileSpreadsheet,
  HeartHandshake,
  ImagePlus,
  LayoutDashboard,
  Leaf,
  Link2,
  ListFilter,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Newspaper,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Sunset,
  Trash2,
  Upload,
  UserCheck,
  UserRound,
  Users,
  WandSparkles,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  addDays,
  dateLabel,
  dutyNames,
  monthLabel,
  reportMembers,
  rulesFor,
  scoreFor,
  shiftCapacity,
  canReplanDutyShift,
  createDutyShiftSlots,
  isDutyReportShift,
  isShiftPublished,
  statusNames,
  today,
  weekId,
  weekday,
  type Entry,
  type Member,
  type Registration,
  type Shift,
  type View,
  type Week,
} from "../lib/club";
import {
  Avatar,
  Badge,
  Brand,
  Button,
  Dialog,
  Empty,
  Field,
  FormFooter,
  LinkButton,
  Loading,
  PanelHead,
  Stat,
} from "./ui";

type Tab =
  | "weeklyScores"
  | "overview"
  | "meetings"
  | "requests"
  | "duties"
  | "bulletin"
  | "links"
  | "members"
  | "reports"
  | "settings"
  | "preferences"
  | "personal";
type Modal = {
  title: string;
  description?: string;
  wide?: boolean;
} & (
  | { content: ReactNode; profile?: never }
  | { profile: { memberId: string; scheduleOnly: boolean }; content?: never }
);
const sidebarGroups: Record<SidebarTab, { icon: LucideIcon; sections: readonly [Tab, ...Tab[]] }> = {
  scoreboard: { icon: ClipboardCheck, sections: ["weeklyScores", "reports"] },
  activity: { icon: CalendarDays, sections: ["meetings", "duties", "requests"] },
  bulletin: { icon: Newspaper, sections: ["bulletin"] },
  links: { icon: Link2, sections: ["links"] },
  members: { icon: Users, sections: ["members"] },
  personal: { icon: UserRound, sections: ["personal"] },
};
const getForm = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget));
};
const scoreRateFields = [
  ["A", "Cộng mỗi ca trực đủ"],
  ["B", "Trừ mỗi ca trực vắng không phép"],
  ["C", "Trừ mỗi buổi họp vắng không phép"],
  ["D", "Trừ mỗi lượt đi muộn"],
  ["E", "Cộng mỗi phiếu điểm danh đạt"],
] as const;
function parseScoreRate(value: FormDataEntryValue | undefined) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^(?:\d+|\d*[.,]\d+)(?:e[+-]?\d+)?$/i.test(text)
    ? Number(text.replace(",", "."))
    : NaN;
}
function ScoreRateInput({ name, value }: { name: string; value: number }) {
  return <input name={name} inputMode="decimal" defaultValue={String(value).replace(".", ",")} required />;
}
const digits = (number: number) => String(number).padStart(2, "0");

export default function Workspace() {
  const [view, setView] = useState<View | null>(null);
  const savedFont = resolveFont(view?.me?.fontPreference);
  useLayoutEffect(() => {
    document.documentElement.dataset.font = savedFont;
  }, [savedFont]);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [memberSection, setMemberSection] = useState<"profiles" | "availability">("profiles");
  const [editingWeeklyPoints, setEditingWeeklyPoints] = useState(false);
  const [committeeFilter, setCommitteeFilter] = useState<CommitteeFilter>("all");
  const [scoreScope, setScoreScope] = useState<ScoreScope>("team");
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(weekId);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [dutyWeek, setDutyWeek] = useState(weekId);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const profileId = modal?.profile?.memberId;
  const [avatarEditing, setAvatarEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const closeModal = useCallback(() => setModal(null), []);
  const closeAvatar = useCallback(() => setAvatarEditing(false), []);
  const notify = (text: string, error = false) => setToast({ text: displayMessage(text), error });
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/workspace", { cache: "no-store", signal });
      if (signal?.aborted) return;
      if (r.status === 401) {
        setView(null);
        setAuth(true);
        return;
      }
      const data = (await r.json()) as View & { error?: string };
      if (signal?.aborted) return;
      if (!r.ok) throw new Error(data.error || "Không tải được dữ liệu");
      setView(current => signal && current && current.revision > data.revision ? current : data);
      setAuth(false);
      setLoadError("");
    } catch (e) {
      if (!signal?.aborted) setLoadError(displayMessage(e instanceof Error ? e.message : "Không tải được dữ liệu"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    if (tab !== "members") return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, tab, profileId]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.error ? 7500 : 4000);
    return () => clearTimeout(t);
  }, [toast]);
  async function logoutAccount() {
    try {
      await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
    } finally {
      setView(null);
      setAuth(true);
      closeModal();
      closeAvatar();
    }
  }
  async function savePassword(
    action: "account" | "password",
    data: Record<string, unknown>,
  ) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const result = (await r.json()) as { error?: string; login?: string };
      if (!r.ok) throw new Error(result.error || "Không lưu được mật khẩu");
      closeModal();
      notify(
        result.login
          ? `Đã cấp mật khẩu, tên đăng nhập: ${result.login}`
          : "Đã đổi mật khẩu",
      );
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không lưu được mật khẩu", true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function passwordDialog(member?: Member) {
    setModal({
      title: member ? `Cấp mật khẩu · ${member.name}` : "Đổi mật khẩu",
      description: member
        ? member.loginName
          ? `Tên đăng nhập: ${member.loginName}, thành viên cũng có thể dùng MSSV sau khi bổ sung hồ sơ`
          : "Thành viên đăng nhập bằng MSSV/tên đăng nhập được cấp, không cần tài khoản OpenAI"
        : "Mật khẩu mới cần ít nhất 8 ký tự",
      content: (
        <form
          onSubmit={(e) => {
            const f = getForm(e);
            if (f.password !== f.confirm) {
              notify("Hai mật khẩu chưa trùng nhau", true);
              return;
            }
            savePassword(member ? "account" : "password", {
              ...f,
              memberId: member?.id,
            });
          }}
        >
          {member?.needsStudentId && !member.loginName ? (
            <Field label="Tên đăng nhập được cấp">
              <input name="login" required minLength={3} maxLength={30} pattern="[a-zA-Z0-9._-]+" placeholder="Ví dụ: lethutrang" autoComplete="username" />
            </Field>
          ) : null}
          {!member ? (
            <Field label="Mật khẩu hiện tại">
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
              />
            </Field>
          ) : null}
          <Field label="Mật khẩu mới">
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
          </Field>
          <Field label="Nhập lại mật khẩu mới">
            <input
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
            />
          </Field>
          <FormFooter
            label={member ? "Cấp mật khẩu" : "Đổi mật khẩu"}
            onCancel={closeModal}
            busy={busy}
          />
        </form>
      ),
    });
  }
  function ownProfileDialog() {
    setModal({
      title: "Hồ sơ của tôi",
      description: "Cập nhật thông tin cá nhân, tên đăng nhập được cấp vẫn sử dụng được sau khi bổ sung MSSV",
      content: (
        <form onSubmit={(e) => act("profile", getForm(e), "Đã cập nhật hồ sơ")}>
          <Field label="Họ và tên"><input name="name" defaultValue={view?.me?.name} required minLength={2} maxLength={100} /></Field>
          <Field label="Mã số sinh viên"><input name="studentId" defaultValue={view?.me?.studentId} required minLength={3} maxLength={30} /></Field>
          <Field label="Email liên hệ (không bắt buộc)"><input name="email" type="email" defaultValue={view?.me?.email} maxLength={200} /></Field>
          <FormFooter onCancel={closeModal} busy={busy} />
        </form>
      ),
    });
  }
  async function act(
    action: string,
    data: Record<string, unknown>,
    message = "Đã lưu thay đổi",
    close = true,
  ) {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await fetch("/api/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, data }),
      });
      const result = (await r.json()) as View & { error?: string; notice?: string };
      if (!r.ok) throw new Error(result.error || "Không lưu được dữ liệu");
      setView(current => current && current.me?.id === result.me?.id && current.revision > result.revision ? current : result);
      if (close) closeModal();
      notify(result.notice ?? message);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không lưu được dữ liệu", true);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const go = (next: Tab) => {
    setTab(next);
    setEditingWeeklyPoints(false);
    setFilter("all");
    setSearch("");
    setPage(0);
    setMobileNav(false);
    window.scrollTo(0, 0);
  };
  if (loading) return <Loading />;
  if (auth) return <Login onSuccess={load} />;
  if (!view)
    return (
      <div className="welcome">
        <Brand />
        <Empty title="Chưa kết nối được dữ liệu">{loadError}</Empty>
        <Button onClick={() => void load()}>
          <RefreshCw size={16} /> Thử lại
        </Button>
      </div>
    );
  const { club, me, isAdmin } = view;
  if (view.setup || (me?.active && me.needsStudentId && !isAdmin))
    return (
      <div className="welcome setup">
        <Brand />
        <span className="eyebrow">BẮT ĐẦU MỘT NHỊP MỚI</span>
        <h1>Hoàn tất hồ sơ của bạn</h1>
        <p>Bổ sung MSSV để bắt đầu, lịch trực đã được gắn với hồ sơ của bạn</p>
        <form
          onSubmit={(e) => {
            const f = getForm(e);
            act("profile", f, "Chào mừng bạn đến với Đội");
          }}
        >
          <Field label="Họ và tên">
            <input
              name="name"
              defaultValue={
                me?.name ?? (view.identity.name.includes("@") ? "" : view.identity.name)
              }
              placeholder="Nguyễn Minh Anh"
              required
              minLength={2}
              maxLength={100}
            />
          </Field>
          <Field label="Mã số sinh viên">
            <input
              name="studentId"
              defaultValue={me?.studentId}
              placeholder="Nhập MSSV của bạn"
              required
              minLength={3}
              maxLength={30}
            />
          </Field>
          <Field label="Email liên hệ (không bắt buộc)">
            <input name="email" type="email" defaultValue={me?.email} maxLength={200} placeholder="Nhập email liên hệ nếu có" />
          </Field>
          <div className="identity-note">
            <ShieldCheck size={16} />
            <span>Tên đăng nhập được cấp: {me?.loginName || me?.studentId || view.identity.email}</span>
          </div>
          <Button type="submit" disabled={busy}>
            Vào không gian Đội <ArrowRight size={16} />
          </Button>
        </form>
        <Button variant="secondary" onClick={logoutAccount}>Đăng xuất</Button>
        {toast ? (
          <div className={`toast ${toast.error ? "error" : ""}`} role="alert">
            {toast.text}
          </div>
        ) : null}
      </div>
    );
  if (!me?.active)
    return (
      <div className="welcome">
        <Brand />
        <Empty title="Tài khoản đã ngừng hoạt động">
          Liên hệ BĐH để mở lại tài khoản của bạn
        </Empty>
        <Button variant="secondary" onClick={logoutAccount}>
          Đăng xuất
        </Button>
      </div>
    );
  const activeTab = !isAdmin && (tab === "overview" || tab === "settings") ? "personal" : tab;
  const activeSidebarTab = sidebarTabs.find(id => sidebarGroups[id].sections.includes(activeTab));
  const headerTitle = activeSidebarTab ? sidebarTabLabels[activeSidebarTab]
    : activeTab === "overview" ? "Tổng quan" : activeTab === "settings" ? "Cài đặt Đội" : "Cài đặt cá nhân";
  const week =
    club.weeks.find((w) => w.id === selectedWeek) ?? club.weeks.at(-1)!;
  const weeklyScores = (view.weeklyScores ?? []).filter(score => score.week === week.id);
  const currentWeek = club.weeks.find((w) => w.id === weekId())!;
  const findMember = (id: string) => club.members.find((m) => m.id === id);
  const profileMember = profileId ? findMember(profileId) : undefined;
  const pending = club.weeks.flatMap((w) =>
    !w.closed && !w.cancelled
      ? w.entries
          .filter((e) => e.status === "pending")
          .map((e) => ({ week: w, entry: e }))
      : [],
  );
  const currentDay = today();
  const activityPending = (club.activityRegistrations ?? []).filter(row => {
    if (row.kind !== "event" || row.status !== "pending") return false;
    const event = eventForActivity(club, row);
    return !!event && (event.requiresEvidence ? eventEvidenceView(row, event, me).canReview : isEventOpen(event, currentDay));
  }).length;
  const pendingTotal = pending.length + activityPending;
  const sectionOptions: { id: Tab; label: string; pending?: number }[] = activeSidebarTab === "scoreboard" ? [
    { id: "weeklyScores", label: "Điểm tuần" },
    { id: "reports", label: "Điểm tháng" },
  ] : activeSidebarTab === "activity" ? [
    { id: "meetings", label: "Đăng ký họp", pending: pending.length },
    { id: "duties", label: "Lịch trực C1" },
    { id: "requests", label: isAdmin ? "Tạo sự kiện" : "Sự kiện", pending: activityPending },
  ] : [];
  const count = (s: Registration) =>
    week.entries.filter((e) => e.status === s).length;
  const liveMembers = club.members.filter((m) => m.active);
  const ownEntry = currentWeek.entries.find((e) => e.memberId === me!.id);
  const activeDataset = activeAvailabilityDatasetFor(club);

  function editMeeting() {
    setModal({
      title: week.closed ? "Bổ sung ngày họp" : "Lịch họp tuần này",
      description:
        "Tuần tự mở từ thứ Hai đến Chủ nhật, ngày họp quyết định tháng thống kê",
      content: (
        <form
          onSubmit={(e) => {
            const f = getForm(e);
            act(
              "meeting",
              { ...f, week: week.id, cancelled: f.cancelled === "on" },
              "Đã cập nhật lịch họp",
            );
          }}
        >
          <div className="form-grid">
            <Field label="Ngày họp">
              <input
                name="meetingDate"
                type="date"
                min={week.id}
                max={addDays(week.id, 6)}
                defaultValue={week.meetingDate}
                required={week.closed}
              />
            </Field>
            <Field label="Giờ họp">
              <input
                name="time"
                type="time"
                defaultValue={week.time}
                required
                disabled={week.closed}
              />
            </Field>
          </div>
          <Field label="Địa điểm">
            <input
              name="location"
              defaultValue={week.location}
              disabled={week.closed}
              placeholder="Phòng C1.203"
            />
          </Field>
          <label className="checkbox-label">
            <input
              name="cancelled"
              type="checkbox"
              defaultChecked={week.cancelled}
              disabled={week.closed}
            />{" "}
            Tuần này không tổ chức họp
          </label>
          {week.closed ? (
            <Field label="Lý do bổ sung ngày họp">
              <textarea name="note" required minLength={3} placeholder="Ghi lý do để lưu vào nhật ký" />
            </Field>
          ) : null}
          <FormFooter busy={busy} onCancel={closeModal} />
        </form>
      ),
    });
  }
  function closeWeekDialog() {
    const n = count("pending") + count("unregistered");
    setModal({
      title: "Chốt cuộc họp",
      description: `Tuần ${dateLabel(week.id)} – ${dateLabel(addDays(week.id, 6), true)}`,
      content: (
        <>
          <div className="notice amber">
            <Clock3 size={20} />
            <div>
              <strong>{n} thành viên sẽ chuyển sang vắng</strong>
              <p>
                Gồm {count("pending")} yêu cầu chưa xử lý và{" "}
                {count("unregistered")} người chưa đăng ký, lý do xin vắng đã có
                vẫn được giữ lại
              </p>
            </div>
          </div>
          <p className="dialog-copy">
            Hãy rà soát ô vắng thực tế, có phép và đạt phiếu điểm danh trước khi chốt,
            sau khi chốt, thành viên không thể tự sửa đăng ký
          </p>
          <div className="form-footer">
            <Button variant="secondary" onClick={closeModal}>
              Quay lại kiểm tra
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                act("close", { week: week.id }, "Đã chốt cuộc họp")
              }
            >
              <CheckCheck size={16} /> Chốt cuộc họp
            </Button>
          </div>
        </>
      ),
    });
  }
  function reopenWeekDialog() {
    setModal({
      title: "Hủy chốt cuộc họp",
      description: `Tuần ${dateLabel(week.id)} – ${dateLabel(addDays(week.id, 6), true)}`,
      content: (
        <form onSubmit={(e) => act("reopen", { ...getForm(e), week: week.id }, "Đã hủy chốt cuộc họp")}>
          <p className="dialog-copy">
            Cuộc họp sẽ mở lại để điều chỉnh, điểm vắng họp tạm ngừng tính cho đến khi chốt lại
            {week.closingSnapshot
              ? " Các đăng ký chưa được BĐH sửa sẽ được khôi phục về trước khi chốt; kết quả BĐH đã xác minh được giữ lại"
              : " Cuộc họp này chưa có bản lưu trước khi chốt; dữ liệu điểm danh hiện tại sẽ được giữ nguyên để BĐH rà soát"}
            {week.id < weekId()
              ? " Đây là tuần đã qua: BĐH cần chốt lại sau khi chỉnh sửa; hệ thống không tự chốt lại tuần đang mở để sửa"
              : " Tuần hiện tại vẫn được tự chốt khi hết tuần"}
          </p>
          <Field label="Lý do hủy chốt">
            <textarea name="note" required minLength={3} maxLength={500} placeholder="Ví dụ: Cần rà soát lại danh sách điểm danh" />
          </Field>
          <div className="form-footer">
            <Button variant="secondary" onClick={closeModal}>Quay lại</Button>
            <Button type="submit" disabled={busy}>Hủy chốt cuộc họp</Button>
          </div>
        </form>
      ),
    });
  }
  function scheduleDialog(replan: boolean, capacity?: number) {
    setModal({
      title: replan ? "Xếp lại ca nháp trong tuần" : "Xếp lịch trực tuần",
      description: `Tuần ${dateLabel(dutyWeek, true)} – ${dateLabel(addDays(dutyWeek, 6), true)}`,
      content: (
        <form onSubmit={(e) => act("schedule", { ...getForm(e), week: dutyWeek }, "Đã xếp lịch nháp trong tuần")}>
          <Field label="Số người / 1 buổi trực C1">
            <input name="peoplePerShift" type="number" min={1} max={50} step={1} required defaultValue={capacity ?? club.peoplePerShift ?? 2} />
          </Field>
          <p className="hint">
            Nếu không đủ người rảnh, lịch sẽ hiển thị vị trí còn thiếu, người đã thêm thủ công vẫn có trong ca
          </p>
          <div className="form-footer">
            <Button variant="secondary" onClick={closeModal}>Quay lại</Button>
            <Button type="submit" disabled={busy}>Xếp lịch nháp</Button>
          </div>
        </form>
      ),
    });
  }
  function review(w: Week, entry: Entry, approved: boolean) {
    if (approved) {
      act(
        "review",
        { week: w.id, memberId: entry.memberId, approved: true },
        "Đã duyệt chuyển sang tham gia",
        false,
      );
      return;
    }
    setModal({
      title: "Từ chối yêu cầu",
      description: `Thành viên: ${findMember(entry.memberId)?.name}`,
      content: (
        <form
          onSubmit={(e) =>
            act(
              "review",
              {
                ...getForm(e),
                week: w.id,
                memberId: entry.memberId,
                approved: false,
              },
              "Đã từ chối yêu cầu",
            )
          }
        >
          <Field label="Lý do từ chối">
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              placeholder="Nhập lời nhắn để thành viên biết lý do…"
            />
          </Field>
          <FormFooter label="Gửi kết quả" onCancel={closeModal} busy={busy} />
        </form>
      ),
    });
  }
  function updateEntry(entry: Entry, data: Record<string, unknown>) {
    if (week.closed) {
      setModal({
        title: "Sửa kết quả đã chốt",
        description: findMember(entry.memberId)?.name,
        content: (
          <form
            onSubmit={(e) =>
              act(
                "entry",
                {
                  ...getForm(e),
                  ...data,
                  week: week.id,
                  memberId: entry.memberId,
                },
                "Đã cập nhật kết quả và lưu lịch sử",
              )
            }
          >
            <Field label="Lý do điều chỉnh">
              <textarea
                name="note"
                required
                minLength={3}
                placeholder="Ghi lý do sửa kết quả…"
              />
            </Field>
            <FormFooter onCancel={closeModal} />
          </form>
        ),
      });
    } else
      act(
        "entry",
        { ...data, week: week.id, memberId: entry.memberId },
        "Đã cập nhật điểm danh",
        false,
      );
  }
  function registerDialog(status: "absent" | "pending") {
    setModal({
      title:
        status === "absent" ? "Xin vắng buổi họp" : "Xin chuyển sang tham gia",
      description:
        status === "absent"
          ? "Lý do sẽ được gửi riêng đến BĐH"
          : "Yêu cầu được đưa vào nhóm chưa xử lý để BĐH duyệt",
      content: (
        <form
          onSubmit={(e) =>
            act(
              "register",
              { ...getForm(e), status },
              status === "absent"
                ? "Đã ghi nhận đăng ký xin vắng"
                : "Đã gửi yêu cầu đến BĐH",
            )
          }
        >
          <Field
            label={
              status === "absent" ? "Lý do xin vắng *" : "Lời nhắn gửi BĐH *"
            }
          >
            <textarea
              name="reason"
              required
              minLength={3}
              maxLength={500}
              defaultValue={status === "absent" ? ownEntry?.reason : ""}
              placeholder={
                status === "absent"
                  ? "Ví dụ: Em có lịch học bù…"
                  : "Em đã sắp xếp lại lịch và có thể tham gia…"
              }
            />
          </Field>
          <FormFooter label="Gửi đăng ký" onCancel={closeModal} busy={busy} />
        </form>
      ),
    });
  }
  function editMember(member?: Member) {
    const selectedCommittees = member ? memberCommittees(member) : [];
    const detailedAvailability = member ? profileAvailabilityRows(club, member) : [];
    const selectedAvailability = member ? profileAvailability(club, member, detailedAvailability) : [];
    setModal({
      title: member ? "Hồ sơ thành viên" : "Thêm thành viên",
      description:
        "Email là thông tin liên hệ, thành viên dùng MSSV và mật khẩu để đăng nhập",
      wide: true,
      content: (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const f = Object.fromEntries(form);
            act(
              "member",
              {
                ...f,
                memberId: member?.id,
                committees: form.getAll("committees"),
                role: f.role === "admin" ? "admin" : "member",
                position: isMemberPosition(f.role) ? f.role : "",
                ...(member ? { active: f.active === "true" } : {}),
                extraDuties: f.extraDuties === "on",
                ...(member ? { availability: form.getAll("availability") } : {}),
              },
              "Đã lưu thành viên",
            );
          }}
        >
          <div className="form-grid">
            <Field label="Họ và tên">
              <input
                name="name"
                required
                minLength={2}
                defaultValue={member?.name}
              />
            </Field>
            <Field label="MSSV">
              <input
                name="studentId"
                required
                minLength={3}
                defaultValue={member?.studentId}
                readOnly={!!member && !member.needsStudentId}
              />
            </Field>
          </div>
          <Field label="Email đăng nhập">
            <input
              name="email"
              type="email"
              defaultValue={member?.email}
              placeholder="Email liên hệ của thành viên"
            />
          </Field>
          <fieldset className="member-committees">
            <legend className="field-label">Ban của thành viên</legend>
            <p className="hint">Có thể chọn nhiều ban, để trống nếu chưa phân ban</p>
            <div className="committee-options">
              {committeeKinds.map(kind => (
                <label key={kind}>
                  <input type="checkbox" name="committees" value={kind} defaultChecked={selectedCommittees.includes(kind)} />
                  {committeeLabels[kind]}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Vai trò">
            <select name="role" defaultValue={member?.role === "admin" ? "admin" : member?.position ?? "member"}>
              <option value="member">Thành viên</option>
              {memberPositions.map(position => <option key={position} value={position}>{memberPositionLabels[position]}</option>)}
              {member && <option value="admin">Ban điều hành</option>}
            </select>
          </Field>
          {member ? (
            <Field label="Trạng thái hoạt động">
              <select name="active" defaultValue={String(member.active)}>
                <option value="true">Đang hoạt động</option>
                <option value="false">Tạm nghỉ</option>
              </select>
              <small className="hint">Thành viên vẫn có tên trong bảng điểm tuần bấm tạm nghỉ, từ thứ Hai kế tiếp, bảng điểm và Excel sẽ ẩn thành viên này</small>
            </Field>
          ) : null}
          <label className="checkbox-label">
            <input
              name="extraDuties"
              type="checkbox"
              defaultChecked={member?.extraDuties}
            />{" "}
            Muốn trực thêm ngoài mức ưu tiên 2 ca/tháng
          </label>
          {member ? (
            <div className="availability-editor">
              <span className="field-label">Lịch rảnh sáng / chiều</span>
              <p className="hint">Tích hoặc bỏ tích rồi lưu để cập nhật dữ liệu xếp lịch, các khung từ Excel áp dụng theo giờ và tuần học trong file</p>
              <div className="availability-grid">
                <span />
                <strong>Sáng</strong>
                <strong>Chiều</strong>
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <div className="availability-row" key={d}>
                    <span>{d === 0 ? "Chủ nhật" : `Thứ ${d + 1}`}</span>
                    {["am", "pm"].map((p) => (
                      <label key={p}>
                        <input
                          aria-label={`${d === 0 ? "Chủ nhật" : `Thứ ${d + 1}`} ${p === "am" ? "sáng" : "chiều"}`}
                          type="checkbox"
                          name="availability"
                          value={`${d}-${p}`}
                          defaultChecked={selectedAvailability.includes(
                            `${d}-${p}`,
                          )}
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              {detailedAvailability.length ? (
                <details className="hint">
                  <summary>Lịch rảnh theo Excel</summary>
                  <ul>
                    {detailedAvailability.map((row, index) => (
                      <li key={`${row.sourceRow}-${index}`}>
                        {row.day} · {row.period} · {row.weeks ? `Tuần ${row.weeks}` : "Chưa ghi tuần học"}
                        {row.note ? ` · ${row.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ) : null}
          <FormFooter onCancel={closeModal} busy={busy} />
        </form>
      ),
    });
  }
  function importDialog(kind: "members" | "availability") {
    setModal({
      title:
        kind === "availability"
          ? "Nhập lịch rảnh từ Excel"
          : "Nhập danh sách thành viên",
      description:
        kind === "availability"
          ? "Hỗ trợ mẫu MSSV hoặc file chi tiết gồm Họ và tên, Thứ, Buổi, Tuần học"
          : "Dùng file .xlsx theo mẫu để hệ thống ghép đúng MSSV",
      content: (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const file = (
              e.currentTarget.elements.namedItem("file") as HTMLInputElement
            ).files?.[0];
            if (!file) return;
            try {
              const { readImport, readAvailabilityUpload } = await import(
                "../lib/excel"
              );
              let rows;
              if (kind === "availability") {
                const upload = await readAvailabilityUpload(file);
                if (upload.format === "details") {
                  setModal({
                    title: "Xem trước lịch rảnh chi tiết",
                    description: upload.filename.replace(/\bCLB\b/g, "Đội"),
                    wide: true,
                    content: (
                      <>
                        <AvailabilityPreview rows={upload.rows} />
                        <form
                          onSubmit={async (e) => {
                            e.preventDefault();
                            if (
                              await act(
                                "importAvailabilityDetails",
                                {
                                  filename: upload.filename,
                                  rows: upload.rows,
                                  syncProfiles: !!activeDataset,
                                },
                                `Đã lưu ${upload.rows.length} dòng lịch rảnh chi tiết`,
                              )
                            ) {
                              setMemberSection("availability");
                              go("members");
                            }
                          }}
                        >
                          <FormFooter
                            label={activeDataset ? "Lưu và cập nhật lịch rảnh" : `Lưu ${upload.rows.length} dòng lịch rảnh`}
                            onCancel={closeModal}
                            busy={busy}
                          />
                        </form>
                      </>
                    ),
                  });
                  return;
                }
                rows = upload.rows;
              } else rows = await readImport(file, kind);
              await act(
                "import",
                { kind, rows },
                `Đã nhập ${rows.length} thành viên`,
              );
            } catch (e) {
              notify(
                e instanceof Error ? e.message : "Không đọc được file",
                true,
              );
            }
          }}
        >
          <div className="upload-zone">
            <Upload size={30} />
            <strong>Chọn file Excel của bạn</strong>
            <span>
              {kind === "availability"
                ? "Tối đa 3 MB · 5.000 dòng chi tiết hoặc 1.500 thành viên theo mẫu"
                : "Tối đa 3 MB · 1.500 thành viên"}
            </span>
            <input
              name="file"
              type="file"
              accept=".xlsx"
              required
              aria-label="Chọn file Excel"
            />
          </div>
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const { downloadTemplate } = await import("../lib/excel");
                await downloadTemplate(kind);
              } catch {
                notify("Chưa tải được file mẫu", true);
              }
            }}
          >
            <ArrowDownToLine size={16} /> Tải file mẫu
          </Button>
          {kind === "availability" ? (
            <p className="dialog-copy">
              Điền 1 hoặc x vào ca rảnh, để trống ca bận, lịch mới áp dụng khi
              xếp lịch nháp tiếp theo; lịch đã công bố vẫn giữ nguyên, file theo
              tuần học và khung giờ cụ thể sẽ được lưu tại Thành viên → Lịch rảnh để đối
              chiếu trước khi áp dụng
            </p>
          ) : null}
          <FormFooter label="Nhập dữ liệu" onCancel={closeModal} busy={busy} />
        </form>
      ),
    });
  }
  async function exportReport() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const { makeReport, saveFile } = await import("../lib/excel");
      const { buffer, warnings } = await makeReport(club, month);
      saveFile(
        buffer,
        `Nhịp-Đội-${month}${warnings.length ? "-ban-tam" : ""}.xlsx`,
      );
      notify(
        warnings.length
          ? `Đã xuất bản tạm: ${warnings.join("; ")}`
          : "Đã xuất báo cáo Excel",
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không xuất được Excel", true);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  function changeAssignment(shift: Shift, shiftMonth: string, position: number) {
    const current = shift.assignments[position];
    const candidates = liveMembers.filter(
      (m) =>
        m.joined <= shift.date &&
        availabilityForDuty(club, m, shift.date, shift.period, shift)
          .available &&
        !shift.assignments.some(
          (a, i) => i !== position && a.memberId === m.id,
        ),
    );
    setModal({
      title: current ? "Đổi người phụ trách ca" : "Bổ sung người trực",
      description: `${dateLabel(shift.date, true)} · Ca ${shift.period === "am" ? "sáng" : "chiều"}, người thay được cộng điểm khi đã xác minh đi trực`,
      content: (
        <form
          onSubmit={(e) =>
            act(
              "shift",
              { ...getForm(e), month: shiftMonth, shiftId: shift.id, position, assignmentMemberId: current?.memberId ?? null },
              "Đã cập nhật người trực",
            )
          }
        >
          <Field label="Thành viên phù hợp">
            <select
              name="replacementId"
              required
              defaultValue={current?.memberId ?? ""}
            >
              <option value="" disabled>
                Chọn người trực
              </option>
              {candidates.map((m) => {
                const turns =
                  club.schedules.find(s => s.month === shiftMonth)?.shifts
                    .flatMap((s) => s.assignments)
                    .filter((a) => a.memberId === m.id).length ?? 0;
                return (
                  <option key={m.id} value={m.id}>
                    {m.name} · {turns} ca
                    {m.extraDuties ? " · Muốn trực thêm" : ""}
                  </option>
                );
              })}
            </select>
          </Field>
          {!candidates.length ? (
            <div className="notice amber">
              Chưa có người phù hợp, kiểm tra lịch rảnh trước
            </div>
          ) : null}
          <FormFooter label="Lưu phân công" onCancel={closeModal} busy={busy} />
        </form>
      ),
    });
  }
  function addDutyMember(shift: Shift, shiftMonth: string) {
    const assigned = new Set(shift.assignments.map(assignment => assignment.memberId));
    const candidates = liveMembers.filter(member => !assigned.has(member.id)).sort((a, b) => a.name.localeCompare(b.name, "vi"));
    setModal({
      title: "Thêm người vào ca",
      description: `${dateLabel(shift.date, true)} · Ca ${shift.period === "am" ? "sáng" : "chiều"}`,
      content: candidates.length ? (
        <form onSubmit={e => act(
          "addDutyMember",
          { ...getForm(e), month: shiftMonth, shiftId: shift.id },
          "Đã thêm người vào ca",
        )}>
          <Field label="Thành viên">
            <select name="memberId" required defaultValue="">
              <option value="" disabled>Chọn thành viên</option>
              {candidates.map(member => <option key={member.id} value={member.id}>{member.name}{member.studentId ? ` · ${member.studentId}` : ""}</option>)}
            </select>
          </Field>
          <p className="hint">Điểm được ghi theo kết quả xác minh của ca trực</p>
          <FormFooter label="Thêm người" onCancel={closeModal} busy={busy} />
        </form>
      ) : <p className="dialog-copy">Tất cả thành viên đang hoạt động đã có trong ca này</p>,
    });
  }
  function confirmDutyMemberRemoval(shift: Shift, shiftMonth: string, memberId: string, memberName: string) {
    const period = shift.period === "am" ? "Ca sáng" : "Ca chiều";
    setModal(previous => ({
      title: "Gỡ người khỏi ca",
      description: `${memberName} · ${period} ${dateLabel(shift.date, true)}`,
      content: (
        <>
          <p className="dialog-copy">
            Phân công, điểm đã ghi và ảnh minh chứng của lượt trực này sẽ bị xóa
          </p>
          <div className="form-footer">
            <Button variant="secondary" onClick={() => setModal(previous)}>Quay lại</Button>
            <Button variant="danger" onClick={() => act(
              "removeDutyMember",
              { month: shiftMonth, shiftId: shift.id, memberId, confirm: memberId },
              "Đã gỡ người khỏi ca",
            )}>Xác nhận gỡ</Button>
          </div>
        </>
      ),
    }));
  }
  function confirmMemberDeletion(member: Member) {
    setModal({
      title: "Xóa vĩnh viễn thành viên",
      description: member.studentId ? `${member.name} · ${member.studentId}` : member.name,
      content: (
        <>
          <p className="dialog-copy">
            Hồ sơ, tài khoản, lịch trực, điểm, đăng ký và ảnh minh chứng của {member.name} sẽ bị xóa, thao tác này không thể hoàn tác
          </p>
          <div className="form-footer">
            <Button variant="secondary" onClick={closeModal}>Quay lại</Button>
            <Button variant="danger" onClick={() => act("deleteMember", { memberId: member.id, confirm: member.id }, "Đã xóa thành viên và dữ liệu liên quan")}>
              <Trash2 size={16} /> Xóa vĩnh viễn
            </Button>
          </div>
        </>
      ),
    });
  }
  const weekSelect = (
    <select
      className="week-select"
      aria-label="Chọn tuần"
      value={week.id}
      onChange={(e) => {
        setSelectedWeek(e.target.value);
        setPage(0);
      }}
    >
      {[...club.weeks].reverse().map((w) => (
        <option key={w.id} value={w.id}>
          {dateLabel(w.id)} – {dateLabel(addDays(w.id, 6), true)}
          {w.id === weekId() ? " · Tuần này" : ""}
          {w.closed && activeTab === "meetings" ? " · Đã chốt" : ""}
        </option>
      ))}
    </select>
  );
  const monthSelect = (
    <label className="month-select">
      <CalendarDays size={16} />
      <select
        aria-label="Chọn tháng"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
      >
        {Array.from(
          new Set([
            ...Array.from({ length: 48 }, (_, i) =>
              new Date(Date.UTC(Number(today().slice(0, 4)) - 1, i, 1))
                .toISOString()
                .slice(0, 7),
            ),
            ...club.schedules.map((s) => s.month),
            ...club.weeks.map((w) => (w.meetingDate || w.id).slice(0, 7)),
            month,
          ]),
        )
          .sort()
          .reverse()
          .map((value) => (
            <option key={value} value={value}>
              {monthLabel(value)}
            </option>
          ))}
      </select>
    </label>
  );
  function meetingCard(personal = false) {
    const w = personal ? currentWeek : week;
    return (
      <div className="meeting-card">
        <div className="meeting-card-top">
          <span className="eyebrow">
            LỊCH HỌP TUẦN
          </span>
          <Badge
            status={
              w.cancelled ? "neutral" : w.closed ? "neutral" : "attending"
            }
          >
            {w.cancelled
              ? "Không họp"
              : w.closed
                ? "Đã chốt"
                : "Đang mở đăng ký"}
          </Badge>
        </div>
        <h2>
          {w.cancelled ? "Không tổ chức họp" : "Thông tin buổi họp"}
        </h2>
        <p>{w.cancelled ? "Tuần này không yêu cầu đăng ký" : w.closed ? "Đăng ký tuần này đã được chốt" : "Đăng ký tham gia hoặc xin vắng trước khi chốt tuần"}</p>
        <div className="meeting-info">
          <span>
            <CalendarDays size={16} />
            {w.meetingDate
              ? `${["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][weekday(w.meetingDate)]}, ${dateLabel(w.meetingDate)}`
              : "BĐH chưa đặt ngày họp"}
            {w.meetingDate ? ` · ${w.time}` : ""}
          </span>
          <span>
            <MapPin size={16} />
            {w.location || "Địa điểm sẽ được cập nhật"}
          </span>
        </div>
        <div className="meeting-card-bottom">
          <div className="avatar-stack">
            <span>
              {personal
                ? "Chu kỳ đăng ký: Thứ Hai – Chủ nhật"
                : `${count("attending")} thành viên đã đăng ký`}
            </span>
          </div>
          {isAdmin && !personal ? (
            <Button variant="light" onClick={editMeeting} disabled={w.closed && !!w.meetingDate}>
              {w.closed ? "Bổ sung ngày họp" : "Đặt lịch họp"} <ArrowUpRightIcon />
            </Button>
          ) : null}
        </div>
      </div>
    );
  }
  function requestsPanel(full = false) {
    const items = full ? pending : pending.slice(0, 2);
    return (
      <section className="panel requests-panel">
        <PanelHead
          title={full ? "Đăng ký họp chờ duyệt" : "Cần bạn xử lý"}
          action={<span className="count-pill">{pending.length}</span>}
        />
        {items.length ? (
          <div className="request-list">
            {items.map(({ week: w, entry: e }, i) => (
              <div className="request-item" key={`${w.id}-${e.memberId}`}>
                <div className="request-person">
                  <Avatar
                    name={findMember(e.memberId)?.name ?? "Thành viên"}
                    photoId={findMember(e.memberId)?.avatarId}
                    index={i + 2}
                  />
                  <div>
                    <strong>{findMember(e.memberId)?.name}</strong>
                    <span>Xin chuyển sang tham gia</span>
                  </div>
                  <span className="request-week">{dateLabel(w.id)}</span>
                </div>
                {full ? (
                  <div className="request-details">
                    <p>
                      <span>Lý do vắng trước đó:</span> {e.reason}
                    </p>
                    <p>
                      <span>Lời nhắn:</span> {e.request}
                    </p>
                  </div>
                ) : null}
                <div className="request-actions">
                  <button disabled={busy} onClick={() => review(w, e, true)}>
                    <Check size={15} /> Chấp thuận
                  </button>
                  <button disabled={busy} onClick={() => review(w, e, false)}>
                    <X size={15} /> Từ chối
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Đã xử lý hết rồi" icon={CheckCheck}>
            Mọi yêu cầu đã được cập nhật
          </Empty>
        )}
        {!full && pending.length ? (
          <div className="panel-link">
            <LinkButton onClick={() => go("meetings")}>
              Xem tất cả yêu cầu
            </LinkButton>
          </div>
        ) : null}
      </section>
    );
  }
  function meetingTable(preview = false) {
    const result = week.entries.filter((e) => {
      const m = findMember(e.memberId);
      return (
        (filter === "all" || e.status === filter) &&
        (!search ||
          `${m?.name} ${m?.studentId}`
            .toLocaleLowerCase("vi")
            .includes(search.toLocaleLowerCase("vi")))
      );
    });
    const perPage = preview ? 5 : 10;
    const pages = Math.max(1, Math.ceil(result.length / perPage));
    const safePage = Math.min(page, pages - 1);
    const rows = result.slice(safePage * perPage, (safePage + 1) * perPage);
    return (
      <section className="panel meeting-table">
        <PanelHead
          title="Danh sách đăng ký"
          description={`${week.entries.length} thành viên · Tuần ${dateLabel(week.id)} – ${dateLabel(addDays(week.id, 6))}`}
          action={
            preview ? (
              <LinkButton onClick={() => go("meetings")}>
                Xem danh sách
              </LinkButton>
            ) : (
              <Button
                variant="secondary"
                onClick={() => {
                  setMonth((week.meetingDate || week.id).slice(0, 7));
                  go("reports");
                }}
              >
                <FileSpreadsheet size={16} /> Báo cáo
              </Button>
            )
          }
        />
        <div className="table-toolbar">
          <div className="table-tabs">
            {[
              ["all", "Tất cả", week.entries.length],
              ["attending", "Tham gia", count("attending")],
              ["pending", "Chưa xử lý", count("pending")],
              ["absent", "Xin vắng", count("absent")],
              ["unregistered", "Chưa đăng ký", count("unregistered")],
            ].map(([id, label, n]) => (
              <button
                key={id}
                className={filter === id ? "selected" : ""}
                onClick={() => {
                  setFilter(String(id));
                  setPage(0);
                }}
              >
                {label}
                <span>{n}</span>
              </button>
            ))}
          </div>
          <label className="table-search">
            <Search size={16} />
            <input
              aria-label="Tìm thành viên trong buổi họp"
              value={search}
              placeholder="Tìm tên, MSSV…"
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th className="number-cell">STT</th>
                <th>THÀNH VIÊN</th>
                <th>MSSV</th>
                <th>TRẠNG THÁI</th>
                <th className="center">VẮNG</th>
                <th className="center">CÓ PHÉP</th>
                <th className="center">ĐẠT PHIẾU ĐIỂM DANH</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((e, i) => {
                const m = findMember(e.memberId);
                if (!m) return null;
                return (
                  <tr key={e.memberId}>
                    <td className="number-cell">
                      {digits(safePage * perPage + i + 1)}
                    </td>
                    <td>
                      <div className="person-cell">
                        <Avatar name={m.name} photoId={m.avatarId} index={club.members.indexOf(m)} />
                        <span>
                          <strong>{m.name}</strong>
                          {e.reason ? (
                            <small title={e.reason}>{e.reason}</small>
                          ) : (
                            <small>
                              {memberRoleLabel(m)}
                            </small>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="muted mono">{m.studentId}</td>
                    <td>
                      <Badge status={e.status} />
                    </td>
                    <td className="center">
                      <input
                        type="checkbox"
                        aria-label={`Vắng: ${m.name}`}
                        checked={!!e.absent}
                        disabled={busy || week.cancelled}
                        onChange={(ev) =>
                          updateEntry(e, { absent: ev.target.checked })
                        }
                      />
                    </td>
                    <td className="center">
                      <input
                        type="checkbox"
                        aria-label={`Có phép: ${m.name}`}
                        checked={e.excused}
                        disabled={
                          busy ||
                          week.cancelled ||
                          (!e.absent &&
                            !["absent", "pending"].includes(e.status))
                        }
                        onChange={(ev) =>
                          updateEntry(e, { excused: ev.target.checked })
                        }
                      />
                    </td>
                    <td className="center">
                      <input
                        type="checkbox"
                        aria-label={`Đạt phiếu điểm danh: ${m.name}`}
                        checked={e.passed}
                        disabled={
                          busy ||
                          week.cancelled ||
                          e.status !== "attending" ||
                          !!e.absent
                        }
                        onChange={(ev) =>
                          updateEntry(e, { passed: ev.target.checked })
                        }
                      />
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Chi tiết: ${m.name}`}
                        onClick={() =>
                          setModal({
                            title: m.name,
                            description: `${m.studentId} · ${statusNames[e.status]}`,
                            content: (
                              <>
                                <div className="detail-lines">
                                  <p>
                                    <span>Lý do vắng</span>
                                    {e.reason || "Chưa có"}
                                  </p>
                                  <p>
                                    <span>Yêu cầu đổi đăng ký</span>
                                    {e.request || "Chưa có"}
                                  </p>
                                  <p>
                                    <span>Kết quả xử lý</span>
                                    {e.decision || "Chưa có"}
                                  </p>
                                </div>
                                <Button
                                  onClick={() => {
                                    closeModal();
                                    updateEntry(e, {
                                      status: "attending",
                                      absent: false,
                                    });
                                  }}
                                  disabled={week.cancelled}
                                >
                                  Ghi nhận có mặt
                                </Button>
                              </>
                            ),
                          })
                        }
                      >
                        <MoreHorizontal size={19} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rows.length ? (
            <Empty title="Chưa có thành viên phù hợp" icon={Users}>
              Thử bộ lọc khác hoặc thêm thành viên vào Đội
            </Empty>
          ) : null}
        </div>
        <div className="table-footer">
          <span>
            Hiển thị {result.length ? safePage * perPage + 1 : 0}–
            {Math.min((safePage + 1) * perPage, result.length)} trên{" "}
            {result.length} thành viên
          </span>
          <div className="pagination">
            <button
              aria-label="Trang trước"
              disabled={safePage === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span>{safePage + 1}</span>
            <button
              aria-label="Trang sau"
              disabled={safePage + 1 >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>
    );
  }
  function overview() {
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">QUẢN LÝ ĐỘI</span>
            <h1>
              Tổng quan
            </h1>
            <p>Tình hình đăng ký họp, lịch trực và yêu cầu cần xử lý</p>
          </div>
          {weekSelect}
        </div>
        <div className="stats-grid">
          <Stat
            title="Thành viên Đội"
            value={liveMembers.length}
            description="Đang cùng nhau hoạt động"
            icon={Users}
            onClick={() => go("members")}
          />
          <Stat
            title="Đăng ký tham gia"
            value={count("attending")}
            description="Sẵn sàng cho buổi họp"
            icon={UserCheck}
            color="purple"
            onClick={() => {
              go("meetings");
              setFilter("attending");
            }}
          />
          <Stat
            title="Yêu cầu chưa xử lý"
            value={count("pending")}
            description="Đang chờ BĐH phê duyệt"
            icon={Clock3}
            color="amber"
            onClick={() => go("meetings")}
          />
          <Stat
            title="Đăng ký xin vắng"
            value={count("absent")}
            description={`${count("unregistered")} thành viên chưa đăng ký`}
            icon={Coffee}
            color="rose"
            onClick={() => {
              go("meetings");
              setFilter("absent");
            }}
          />
        </div>
        <div className="overview-middle">
          {meetingCard()}
          {requestsPanel()}
        </div>
        {meetingTable(true)}
        <div className="bottom-grid">
          <section className="panel next-duty">
            <PanelHead
              title="Lịch trực sắp tới"
              action={
                <LinkButton onClick={() => go("duties")}>
                  Xem lịch trực
                </LinkButton>
              }
            />
            {club.schedules
              .filter((s) => s.published)
              .flatMap((s) => s.shifts.filter((t) => isShiftPublished(s, t)))
              .filter((t) => t.date >= today() && !t.cancelled)
              .sort((a, b) => a.id.localeCompare(b.id))
              .slice(0, 2)
              .map((shift) => (
                <div className="upcoming-row" key={shift.id}>
                  <div className="date-tile">
                    <span>THÁNG {Number(shift.date.slice(5, 7))}</span>
                    <strong>{shift.date.slice(8)}</strong>
                  </div>
                  <div>
                    <strong>
                      Trực C1 · Ca {shift.period === "am" ? "sáng" : "chiều"}
                    </strong>
                    <span>
                      {shift.assignments
                        .map((a) => findMember(a.memberId)?.name)
                        .join(" · ") || "Chưa phân công"}
                    </span>
                  </div>
                  <Badge status="neutral">
                    {shift.assignments.length}/{shiftCapacity(shift)} người
                  </Badge>
                </div>
              ))}
            {!club.schedules.some(
              (s) => s.shifts.some((t) => isShiftPublished(s, t) && t.date >= today() && !t.cancelled),
            ) ? (
              <div className="compact-empty">
                <CalendarDays size={20} />
                <span>
                  Chưa có ca trực sắp tới, xếp lịch cho tháng mới nhé
                </span>
              </div>
            ) : null}
          </section>
          <section className="note-card">
            <div className="note-icon">
              <Leaf size={23} />
            </div>
            <h3>
              Đều đặn một chút
              <br />
              Gắn kết nhiều hơn
            </h3>
            <p>
              Mỗi ca trực, mỗi buổi họp đều là một phần đóng góp của bạn cho
              Đội
            </p>
            <span>
              GIỮ NHỊP, CÙNG NHAU <ArrowRight size={15} />
            </span>
          </section>
        </div>
      </>
    );
  }

  function duties() {
    const thisDutyWeek = weekId();
    const dutyWeekEnd = addDays(dutyWeek, 6);
    const weekLabel = (start: string) => `${dateLabel(start)} – ${dateLabel(addDays(start, 6), true)}`;
    const weeks = [...new Set([
      dutyWeek,
      ...Array.from({ length: 25 }, (_, i) => addDays(thisDutyWeek, (i - 12) * 7)),
      ...club.schedules.flatMap(s => [
        ...s.shifts.map(shift => weekId(shift.date)),
        ...(s.pendingDutyWeek ? [s.pendingDutyWeek] : []),
      ]),
    ])].sort().reverse();
    const weeklySchedules = club.schedules
      .map(schedule => ({ ...schedule, shifts: schedule.shifts.filter(shift => shift.date >= dutyWeek && shift.date <= dutyWeekEnd) }))
      .filter(schedule => schedule.shifts.length);
    const entries = weeklySchedules.flatMap(schedule => schedule.shifts.map(shift => ({ schedule, shift })));
    const visibleShifts = entries.map(({ shift }) => shift);
    const draftEntries = entries.filter(({schedule, shift}) => !isShiftPublished(schedule, shift));
    const publishedCount = entries.length - draftEntries.length;
    const missingSlots = [...new Set([dutyWeek.slice(0, 7), dutyWeekEnd.slice(0, 7)])].some(month =>
      !weeklySchedules.some(schedule => schedule.month === month) &&
      createDutyShiftSlots(club, month, club.peoplePerShift ?? 2).some(shift => weekId(shift.date) === dutyWeek),
    );
    const canPlan = missingSlots || draftEntries.some(({ schedule, shift }) => canReplanDutyShift(schedule, shift));
    const publishShortage = draftEntries.map(({ shift }) => shift).filter(shift => !shift.cancelled)
      .reduce((n, shift) => n + Math.max(0, shiftCapacity(shift) - shift.assignments.length), 0);
    const activeShifts = visibleShifts.filter((t) => !t.cancelled),
      cancelledCount = visibleShifts.length - activeShifts.length;
    const seats = activeShifts.flatMap((t) => t.assignments).length;
    const shortage = activeShifts.reduce((n, t) => n + Math.max(0, shiftCapacity(t) - t.assignments.length), 0);
    const capacity = new Set(activeShifts.map(shiftCapacity));
    const capacityLabel = capacity.size > 1 ? "Số người theo từng ca"
      : `${capacity.values().next().value ?? club.peoplePerShift ?? 2} người mỗi ca`;
    const linkedIds = activeDataset
      ? new Set(Object.values(activeDataset.memberLinks ?? {}))
      : null;
    const counts = liveMembers
      .filter((m) => !linkedIds || linkedIds.has(m.id) || profileAvailability(club, m).length > 0 ||
        activeShifts.some(shift => shift.assignments.some(assignment => assignment.memberId === m.id)))
      .map((m) => ({
        m,
        n: activeShifts
          .flatMap((t) => t.assignments)
          .filter((a) => a.memberId === m.id).length,
      }));
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              CHIA SẺ TRÁCH NHIỆM, GIỮ NHỊP MỖI NGÀY
            </span>
            <h1>
              Lịch trực C1
            </h1>
            <p>
              {capacityLabel} · Sáng và chiều · Ưu tiên 2 ca/người, có thể trực
              thêm
            </p>
          </div>
          <div className="heading-actions">
            <div className="duty-week-nav">
              <Button variant="secondary" aria-label="Tuần trực trước" onClick={() => setDutyWeek(addDays(dutyWeek, -7))}><ChevronLeft size={16} /></Button>
              <select className="week-select" aria-label="Chọn tuần trực" value={dutyWeek} onChange={e => setDutyWeek(e.target.value)}>
                {weeks.map(start => <option key={start} value={start}>{weekLabel(start)}{start === thisDutyWeek ? " · Tuần này" : ""}</option>)}
              </select>
              <Button variant="secondary" aria-label="Tuần trực sau" onClick={() => setDutyWeek(addDays(dutyWeek, 7))}><ChevronRight size={16} /></Button>
            </div>
            {isAdmin ? (
              <Button
                onClick={() => importDialog("availability")}
                variant="secondary"
              >
                <Upload size={16} /> Nhập lịch rảnh từ Excel
              </Button>
            ) : null}
          </div>
        </div>
        {isAdmin ? (
          <div className="notice green">
            <Sparkles size={19} />
            <div>
              <strong>Hai ca là mức ưu tiên, không phải giới hạn</strong>
              <p>
                Chia lượt đầu cho mọi người, hướng tới hai ca, sau đó ưu tiên
                người muốn trực thêm{" "}
                {club.availabilityVersion
                  ? `Lịch rảnh cập nhật ${dateLabel(club.availabilityVersion.slice(0, 10))}`
                  : "Hãy nhập lịch rảnh để bắt đầu"}
              </p>
            </div>
            {activeDataset?.settings ? (
              <p className="hint">
                Ca sáng {activeDataset.settings.amStart}–
                {activeDataset.settings.amEnd} · Ca chiều{" "}
                {activeDataset.settings.pmStart}–
                {activeDataset.settings.pmEnd} · Cho phép đến muộn
                tối đa {activeDataset.settings.allowedLateMinutes}{" "}
                phút khi xếp lịch
              </p>
            ) : null}
            <Button
              disabled={busy || !canPlan}
              onClick={() => scheduleDialog(visibleShifts.length > 0, draftEntries[0]?.shift.capacity)}
            >
              <WandSparkles size={16} />{" "}
              {visibleShifts.length ? "Xếp lại ca nháp trong tuần" : "Xếp lịch tuần"}
            </Button>
          </div>
        ) : null}
        {visibleShifts.length ? (
          <>
            <div className="schedule-summary">
              <div>
                <Badge status={publishedCount && !draftEntries.length ? "attending" : "pending"}>
                  {draftEntries.length ? (publishedCount ? `${publishedCount} ca đã công bố · ${draftEntries.length} ca nháp` : "Bản nháp tuần") : "Tuần đã công bố"}
                </Badge>
                <span>
                  {activeShifts.length} ca hoạt động
                  {cancelledCount
                    ? ` · ${cancelledCount} ca đã hủy`
                    : ""} · {seats} lượt được phân
                  {shortage
                    ? ` · Còn thiếu ${shortage} người`
                    : " · Đã đủ người"}
                </span>
              </div>
              {isAdmin && publishedCount > 0 ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setModal({
                    title: "Hủy công bố tuần",
                    description: weekLabel(dutyWeek),
                    content: (
                      <>
                        <p className="dialog-copy">
                          Đưa {publishedCount} ca đã công bố của tuần về bản nháp, thành viên sẽ thấy lại lịch khi BĐH công bố, điểm đã xác minh được giữ
                        </p>
                        <div className="form-footer">
                          <Button variant="secondary" onClick={closeModal}>Quay lại</Button>
                          <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() => act("withdrawDutyWeek", { week: dutyWeek }, "Đã hủy công bố tuần trực")}
                          >
                            Hủy công bố tuần
                          </Button>
                        </div>
                      </>
                    ),
                  })}
                >
                  <XCircle size={16} /> Hủy công bố tuần
                </Button>
              ) : null}
              {isAdmin && draftEntries.length > 0 ? (
                <Button
                  disabled={busy}
                  onClick={() =>
                    setModal({
                      title: "Công bố tuần trực",
                      description: weekLabel(dutyWeek),
                      content: (
                        <>
                        {publishShortage > 0 && <p className="dialog-copy">Lịch tuần này còn thiếu {publishShortage} lượt phân công</p>}
                        <div className="form-footer">
                          <Button variant="secondary" onClick={closeModal}>
                            Kiểm tra lại
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              act("publish", { week: dutyWeek }, "Đã công bố tuần trực")
                            }
                          >
                            <CheckCheck size={16} /> Công bố tuần
                          </Button>
                        </div>
                        </>
                      ),
                    })
                  }
                >
                  Công bố tuần <ArrowRight size={16} />
                </Button>
              ) : null}
            </div>
            <div className="duty-layout">
              <section className="panel duty-calendar">
                <div className="calendar-day-labels">
                  {[
                    "Thứ Hai",
                    "Thứ Ba",
                    "Thứ Tư",
                    "Thứ Năm",
                    "Thứ Sáu",
                    "Thứ Bảy",
                    "Chủ nhật",
                  ].map((d) => (
                    <span key={d}>{d}</span>
                  ))}
                </div>
                <div className="calendar-grid">
                  {Array.from({ length: 7 }, (_, i) => addDays(dutyWeek, i)).map((date) => {
                    const shifts = entries.filter(({ shift }) => shift.date === date);
                    return (
                      <div
                        key={date}
                        className={`calendar-cell ${date === today() ? "today" : ""} ${!shifts.length ? "offday" : ""}`}
                      >
                        <span className="calendar-number">
                          {dateLabel(date)}
                          {date === today() ? <small>Hôm nay</small> : null}
                        </span>
                        {shifts.map(({ schedule, shift }) => (
                          <button
                            className={`calendar-shift ${shift.period} ${shift.cancelled ? "cancelled" : ""}`}
                            aria-label={`Ca ${shift.period === "am" ? "sáng" : "chiều"} ngày ${dateLabel(date, true)}${shift.cancelled ? " · Đã hủy" : ""}${!isShiftPublished(schedule, shift) ? " · Bản nháp" : ""}`}
                            key={shift.id}
                            onClick={() =>
                              setModal({
                                title: `Trực C1 · ${dateLabel(date, true)}`,
                                description: `Ca ${shift.period === "am" ? "sáng" : "chiều"}${shift.startTime ? ` ${shift.startTime}–${shift.endTime}` : ""}${shift.academicWeek ? ` · Tuần học ${shift.academicWeek}` : ""} · ${shift.cancelled ? "Đã hủy" : isShiftPublished(schedule, shift) ? "Đã công bố" : "Bản nháp"}`,
                                content: (
                                  <div className="shift-detail">
                                    {shift.cancelled ? (
                                      <div className="notice neutral">
                                        Ca này đã hủy cho tất cả người được phân công, không
                                        cộng/trừ điểm {shift.cancelReason}
                                      </div>
                                    ) : null}
                                    {Array.from({ length: Math.max(shiftCapacity(shift), shift.assignments.length) }, (_, position) => {
                                      const a = shift.assignments[position],
                                        m = a ? findMember(a.memberId) : null;
                                      return (
                                        <div
                                          className="shift-person"
                                          key={position}
                                        >
                                          {m ? (
                                            <div className="person-cell">
                                              <Avatar
                                                name={m.name}
                                                photoId={m.avatarId}
                                                index={position + 1}
                                              />
                                              <div>
                                                <strong>{m.name}</strong>
                                                <small>
                                                  {a.originalId &&
                                                  a.originalId !== a.memberId
                                                    ? `Thay ${findMember(a.originalId)?.name}`
                                                    : a.manual ? "Thêm thủ công" : "Thành viên phụ trách"}
                                                </small>
                                              </div>
                                            </div>
                                          ) : (
                                            <p className="muted">
                                              Vị trí chưa được phân công
                                            </p>
                                          )}
                                          {a?.availabilityNote ? (
                                            <p className="assignment-note">
                                              {a.availabilityNote}
                                            </p>
                                          ) : null}
                                          {a?.note ? (
                                            <p className="assignment-note">
                                              BĐH: {a.note}
                                            </p>
                                          ) : null}
                                          {a && !shift.cancelled && a.result !== "cancelled" &&
                                           isShiftPublished(schedule, shift) && (isAdmin || a.memberId === me!.id) ? (
                                            <DutyEvidenceAction
                                              key={a.memberId}
                                              target={{ month: schedule.month, shiftId: shift.id, memberId: a.memberId }}
                                              canSend={a.memberId === me!.id && evidenceSubmissionOpen(shift)}
                                              isAdmin={isAdmin}
                                            />
                                          ) : null}
                                          {isAdmin ? (
                                            <>
                                              <div className="shift-assignment-actions">
                                                <Button
                                                  variant="secondary"
                                                  disabled={busy || shift.cancelled || (!isShiftPublished(schedule, shift) && !canReplanDutyShift(schedule, shift) && !a?.manual)}
                                                  onClick={() => changeAssignment(shift, schedule.month, position)}
                                                >
                                                  {m ? "Đổi người" : "Chọn người"}
                                                </Button>
                                                {a && (
                                                  <Button
                                                    variant="secondary"
                                                    disabled={busy}
                                                    aria-label={`Gỡ ${m?.name ?? "thành viên"} khỏi ca`}
                                                    onClick={() => confirmDutyMemberRemoval(shift, schedule.month, a.memberId, m?.name ?? "Thành viên")}
                                                  >
                                                    <Trash2 size={15} aria-hidden="true" /> Gỡ khỏi ca
                                                  </Button>
                                                )}
                                              </div>
                                              {a && isShiftPublished(schedule, shift) ? (
                                                <Field label="Kết quả xác minh">
                                                  <select
                                                    disabled={
                                                      busy || shift.cancelled
                                                    }
                                                    defaultValue={a.result}
                                                    onChange={(e) =>
                                                      act(
                                                        "shift",
                                                        {
                                                          month: schedule.month,
                                                          shiftId: shift.id,
                                                          position,
                                                          assignmentMemberId: a.memberId,
                                                          result:
                                                            e.target.value,
                                                        },
                                                        "Đã ghi nhận kết quả trực",
                                                      )
                                                    }
                                                  >
                                                    {Object.entries(dutyNames)
                                                      .filter(
                                                        ([key]) =>
                                                          key !== "cancelled" ||
                                                          a.result ===
                                                            "cancelled",
                                                      )
                                                      .map(([key, name]) => (
                                                        <option
                                                          key={key}
                                                          value={key}
                                                        >
                                                          {name}
                                                        </option>
                                                      ))}
                                                  </select>
                                                </Field>
                                              ) : null}
                                              {a && isShiftPublished(schedule, shift) ? (
                                                <label className="checkbox-label">
                                                  <input
                                                    type="checkbox"
                                                    aria-label={`Đến muộn: ${m?.name}`}
                                                    defaultChecked={!!a.late}
                                                    disabled={[
                                                      "unexcused",
                                                      "excused",
                                                      "cancelled",
                                                    ].includes(a.result)}
                                                    onChange={(e) =>
                                                      act(
                                                        "shift",
                                                        {
                                                          month: schedule.month,
                                                          shiftId: shift.id,
                                                          position,
                                                          assignmentMemberId: a.memberId,
                                                          late: e.target
                                                            .checked,
                                                        },
                                                        "Đã ghi nhận đến muộn",
                                                      )
                                                    }
                                                  />{" "}
                                                  Đến muộn{" "}
                                                  <small>
                                                    Không tích = không đến muộn,
                                                    tích ô sẽ trừ{" "}
                                                    {rulesFor(club, schedule.month).D ??
                                                      0}{" "}
                                                    điểm, lý do hợp lệ thì để
                                                    trống
                                                  </small>
                                                </label>
                                              ) : null}
                                              {a ? (
                                                <form
                                                  onSubmit={(e) =>
                                                    act(
                                                      "shift",
                                                      {
                                                        ...getForm(e),
                                                        month: schedule.month,
                                                        shiftId: shift.id,
                                                        position,
                                                        assignmentMemberId: a.memberId,
                                                      },
                                                      "Đã lưu ghi chú ca trực",
                                                    )
                                                  }
                                                >
                                                  <Field
                                                    label={`Ghi chú BĐH: ${m?.name}`}
                                                  >
                                                    <textarea
                                                      name="note"
                                                      maxLength={1000}
                                                      defaultValue={
                                                        a.note ?? ""
                                                      }
                                                      placeholder="Ví dụ: Có ca học tan lúc 14:30"
                                                    />
                                                  </Field>
                                                  <Button
                                                    type="submit"
                                                    variant="secondary"
                                                    disabled={
                                                      busy || shift.cancelled
                                                    }
                                                  >
                                                    Lưu ghi chú
                                                  </Button>
                                                </form>
                                              ) : null}
                                            </>
                                          ) : a?.memberId === me!.id ? (
                                            <Badge
                                              status={
                                                a.result === "completed"
                                                  ? "attending"
                                                  : "neutral"
                                              }
                                            >
                                              {dutyNames[a.result]}
                                            </Badge>
                                          ) : null}
                                        </div>
                                      );
                                    })}
                                    {isAdmin && !shift.cancelled && (
                                      <Button variant="secondary" disabled={busy} onClick={() => addDutyMember(shift, schedule.month)}>
                                        <Plus size={16} /> Thêm người
                                      </Button>
                                    )}
                                    {isAdmin ? (
                                      <Button
                                        variant={
                                          shift.cancelled
                                            ? "secondary"
                                            : "danger"
                                        }
                                        disabled={busy}
                                        onClick={() =>
                                          act(
                                            shift.cancelled
                                              ? "restoreShift"
                                              : "cancelShift",
                                            { month: schedule.month, shiftId: shift.id },
                                            shift.cancelled
                                              ? "Đã khôi phục cả ca"
                                              : "Đã hủy cả ca cho tất cả người được phân công; ca này không cộng/trừ điểm",
                                          )
                                        }
                                      >
                                        {shift.cancelled
                                          ? "Khôi phục ca"
                                          : "Hủy cả ca"}
                                      </Button>
                                    ) : null}
                                    {isAdmin &&
                                    !isShiftPublished(schedule, shift) && !shift.wasPublished && !shift.withdrawnOn &&
                                    !shift.cancelled ? (
                                      <Button
                                        variant="danger"
                                        onClick={() =>
                                          act(
                                            "shift",
                                            {
                                              month: schedule.month,
                                              shiftId: shift.id,
                                              position: 0,
                                              remove: true,
                                            },
                                            "Đã bỏ ca khỏi lịch nháp",
                                          )
                                        }
                                      >
                                        Bỏ ca này khỏi lịch
                                      </Button>
                                    ) : null}
                                  </div>
                                ),
                              })
                            }
                          >
                            {shift.period === "am" ? (
                              <Sun size={12} />
                            ) : (
                              <Sunset size={12} />
                            )}
                            <span>
                              {!isShiftPublished(schedule, shift) ? "Nháp · " : ""}
                              {shift.cancelled
                                ? `Ca ${shift.period === "am" ? "sáng" : "chiều"} · Đã hủy`
                                : shift.assignments
                                    .map((a) =>
                                      findMember(a.memberId)
                                        ?.name.split(" ")
                                        .slice(-2)
                                        .join(" "),
                                    )
                                    .join(", ") || "Chưa phân công"}
                            </span>
                            {!shift.cancelled &&
                            shift.assignments.length < shiftCapacity(shift) ? (
                              <i />
                            ) : null}
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </section>
              {isAdmin ? (
                <aside className="panel distribution">
                  <PanelHead
                    title="Phân bổ lượt trực"
                    description="Phân công trong tuần đang chọn"
                  />
                  <div className="distribution-list">
                    {counts
                      .sort((a, b) => b.n - a.n)
                      .map(({ m, n }, i) => (
                        <div key={m.id}>
                          <Avatar name={m.name} photoId={m.avatarId} size="small" index={i} />
                          <span>
                            {m.name}
                            {m.extraDuties ? (
                              <small>Muốn trực thêm</small>
                            ) : null}
                          </span>
                          <strong className={n > 2 ? "extra-count" : ""}>
                            {n}
                          </strong>
                        </div>
                      ))}
                  </div>
                  <p className="distribution-note">
                    Số ca có thể hơn 2 theo nhu cầu và lịch rảnh, các ca chưa đủ
                    người được đánh dấu trong lịch
                  </p>
                </aside>
              ) : null}
            </div>
            {isAdmin && weeklySchedules.map(schedule => (
              <DutyRegister
                key={`${dutyWeek}-${schedule.month}`}
                schedule={schedule}
                members={club.members}
                busy={busy}
                onUpdate={(data) =>
                  act("shift", data, "Đã lưu kết quả ca trực", false)
                }
                rule={rulesFor(club, schedule.month)}
              />
            ))}
          </>
        ) : (
          <section className="panel">
            <Empty
              title="Chưa có lịch trực tuần này"
              icon={CalendarDays}
            >
              {isAdmin
                ? "Bấm Xếp lịch tuần để hệ thống gợi ý phân công"
                : "BĐH sẽ công bố lịch trực sau khi kiểm tra bản nháp"}
            </Empty>
          </section>
        )}
      </>
    );
  }

  function memberAvailability() {
    return (
            <AvailabilityPage
              dataset={club.availabilityDataset}
              peoplePerShift={club.peoplePerShift ?? 2}
              onDuty={() => go("duties")}
              busy={busy}
              onActivate={async (data) => {
                if (
                  await act(
                    "activateAvailabilityDetails",
                    data,
                    "Đã áp dụng lịch rảnh và xếp bản nháp",
                    false,
                  )
                ) {
                  setMonth(String(data.month));
                  const plannedMonth = String(data.month);
                  setDutyWeek(plannedMonth === today().slice(0, 7) ? weekId() : weekId(plannedMonth + "-01"));
                  go("duties");
                  return true;
                }
                return false;
              }}
              official={!club.demo}
              onOfficial={() =>
                act(
                  "activateOfficialRoster",
                  { latePenalty: 5 },
                  "Đã chuyển danh sách sang chính thức và đặt mức trừ đi muộn 5 điểm",
                  false,
                )
              }
            />
    );
  }

  function weekScoreTable() {
    return <Scoreboard title={`Tuần ${dateLabel(week.id)} – ${dateLabel(addDays(week.id, 6))}`} period="tuần"
      rows={weeklyScores.map(r => ({ ...r, name: findMember(r.memberId)?.name ?? "" }))}
      memberId={isAdmin ? undefined : me!.id} scope={scoreScope} onScopeChange={setScoreScope} />;
  }

  function committeeSelect() {
    return (
      <label className="member-committee-filter">
        Lọc theo ban
        <select className="week-select" value={committeeFilter} onChange={e => setCommitteeFilter(e.target.value as CommitteeFilter)}>
          <option value="all">Tất cả ban</option>
          {committeeKinds.map(kind => <option key={kind} value={kind}>{committeeLabels[kind]}</option>)}
          <option value="unassigned">Chưa phân ban</option>
        </select>
      </label>
    );
  }

  function weeklyScorePage() {
    return (
      <>
        <div className="page-heading">
          <h1>Điểm tuần</h1>
          <div className="heading-actions">
            {weekSelect}
            {isAdmin && <Button variant="secondary" onClick={() => setEditingWeeklyPoints(value => !value)}>
              {editingWeeklyPoints ? "Xem bảng điểm tuần" : "Nhập điểm / trừ điểm"}
            </Button>}
          </div>
        </div>
        {isAdmin && editingWeeklyPoints ? <>
          <div className="member-section-tools">{committeeSelect()}</div>
          <WeeklyActivityPoints key={week.id} club={club} me={me!} isAdmin week={week.id}
            weeklyScores={weeklyScores} committeeFilter={committeeFilter} busy={busy} onAction={act} />
        </> : <>
          <p className="notice green weekly-score-note">Tuần mới bắt đầu từ 0, điểm đã ghi được cộng vào báo cáo tháng theo ngày tính điểm, điểm sự kiện chỉ cộng sau khi BĐH duyệt</p>
          {weekScoreTable()}
        </>}
      </>
    );
  }

  function members() {
    const scheduleOnly = !isAdmin && memberSection === "availability";
    const inCommittee = club.members.filter(m => matchesCommittee(m, committeeFilter));
    const result = inCommittee.filter((m) =>
      `${m.name} ${m.studentId}`
        .toLocaleLowerCase("vi")
        .includes(search.trim().toLocaleLowerCase("vi")),
    );
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">MỖI NGƯỜI LÀ MỘT PHẦN CỦA TẬP THỂ</span>
            <h1>
              Những người cùng nhịp
            </h1>
            <p>
              {liveMembers.length} thành viên đang hoạt động · {isAdmin ? "Quản lý hồ sơ và lịch rảnh tại đây" : "Tra cứu hồ sơ và lịch rảnh của toàn Đội"}
            </p>
            {isAdmin && !club.demo && club.officialSince ? (
              <Badge status="attending">
                Danh sách chính thức ·{" "}
                {
                  Object.keys(activeDataset?.memberLinks ?? {})
                    .length
                }{" "}
                người từ file lịch rảnh
              </Badge>
            ) : null}
          </div>
          {isAdmin && memberSection === "profiles" ? <div className="heading-actions">
            <Button variant="secondary" onClick={() => importDialog("members")}>
              <Upload size={16} /> Nhập danh sách Excel
            </Button>
            <Button onClick={() => editMember()}>
              <Plus size={16} /> Thêm thành viên
            </Button>
          </div> : null}
        </div>
        <div className="member-section-tools">
          <nav className="member-section-nav" aria-label="Các mục thành viên">
            {([["profiles", "Hồ sơ"], ["availability", "Lịch rảnh"]] as const).map(([id, label]) => (
              <button key={id} type="button" className={`btn ${memberSection === id ? "primary" : "secondary"}`}
                aria-pressed={memberSection === id} onClick={() => setMemberSection(id)}>{label}</button>
            ))}
          </nav>
          {(!isAdmin || memberSection === "profiles") && committeeSelect()}
        </div>
        {isAdmin && memberSection === "availability" ? <>
          <p className="notice neutral">Sửa các ô lịch rảnh của từng người trong <button className="text-button" onClick={()=>setMemberSection("profiles")}>Hồ sơ → Chỉnh sửa</button>, nhập file Excel tại Hoạt động → Lịch trực C1</p>
          {memberAvailability()}
        </> : <section className="panel">
          <div className="members-toolbar">
            <span>{result.length} thành viên</span>
            <label className="table-search">
              <Search size={16} />
              <input
                aria-label="Tìm thành viên"
                placeholder="Tìm tên hoặc MSSV…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>THÀNH VIÊN</th>
                  <th>MSSV</th>
                  <th>BAN</th>
                  {scheduleOnly ? <><th>RẢNH BUỔI SÁNG</th><th>RẢNH BUỔI CHIỀU</th></> : <>
                  <th>VAI TRÒ</th>
                  <th>LỊCH RẢNH</th>
                  <th>TRỰC THÊM</th>
                  <th>TRẠNG THÁI</th>
                  </>}
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.map((m, i) => (
                  <tr key={m.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={m.name} photoId={m.avatarId} index={i} />
                        <span>
                          <strong>{m.name}</strong>
                          <small>{m.email || "Chưa có email liên hệ"}</small>
                        </span>
                      </div>
                    </td>
                    <td className="mono muted">
                      {m.studentId || "Chờ bổ sung MSSV"}
                    </td>
                    <td className="member-committee-cell">{memberCommitteeNames(m)}</td>
                    {scheduleOnly ? <>
                      <td className="member-committee-cell">{availableDays(m.availability, "am")}</td>
                      <td className="member-committee-cell">{availableDays(m.availability, "pm")}</td>
                    </> : <>
                    <td>
                      {m.role === "admin" ? (
                        <span className="role-tag">
                          <ShieldCheck size={13} /> BĐH
                        </span>
                      ) : (
                        memberRoleLabel(m)
                      )}
                    </td>
                    <td>
                      {profileAvailability(club, m).length} buổi đã chọn
                    </td>
                    <td>
                      {m.extraDuties ? (
                        <span className="green-text">Có nguyện vọng</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <Badge status={m.active ? "attending" : "neutral"}>
                        {m.active ? "Hoạt động" : "Tạm nghỉ"}
                      </Badge>
                    </td>
                    </>}
                    <td>
                      {isAdmin ? <>
                      <button
                        className="text-button"
                        onClick={() => editMember(m)}
                      >
                        Chỉnh sửa <ChevronRight size={14} />
                      </button>
                      <button
                        className="text-button member-password-action"
                        onClick={() => passwordDialog(m)}
                        title={
                          m.needsStudentId
                            ? "Cấp tên đăng nhập và mật khẩu để thành viên tự bổ sung MSSV"
                            : undefined
                        }
                      >
                        Mật khẩu
                      </button>
                      {canDeleteMember(club, me!, m) && (
                        <Button variant="danger" aria-label={`Xóa thành viên ${m.name}`} disabled={busy} onClick={() => confirmMemberDeletion(m)}>
                          <Trash2 size={15} /> Xóa
                        </Button>
                      )}
                      </> : <button className="text-button" onClick={() => setModal({
                        title: m.name,
                        description: scheduleOnly ? "Lịch rảnh" : "Hồ sơ thành viên",
                        wide: true,
                        profile: { memberId: m.id, scheduleOnly },
                      })}>{scheduleOnly ? "Xem lịch rảnh" : "Xem hồ sơ"} <ChevronRight size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result.length && club.members.length > 0 ? (
            <Empty title="Không có thành viên phù hợp" icon={Users}>
              Hãy đổi ban hoặc từ khóa tìm kiếm
            </Empty>
          ) : !result.length ? (
            <Empty
              title="Danh sách đang chờ những cái tên đầu tiên"
              icon={Users}
              action={isAdmin &&
                <Button onClick={() => editMember()}>
                  <Plus size={16} /> Thêm thành viên
                </Button>
              }
            >
              {isAdmin && "Thêm thủ công hoặc nhập danh sách từ Excel"}
            </Empty>
          ) : null}
        </section>}
      </>
    );
  }

  function reports() {
    const participants = reportMembers(club, month);
    const participantIds = new Set(participants.map(m => m.id));
    const total = participants.map((m) => ({
      m,
      ...scoreFor(club, m.id, month),
    }));
    const rule = rulesFor(club, month);
    const waiting = club.schedules
      .filter((s) => s.month === month)
      .flatMap((s) => s.shifts.filter((t) => isDutyReportShift(s, t)).flatMap((t) => t.assignments))
      .filter((a) => participantIds.has(a.memberId) && a.result === "unverified").length;
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">MỖI ĐÓNG GÓP ĐỀU ĐƯỢC GHI NHẬN</span>
            <h1>
              Điểm tháng
            </h1>
            <p>Tổng hợp trực C1, họp và các hoạt động trong tháng, Excel xuất theo tháng</p>
          </div>
          <div className="heading-actions">
            {monthSelect}
            <Button disabled={busy} onClick={exportReport}>
              <ArrowDownToLine size={16} /> Xuất Excel
            </Button>
          </div>
        </div>
        <div className="stats-grid">
          <Stat
            title="Lượt trực hoàn thành"
            value={total.reduce((a, s) => a + s.completed, 0)}
            description="Đã được BĐH xác minh"
            icon={CalendarCheck2}
          />
          <Stat
            title="Lượt có mặt tại họp"
            value={total.reduce((a, s) => a + s.attended, 0)}
            description="Theo các buổi họp đã chốt"
            icon={UserCheck}
            color="purple"
          />
          <Stat
            title="Lượt đạt phiếu điểm danh"
            value={total.reduce((a, s) => a + s.passed, 0)}
            description={`Cộng ${rule.E} điểm mỗi phiếu đạt`}
            icon={ClipboardCheck}
            color="amber"
          />
          <Stat
            title="Trực chưa xác minh"
            value={waiting}
            description="Chưa tính A/B; đi muộn do BĐH tích được tính riêng"
            icon={Clock3}
            color="rose"
          />
        </div>
        <div className="formula-bar">
          <span>
            <Sparkles size={18} /> Công thức điểm tháng
          </span>
          <strong>
            <i>A</i> × trực đủ − <i>B</i> × vắng trực − <i>C</i> × vắng họp −{" "}
            <i>D</i> × đi muộn + <i>E</i> × phiếu điểm danh đạt + điểm sáng kiến + điểm đồng đẳng viên + điểm sự kiện + điểm theo ban + điểm riêng − điểm trừ
          </strong>
          <span>
            A = {rule.A} · B = {rule.B} · C = {rule.C} · D = {rule.D ?? 0} · E = {rule.E}
          </span>
          <button className="text-button" onClick={() => go("settings")}>
            Điều chỉnh <Settings2 size={14} />
          </button>
        </div>
        <section className="panel">
          <PanelHead
            title={monthLabel(month)}
            description="Họp và phiếu điểm danh tính theo ngày họp; ca trực tính theo ngày trực thực tế"
          />
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>THÀNH VIÊN</th>
                  <th>MSSV</th>
                  <th className="center">TRỰC ĐỦ</th>
                  <th className="center">VẮNG TRỰC *</th>
                  <th className="center">VẮNG HỌP *</th>
                  <th className="center">ĐẠT PHIẾU ĐIỂM DANH</th>
                  <th className="center">ĐI MUỘN</th>
                  <th className="center">TRỪ ĐI MUỘN</th>
                  <th className="center">ĐIỂM THÁNG</th>
                  {visibleActivityKinds.map(k => <th className="center" key={k}>{activityLabels[k]}</th>)}
                </tr>
              </thead>
              <tbody>
                {total.map((s, i) => (
                  <tr key={s.m.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={s.m.name} photoId={s.m.avatarId} index={i} />
                        <strong>{s.m.name}</strong>
                      </div>
                    </td>
                    <td className="muted mono">{s.m.studentId}</td>
                    <td className="center">{s.completed}</td>
                    <td className="center">{s.dutyMissed}</td>
                    <td className="center">{s.meetingMissed}</td>
                    <td className="center">{s.passed}</td>
                    <td className="center">{s.lateCount}</td>
                    <td className="center">
                      {s.lateDeduction > 0 ? `−${s.lateDeduction}` : "0"}
                    </td>
                    <td className="center">
                      <span
                        className={`score ${s.points < 0 ? "negative" : ""}`}
                      >
                        {s.points > 0 ? "+" : ""}
                        {s.points}
                      </span>
                    </td>
                    {visibleActivityKinds.map(k => <td className="center" key={k}>{s.activityCounts[k]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>
              * Chỉ tính vắng không phép, không đạt phiếu điểm danh không bị trừ điểm
            </span>
            <FileSpreadsheet size={17} />
          </div>
        </section>
      </>
    );
  }

  function settings() {
    const rule = rulesFor(club, month);
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              THIẾT LẬP CHO MỘT NHỊP VẬN HÀNH TỐT HƠN
            </span>
            <h1>
              Cài đặt Đội
            </h1>
            <p>
              Điều chỉnh lịch trực và hệ số điểm phù hợp với quy định của Đội
            </p>
          </div>
        </div>
        <div className="settings-layout">
          <section className="panel settings-card">
            <PanelHead title="Thông tin & ngày trực" />
            <form
              onSubmit={(e) => {
                const f = getForm(e);
                const days = [
                  ...e.currentTarget.querySelectorAll<HTMLInputElement>(
                    'input[name="day"]:checked',
                  ),
                ].map((i) => Number(i.value));
                act(
                  "settings",
                  { name: f.name, days },
                  "Đã lưu cấu hình",
                  false,
                );
              }}
            >
              <Field label="Tên Đội">
                <input
                  name="name"
                  defaultValue={club.name}
                  required
                  maxLength={80}
                />
              </Field>
              <span className="field-label">Ngày có ca trực trong tuần</span>
              <div className="day-options">
                {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                  <label key={d}>
                    <input
                      type="checkbox"
                      name="day"
                      value={d}
                      defaultChecked={club.days.includes(d)}
                    />
                    {d === 0 ? "CN" : `T${d + 1}`}
                  </label>
                ))}
              </div>
              <p className="hint">
                Mỗi ngày có 2 ca, chọn số người mỗi ca khi xếp lịch nháp, thay đổi ngày trực áp dụng cho
                lần xếp lịch nháp tiếp theo
              </p>
              <Button type="submit" disabled={busy}>
                <Check size={16} /> Lưu cấu hình
              </Button>
            </form>
          </section>
          <section className="panel settings-card">
            <PanelHead
              title="Hệ số điểm"
              description="Mức điểm cho kết quả trực, họp và phiếu điểm danh"
            />
            <form
              key={month + "-" + view?.revision}
              onSubmit={(e) => {
                const f = getForm(e);
                const coefficients = Object.fromEntries(scoreRateFields.map(([key]) => [key, parseScoreRate(f[key])]));
                const activities = Object.fromEntries(ratedActivityKinds.map(k => [k, parseScoreRate(f["activity-" + k])]));
                if (![...Object.values(coefficients), ...Object.values(activities)].every(value => value >= 0 && value <= 100000)) {
                  notify("Nhập hệ số điểm từ 0 đến 100.000, ví dụ 0,25 hoặc 0.25", true);
                  return;
                }
                act(
                  "settings",
                  { rule: { month: f.month, ...coefficients, activities } },
                  "Đã lưu hệ số điểm",
                  false,
                );
              }}
            >
              <Field label="Tháng bắt đầu áp dụng">
                <input
                  name="month"
                  type="month"
                  defaultValue={month}
                  min={today().slice(0, 7)}
                  required
                />
              </Field>
              <div className="rule-fields">
                {scoreRateFields.map(([key, label]) => (
                  <Field key={key} label={`${key} · ${label}`}>
                    <ScoreRateInput name={key} value={rule[key] ?? 0} />
                  </Field>
                ))}
              </div>
              <h3>Điểm theo lượt</h3>
              <div className="form-grid">
                {ratedActivityKinds.map(k => (
                  <Field key={k} label={activityLabels[k]}>
                    <ScoreRateInput name={`activity-${k}`} value={rule.activities?.[k] ?? 0} />
                  </Field>
                ))}
              </div>
              <p className="hint">Sáng kiến và đồng đẳng viên lấy số lượt nhân với mức điểm tương ứng, BĐH nhập điểm riêng và điểm theo ban trực tiếp trong Thành viên</p>
              <Button type="submit" disabled={busy}>
                <Check size={16} /> Lưu hệ số
              </Button>
            </form>
          </section>
          <section className="panel settings-card">
            <PanelHead title="Dữ liệu & lịch sử" />
            <div className="settings-actions">
              <Button
                variant="secondary"
                onClick={() => importDialog("members")}
              >
                <Users size={16} /> Nhập thành viên
              </Button>
              {club.demo ? (
                <Button
                  variant="danger"
                  onClick={() =>
                    setModal({
                      title: "Bắt đầu dữ liệu thật",
                      description:
                        "Xóa các thành viên, lịch trực và hoạt động mẫu, giữ lại tài khoản của bạn",
                      content: (
                        <form
                          onSubmit={(e) =>
                            act(
                              "resetDemo",
                              getForm(e),
                              "Đã chuyển sang dữ liệu thật",
                            )
                          }
                        >
                          <Field label="Nhập BAT DAU để xác nhận">
                            <input
                              name="confirm"
                              required
                              pattern="BAT DAU"
                              placeholder="BAT DAU"
                            />
                          </Field>
                          <FormFooter
                            label="Bắt đầu dữ liệu thật"
                            onCancel={closeModal}
                          />
                        </form>
                      ),
                    })
                  }
                >
                  Xóa dữ liệu mẫu
                </Button>
              ) : club.members.length === 1 && !club.schedules.length ? (
                <Button
                  variant="secondary"
                  onClick={() => act("demo", {}, "Đã nạp dữ liệu mẫu", false)}
                >
                  <Sparkles size={16} /> Nạp dữ liệu mẫu
                </Button>
              ) : null}
            </div>
            <div className="audit-list">
              {club.logs.slice(0, 10).map((l, i) => (
                <div key={`${l.at}-${i}`}>
                  <span className="audit-dot" />
                  <p>
                    <strong>{displayMessage(l.text)}</strong>
                    <small>
                      {l.actor} ·{" "}
                      {new Date(l.at).toLocaleString("vi-VN", {
                        timeZone: "Asia/Ho_Chi_Minh",
                      })}
                    </small>
                  </p>
                </div>
              ))}
              {!club.logs.length ? (
                <p className="muted">Chưa có lịch sử thay đổi</p>
              ) : null}
            </div>
          </section>
        </div>
      </>
    );
  }

  function meetingRegistration() {
    return (
        <div className="personal-top" id="personal-registration">
          {meetingCard(true)}
          <section className="panel registration-panel">
            <PanelHead
              title={
                currentWeek.closed || ownEntry?.attendanceVerified ? "Kết quả buổi họp" : "Đăng ký của tôi"
              }
            />
            <div className="registration-status">
              {currentWeek.cancelled ? (
                <Badge status="neutral">Không tổ chức họp</Badge>
              ) : (currentWeek.closed || ownEntry?.attendanceVerified) && ownEntry ? (
                <>
                  <Badge status={ownEntry.absent ? "absent" : "attending"}>
                    {ownEntry.absent
                      ? ownEntry.excused
                        ? "Vắng có phép"
                        : "Vắng không phép"
                      : "Có mặt"}
                  </Badge>
                  <p>{currentWeek.closed ? "Kết quả điểm danh đã chốt bởi BĐH hoặc hệ thống" : "Kết quả điểm danh đã được BĐH ghi nhận"}</p>
                </>
              ) : (
                <Badge status={ownEntry?.status ?? "unregistered"} />
              )}
              {ownEntry?.reason ? (
                <p>Lý do xin vắng đã gửi: {ownEntry.reason}</p>
              ) : !currentWeek.closed && !currentWeek.cancelled ? (
                <p>Hãy cho BĐH biết bạn có tham gia buổi họp tuần này nhé</p>
              ) : null}
            </div>
            {currentWeek.closed || currentWeek.cancelled || ownEntry?.attendanceVerified || !ownEntry ? (
              <div className="notice neutral">
                {currentWeek.cancelled
                  ? "Tuần này không tổ chức họp"
                  : !ownEntry
                    ? "Bạn không thuộc danh sách buổi họp tuần này, liên hệ BĐH nếu cần bổ sung"
                    : "Kết quả đã được ghi nhận, liên hệ BĐH nếu cần điều chỉnh"}
              </div>
            ) : (
              <div className="registration-buttons">
                {ownEntry?.status === "absent" ? (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() => registerDialog("pending")}
                    >
                      <MessageSquare size={16} /> Xin chuyển sang tham gia
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => registerDialog("absent")}
                    >
                      Sửa lý do vắng
                    </Button>
                  </>
                ) : ownEntry?.status === "pending" ? (
                  <>
                    <div className="notice amber">
                      Yêu cầu đang chờ BĐH duyệt, được thống kê trong nhóm chưa
                      xử lý
                    </div>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        act(
                          "register",
                          { status: "withdraw" },
                          "Đã rút yêu cầu",
                          false,
                        )
                      }
                    >
                      Rút yêu cầu
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      disabled={busy || ownEntry?.status === "attending"}
                      onClick={() =>
                        act(
                          "register",
                          { status: "attending" },
                          "Đã đăng ký tham gia",
                          false,
                        )
                      }
                    >
                      <Check size={16} />
                      {ownEntry?.status === "attending"
                        ? "Đã đăng ký tham gia"
                        : "Tôi tham gia"}
                    </Button>
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => registerDialog("absent")}
                    >
                      <Coffee size={16} /> Tôi xin vắng
                    </Button>
                  </>
                )}
              </div>
            )}
            {ownEntry?.decision ? (
              <p className="hint">Kết quả xử lý: {ownEntry.decision}</p>
            ) : null}
          </section>
        </div>
    );
  }

  function personal() {
    const mine = isAdmin ? undefined : view?.personalMonthlyScores?.[month] ?? scoreFor(club, me!.id, month);
    const shifts = club.schedules
      .filter((s) => s.published)
      .flatMap((s) => s.shifts.filter((t) => isShiftPublished(s, t)))
      .filter(
        (t) =>
          t.date >= weekId() && t.assignments.some((a) => a.memberId === me!.id),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    return (
      <>
        <div className="page-heading">
          <div className="personal-identity">
            <Avatar name={me!.name} photoId={me!.avatarId} size="large" />
            <div>
              <span className="eyebrow">{me!.name}</span>
              <h1>Góc của tôi</h1>
              <p>Đăng ký họp và xem những đóng góp của bạn tại đây</p>
            </div>
          </div>
          <div className="heading-actions">
            <Badge status="neutral">MSSV {me!.studentId}</Badge>
            <Button variant="secondary" onClick={() => setAvatarEditing(true)}>
              <ImagePlus size={16} aria-hidden="true" /> Đổi ảnh đại diện
            </Button>
            {!isAdmin && <Button variant="secondary" onClick={() => { setScoreScope("team"); go("weeklyScores"); }}>Xem điểm toàn Đội</Button>}
          </div>
        </div>
        {meetingRegistration()}
        <div className="personal-bottom">
          <section className="panel">
            <PanelHead
              title="Ca trực của tôi"
              action={
                <LinkButton onClick={() => go("duties")}>
                  Xem lịch chung
                </LinkButton>
              }
            />
            {shifts.slice(0, 5).map((shift) => (
              <div className="upcoming-row" key={shift.id}>
                <div className="date-tile">
                  <span>THÁNG {Number(shift.date.slice(5, 7))}</span>
                  <strong>{shift.date.slice(8)}</strong>
                </div>
                <div>
                  <strong>
                    Trực C1 · Ca {shift.period === "am" ? "sáng" : "chiều"}
                  </strong>
                  <span>
                    Cùng{" "}
                    {shift.assignments
                      .filter((a) => a.memberId !== me!.id)
                      .map((a) => findMember(a.memberId)?.name)
                      .join(", ") || "thành viên sẽ bổ sung"}
                  </span>
                </div>
                <Badge status="neutral">
                  {dutyNames[shift.assignments.find((a) => a.memberId === me!.id)!.result]}
                </Badge>
                {evidenceSubmissionOpen(shift) && shift.assignments.some(a => a.memberId === me!.id && a.result !== "cancelled") ? (
                  <DutyEvidenceAction
                    target={{ month: shift.date.slice(0, 7), shiftId: shift.id, memberId: me!.id }}
                    canSend
                    isAdmin={false}
                  />
                ) : null}
              </div>
            ))}
            {!shifts.length ? (
              <Empty title="Bạn chưa có ca trực từ tuần này" icon={CalendarDays}>
                Theo dõi tại đây sau khi BĐH công bố lịch
              </Empty>
            ) : null}
            <label className="extra-preference">
              <input
                type="checkbox"
                checked={me!.extraDuties}
                disabled={busy}
                onChange={(e) =>
                  act(
                    "preferences",
                    { extraDuties: e.target.checked },
                    "Đã lưu nguyện vọng",
                    false,
                  )
                }
              />
              <span>
                <strong>Tôi muốn trực thêm</strong>
                <small>Ưu tiên phân thêm sau khi mọi người đã có lượt</small>
              </span>
              <HeartHandshake size={20} />
            </label>
          </section>
          {mine && <section className="panel personal-score">
            <PanelHead title="Đóng góp tháng này" action={monthSelect} />
            <div className="my-score">
              <span>TỔNG ĐIỂM THÁNG</span>
              <strong>
                {mine.points > 0 ? "+" : ""}
                {mine.points}
              </strong>
              <p>
                {mine.completed} ca trực đủ · {mine.passed} lượt đạt phiếu điểm danh
              </p>
              <p>
                {mine.dutyMissed} lượt vắng trực không phép ·{" "}
                {mine.meetingMissed} lượt vắng họp không phép
              </p>
              <p>
                {mine.lateCount} lượt đi muộn · trừ {mine.lateDeduction} điểm
              </p>
              <LinkButton onClick={() => go("requests")}>Đăng ký sự kiện</LinkButton>
            </div>
            <p className="hint">
              Trực đủ/vắng trực tính khi xác minh; họp tính khi chốt, đi muộn
              tính theo ô BĐH tích trên lịch đã công bố
            </p>
          </section>}
        </div>
        {!isAdmin ? <div className="member-own-points">
          <div className="heading-actions">{weekSelect}</div>
          <WeeklyActivityPoints key={week.id} club={club} me={me!} isAdmin={false} week={week.id} weeklyScores={weeklyScores} busy={busy} onAction={act}/>
        </div> : null}
        <section className="panel">
          <PanelHead title="Lịch sử đăng ký" />
          <div className="history-list">
            {[...club.weeks].reverse().map((w) => {
              const e = w.entries.find((e) => e.memberId === me!.id);
              return e ? (
                <div key={w.id}>
                  <CalendarCheck2 size={20} />
                  <div>
                    <strong>
                      Tuần {dateLabel(w.id)} – {dateLabel(addDays(w.id, 6))}
                    </strong>
                    <span>
                      {w.meetingDate
                        ? `Họp ngày ${dateLabel(w.meetingDate)}`
                        : "Chưa đặt ngày họp"}
                      {w.closed ? " · Đã chốt" : ""}
                    </span>
                  </div>
                  {w.cancelled ? (
                    <Badge status="neutral">Không tổ chức họp</Badge>
                  ) : w.closed ? (
                    <Badge status={e.absent ? "absent" : "attending"}>
                      {e.absent
                        ? e.excused
                          ? "Vắng có phép"
                          : "Vắng không phép"
                        : "Có mặt"}
                    </Badge>
                  ) : (
                    <Badge status={e.status} />
                  )}
                  {e.passed ? (
                    <span className="green-text">
                      <Check size={14} /> Đạt phiếu điểm danh
                    </span>
                  ) : null}
                </div>
              ) : null;
            })}
          </div>
        </section>
      </>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Đến nội dung chính
      </a>
      <aside className={`sidebar ${mobileNav ? "mobile-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-close"
            onClick={() => setMobileNav(false)}
            aria-label="Đóng menu"
          >
            <X size={19} />
          </button>
        </div>
        <div className="workspace-label">
          <span className="workspace-symbol">
            <Leaf size={15} />
          </span>
          <div>
            <strong>{club.name}</strong>
            <span>
              {isAdmin ? "Không gian ban điều hành" : "Không gian thành viên"}
            </span>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">KHÔNG GIAN LÀM VIỆC</span>
        <nav aria-label="Điều hướng chính">
          {sidebarTabs.map(id => {
            const { icon: Icon, sections } = sidebarGroups[id];
            const active = id === activeSidebarTab;
            return (
              <button key={id} type="button" className={active ? "active" : ""}
                aria-current={active ? "page" : undefined}
                onClick={() => go(active ? activeTab : sections[0])}>
                <Icon size={19} aria-hidden="true" />
                <span>{sidebarTabLabels[id]}</span>
                {id === "activity" && pendingTotal > 0 && <b aria-hidden="true">{pendingTotal}</b>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-week">
          <div>
            <span className="live-dot" /> TUẦN HIỆN TẠI
          </div>
          {view.currentAcademicWeek != null && (
            <strong>Tuần {view.currentAcademicWeek}</strong>
          )}
          <strong>
            {dateLabel(weekId())} — {dateLabel(addDays(weekId(), 6))}
          </strong>
          <p>
            {currentWeek.closed
              ? "Đã chốt đăng ký"
              : `Đăng ký đến hết Chủ nhật`}
          </p>
          <div className="week-progress">
            <span
              style={{
                width: `${Math.round(((((weekday(today()) + 6) % 7) + 1) / 7) * 100)}%`,
              }}
            />
          </div>
        </div>
        <div className="sidebar-bottom">
          <button onClick={ownProfileDialog}>
            <UserRound size={18} />
            <span>Hồ sơ của tôi</span>
          </button>
          <button className={activeTab === "preferences" ? "active" : ""} onClick={() => go("preferences")}>
            <Settings2 size={18} />
            <span>Cài đặt cá nhân</span>
          </button>
          {isAdmin && <button className={activeTab === "overview" ? "active" : ""} onClick={() => go("overview")}>
            <LayoutDashboard size={18} />
            <span>Tổng quan</span>
          </button>}
          <button onClick={() => passwordDialog()}>
            <ShieldCheck size={18} />
            <span>Đổi mật khẩu</span>
          </button>
          {isAdmin ? (
            <button
              className={activeTab === "settings" ? "active" : ""}
              onClick={() => go("settings")}
            >
              <Settings2 size={18} />
              <span>Cài đặt Đội</span>
            </button>
          ) : null}
          <button
            onClick={() =>
              setModal({
                title: "Một nhịp vận hành đơn giản",
                description: "Hướng dẫn nhanh",
                content: (
                  <div className="help-content">
                    <p>
                      <strong>Họp tuần:</strong> tự mở thứ Hai, chốt cuối Chủ
                      nhật, xin vắng cần lý do; đổi sang tham gia cần BĐH duyệt
                    </p>
                    <p>
                      <strong>Lịch trực:</strong> BĐH nhập lịch rảnh, xếp bản
                      nháp rồi công bố, hai ca/người là ưu tiên; có thể xếp
                      thêm
                    </p>
                    <p>
                      <strong>Điểm tháng:</strong> điểm trực dựa trên ca đã xác minh,
                      vắng họp được tính khi chốt, phiếu được BĐH tích đạt cộng mức E theo ngày họp
                    </p>
                    <p>
                      <strong>Báo cáo:</strong> BĐH chọn tháng rồi bấm xuất
                      Excel, dữ liệu thiếu được ghi rõ trong bản tạm
                    </p>
                  </div>
                ),
              })
            }
          >
            <CircleHelp size={18} />
            <span>Hướng dẫn sử dụng</span>
          </button>
          <div className="sidebar-user">
            <Avatar name={me.name} photoId={me.avatarId} />
            <div>
              <strong>{me.name}</strong>
              <span>{isAdmin ? "Ban điều hành" : "Thành viên"}</span>
            </div>
            <button
              title="Đăng xuất"
              aria-label="Đăng xuất"
              onClick={logoutAccount}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav ? (
        <button
          className="mobile-scrim"
          aria-label="Đóng menu"
          onClick={() => setMobileNav(false)}
        />
      ) : null}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Mở menu"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={22} />
            </button>
            <span>Không gian Đội</span>
            <ChevronRight size={14} />
            <strong>{headerTitle}</strong>
          </div>
          <div className="topbar-right">
            <span className="today-label">{dateLabel(today(), true)}</span>
            <MusicPlayer obscured={Boolean(modal) || avatarEditing} />
            <button
              className="icon-button"
              aria-label="Cập nhật dữ liệu"
              title="Cập nhật dữ liệu"
              onClick={async () => {
                await load();
                notify("Dữ liệu đã được cập nhật");
              }}
            >
              <RefreshCw size={17} className={busy ? "spin" : ""} />
            </button>
            {isAdmin ? (
              <button
                className="icon-button notification-button"
                aria-label={`${pendingTotal} đăng ký chờ xử lý`}
                onClick={() => go(pending.length ? "meetings" : "requests")}
              >
                <Bell size={19} />
                {pendingTotal ? <i /> : null}
              </button>
            ) : null}
            <span className="topbar-divider" />
            <button
              className="icon-button avatar-trigger"
              type="button"
              title="Đổi ảnh đại diện"
              aria-label="Đổi ảnh đại diện"
              onClick={() => setAvatarEditing(true)}
            >
              <Avatar name={me.name} photoId={me.avatarId} size="small" />
            </button>
            <span className="topbar-role">
              {isAdmin ? "Ban điều hành" : "Thành viên"}
              <ChevronDown size={13} />
            </span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {club.demo &&
          !(activeTab === "members" && memberSection === "availability") &&
          !(activeTab === "duties" && club.schedules.some(schedule => schedule.sourceFilename &&
            schedule.shifts.some(shift => weekId(shift.date) === dutyWeek))) &&
          activeTab !== "links" ? (
            <div className="demo-banner">
              <Sparkles size={15} />
              <span>
                Đang xem dữ liệu mẫu · Mọi thao tác đều được lưu để bạn trải
                nghiệm
              </span>
              {isAdmin ? (
                <button onClick={() => go("settings")}>
                  Bắt đầu dữ liệu thật <ArrowRight size={14} />
                </button>
              ) : null}
            </div>
          ) : isAdmin && club.members.length === 1 && !club.schedules.length ? (
            <div className="demo-banner welcome-banner">
              <Leaf size={16} />
              <span>
                Không gian đã sẵn sàng, thêm thành viên hoặc xem bản mẫu để làm
                quen
              </span>
              <button
                disabled={busy}
                onClick={() => act("demo", {}, "Đã nạp dữ liệu mẫu", false)}
              >
                Xem dữ liệu mẫu <ArrowRight size={14} />
              </button>
            </div>
          ) : null}
          {loadError ? <div className="notice amber">{loadError}</div> : null}
          {sectionOptions.length > 0 && (
            <nav className="workspace-section-nav" aria-label={`Mục trong ${headerTitle}`}>
              {sectionOptions.map(({ id, label, pending }) => (
                <button key={id} type="button" aria-current={activeTab === id ? "page" : undefined} onClick={() => go(id)}>
                  <span>{label}</span>
                  {isAdmin && !!pending && <small aria-hidden="true">{pending}</small>}
                </button>
              ))}
            </nav>
          )}
          {activeTab === "overview" ? (
            overview()
          ) : activeTab === "meetings" ? (
            isAdmin ? <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">CÙNG GẶP NHAU MỖI TUẦN</span>
                  <h1>
                    Họp hằng tuần
                  </h1>
                  <p>
                    Đăng ký, ghi nhận có mặt và kết quả phiếu điểm danh trong một bảng
                  </p>
                </div>
                <div className="heading-actions">
                  {weekSelect}
                  <Button
                    variant="secondary"
                    onClick={editMeeting}
                    disabled={week.closed}
                  >
                    <CalendarDays size={16} /> Đặt lịch
                  </Button>
                  {!week.closed ? (
                    <Button onClick={closeWeekDialog} disabled={busy}>
                      <CheckCheck size={16} /> Chốt cuộc họp
                    </Button>
                  ) : null}
                  <Button
                    onClick={reopenWeekDialog}
                    disabled={busy || !week.closed}
                    variant="secondary"
                    title={week.closed ? undefined : "Tuần chưa chốt"}
                  >
                    <RefreshCw size={16} /> Hủy chốt cuộc họp
                  </Button>
                </div>
              </div>
              {meetingCard()}
              <div className="week-notice">
                <Clock3 size={16} />{" "}
                {week.closed
                  ? "Tuần đã chốt, điều chỉnh kết quả cần ghi lý do và được lưu lịch sử"
                  : week.reopenedForCorrection
                    ? "Tuần đã mở lại để chỉnh sửa, BĐH cần chốt lại khi hoàn tất; hệ thống không tự chốt tuần này trong lúc sửa"
                    : "Tuần chưa chốt, nút Hủy chốt sẽ bật sau khi BĐH chốt cuộc họp"}
              </div>
              {pending.length > 0 && requestsPanel(true)}
              {meetingTable()}
            </> : <>
              <div className="page-heading"><h1>Đăng ký họp</h1></div>
              {meetingRegistration()}
            </>
          ) : activeTab === "weeklyScores" ? (
            weeklyScorePage()
          ) : activeTab === "requests" ? (
            <>
              <div className="page-heading"><div><span className="eyebrow">THAM GIA VÀ ĐÓNG GÓP</span><h1>{isAdmin ? "Tạo sự kiện" : "Sự kiện Đội"}</h1><p>{isAdmin ? "Tạo sự kiện, duyệt đăng ký và thêm người đã tham gia" : "Đăng ký sự kiện và xem kết quả tham gia của bạn"}</p></div></div>
              <Activities club={club} me={me} isAdmin={isAdmin} busy={busy} onAction={act} onEvidenceSaved={load}/>
            </>
          ) : activeTab === "duties" ? (
            duties()
          ) : activeTab === "bulletin" ? (
            <BulletinBoard posts={view.bulletin?.posts ?? []} nextChangeAt={view.bulletin?.nextChangeAt}
              isAdmin={isAdmin} busy={busy} onOpen={load} onAction={(action, data, message) => act(action, data, message, false)} />
          ) : activeTab === "links" ? (
            <SharedLinks
              links={club.links ?? []}
              isAdmin={isAdmin}
              busy={busy}
              onAction={(action, data) => act(action, data, action === "deleteSharedLink" ? "Đã xóa link" : action === "moveSharedLink" ? "Đã đổi thứ tự link" : "Đã lưu link", false)}
            />
          ) : activeTab === "members" ? (
            members()
          ) : activeTab === "reports" ? (
            isAdmin ? reports() : <>
              <div className="page-heading"><h1>Điểm tháng</h1>{monthSelect}</div>
              <MemberMonthlyScoreboard key={`${me.id}:${month}:${view.revision}`} month={month} memberId={me.id}
                scope={scoreScope} onScopeChange={setScoreScope} />
            </>
          ) : activeTab === "preferences" ? (
            <>
              <div className="page-heading"><h1>Cài đặt cá nhân</h1></div>
              <FontSettings key={me.id + savedFont} current={savedFont} busy={busy}
                onSave={font => { void act("setMyFont", { font }, "Đã lưu phông chữ của bạn", false); }} />
            </>
          ) : activeTab === "settings" ? (
            settings()
          ) : (
            personal()
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={13} /> nhịp · Cùng nhau giữ nhịp hoạt động
            </span>
            <span>Tuần từ thứ Hai đến Chủ nhật · Giờ Việt Nam</span>
          </footer>
        </main>
      </div>
      {modal ? (
        <Dialog
          title={profileMember?.name ?? modal.title}
          description={modal.description}
          wide={modal.wide}
          onClose={closeModal}
          busy={busy}
        >
          {modal.profile ? (
            profileMember
              ? <MemberProfile member={profileMember} details={view.directoryAvailability?.[profileMember.id] ?? []} scheduleOnly={modal.profile.scheduleOnly} />
              : <Empty title="Hồ sơ không còn khả dụng" />
          ) : modal.content}
        </Dialog>
      ) : null}
      {avatarEditing && (
        <AvatarEditor
          key={me.id}
          member={me}
          onClose={closeAvatar}
          onRefresh={load}
          onSaved={(updated, message) => {
            setView(current => current && current.me?.id === updated.me?.id && current.revision <= updated.revision ? updated : current);
            closeAvatar();
            notify(message);
          }}
        />
      )}
      {toast ? (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <XCircle size={19} /> : <Check size={19} />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Đóng thông báo">
            <X size={15} />
          </button>
        </div>
      ) : null}
      {busy ? (
        <div className="saving-indicator" role="status">
          <LoaderCircle className="spin" size={15} /> Đang lưu…
        </div>
      ) : null}
    </div>
  );
}
function ArrowUpRightIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M7 17 17 7M7 7h10v10" />
    </svg>
  );
}
