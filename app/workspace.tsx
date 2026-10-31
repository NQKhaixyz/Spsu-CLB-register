"use client";
import Login from "./login";
import AvailabilityPage, { AvailabilityPreview } from "./availability";
import DutyRegister from "./duty-register";
import { activeAvailabilityDatasetFor, availabilityForDuty } from "../lib/availability";
import {
  useCallback,
  useEffect,
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
  LayoutDashboard,
  Leaf,
  ListFilter,
  LoaderCircle,
  LogOut,
  MapPin,
  Menu,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sun,
  Sunset,
  Upload,
  UserCheck,
  UserRound,
  Users,
  WandSparkles,
  X,
  XCircle,
} from "lucide-react";
import {
  addDays,
  dateLabel,
  dutyNames,
  monthDays,
  monthLabel,
  reportMembers,
  rulesFor,
  scoreFor,
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
  | "overview"
  | "meetings"
  | "requests"
  | "duties"
  | "availability"
  | "members"
  | "reports"
  | "settings"
  | "personal";
type Modal = {
  title: string;
  description?: string;
  content: ReactNode;
  wide?: boolean;
};
const tabs = [
  { id: "overview", name: "Tổng quan", icon: LayoutDashboard },
  { id: "meetings", name: "Họp hằng tuần", icon: CalendarCheck2 },
  { id: "requests", name: "Yêu cầu đăng ký", icon: MessageSquare },
  { id: "duties", name: "Lịch trực C1", icon: CalendarDays },
  { id: "availability", name: "Lịch rảnh", icon: ClipboardCheck },
  { id: "members", name: "Thành viên", icon: Users },
  { id: "reports", name: "Báo cáo tháng", icon: FileSpreadsheet },
] as const;
const titles: Record<Tab, string> = {
  overview: "Tổng quan",
  meetings: "Họp hằng tuần",
  requests: "Yêu cầu đăng ký",
  duties: "Lịch trực C1",
  availability: "Lịch rảnh",
  members: "Thành viên",
  reports: "Báo cáo tháng",
  settings: "Cài đặt CLB",
  personal: "Góc thành viên",
};
const getForm = (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  return Object.fromEntries(new FormData(e.currentTarget));
};
const digits = (number: number) => String(number).padStart(2, "0");

export default function Workspace() {
  const [view, setView] = useState<View | null>(null);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [mobileNav, setMobileNav] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState(weekId);
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [modal, setModal] = useState<Modal | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const closeModal = useCallback(() => setModal(null), []);
  const notify = (text: string, error = false) => setToast({ text, error });
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/workspace", { cache: "no-store" });
      if (r.status === 401) {
        setAuth(true);
        return;
      }
      const data = (await r.json()) as View & { error?: string };
      if (!r.ok) throw new Error(data.error || "Không tải được dữ liệu");
      setView(data);
      setAuth(false);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Không tải được dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
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
      if (!r.ok) throw new Error(result.error || "Không lưu được mật khẩu.");
      closeModal();
      notify(
        result.login
          ? `Đã cấp mật khẩu. Tên đăng nhập: ${result.login}`
          : "Đã đổi mật khẩu",
      );
      await load();
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không lưu được mật khẩu.", true);
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
          ? `Tên đăng nhập: ${member.loginName}. Thành viên cũng có thể dùng MSSV sau khi bổ sung hồ sơ.`
          : "Thành viên đăng nhập bằng MSSV/tên đăng nhập được cấp, không cần tài khoản OpenAI."
        : "Mật khẩu mới cần ít nhất 8 ký tự.",
      content: (
        <form
          onSubmit={(e) => {
            const f = getForm(e);
            if (f.password !== f.confirm) {
              notify("Hai mật khẩu chưa trùng nhau.", true);
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
      description: "Cập nhật thông tin cá nhân. Tên đăng nhập được cấp vẫn sử dụng được sau khi bổ sung MSSV.",
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
      const result = (await r.json()) as View & { error?: string };
      if (!r.ok) throw new Error(result.error || "Không lưu được dữ liệu");
      setView(result);
      if (close) closeModal();
      notify(message);
      return true;
    } catch (e) {
      notify(e instanceof Error ? e.message : "Không lưu được dữ liệu.", true);
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const go = (next: Tab) => {
    setTab(next);
    setFilter("all");
    setSearch("");
    setPage(0);
    setMobileNav(false);
  };
  if (loading) return <Loading />;
  if (auth) return <Login onSuccess={load} />;
  if (!view)
    return (
      <div className="welcome">
        <Brand />
        <Empty title="Chưa kết nối được dữ liệu">{loadError}</Empty>
        <Button onClick={load}>
          <RefreshCw size={16} /> Thử lại
        </Button>
      </div>
    );
  const { club, me, isAdmin } = view;
  if (view.setup || (me?.active && me.needsStudentId && !isAdmin))
    return (
      <div className="welcome setup">
        <Brand />
        <span className="setup-icon">
          <Leaf size={34} />
        </span>
        <span className="eyebrow">BẮT ĐẦU MỘT NHỊP MỚI</span>
        <h1>Hoàn tất hồ sơ của bạn.</h1>
        <p>Bổ sung MSSV để bắt đầu. Lịch trực đã được gắn với hồ sơ của bạn.</p>
        <form
          onSubmit={(e) => {
            const f = getForm(e);
            act("profile", f, "Chào mừng bạn đến với CLB");
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
            Vào không gian CLB <ArrowRight size={16} />
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
          Liên hệ BCS để mở lại tài khoản của bạn.
        </Empty>
        <Button variant="secondary" onClick={logoutAccount}>
          Đăng xuất
        </Button>
      </div>
    );
  const activeTab =
    !isAdmin && !["personal", "duties"].includes(tab) ? "personal" : tab;
  const week =
    club.weeks.find((w) => w.id === selectedWeek) ?? club.weeks.at(-1)!;
  const currentWeek = club.weeks.find((w) => w.id === weekId())!;
  const findMember = (id: string) => club.members.find((m) => m.id === id);
  const pending = club.weeks.flatMap((w) =>
    !w.closed && !w.cancelled
      ? w.entries
          .filter((e) => e.status === "pending")
          .map((e) => ({ week: w, entry: e }))
      : [],
  );
  const count = (s: Registration) =>
    week.entries.filter((e) => e.status === s).length;
  const schedule = club.schedules.find((s) => s.month === month);
  const liveMembers = club.members.filter((m) => m.active);
  const ownEntry = currentWeek.entries.find((e) => e.memberId === me!.id);
  const activeDataset = activeAvailabilityDatasetFor(club);

  function editMeeting() {
    setModal({
      title: week.closed ? "Bổ sung ngày họp" : "Lịch họp tuần này",
      description:
        "Tuần tự mở từ thứ Hai đến Chủ nhật. Ngày họp quyết định tháng thống kê.",
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
                {count("unregistered")} người chưa đăng ký. Lý do xin vắng đã có
                vẫn được giữ lại.
              </p>
            </div>
          </div>
          <p className="dialog-copy">
            Hãy rà soát ô vắng thực tế, có phép và qua quy chế trước khi chốt.
            Sau khi chốt, thành viên không thể tự sửa đăng ký.
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
          ? "Lý do sẽ được gửi riêng đến BCS."
          : "Yêu cầu được đưa vào nhóm chưa xử lý để BCS duyệt.",
      content: (
        <form
          onSubmit={(e) =>
            act(
              "register",
              { ...getForm(e), status },
              status === "absent"
                ? "Đã ghi nhận đăng ký xin vắng"
                : "Đã gửi yêu cầu đến BCS",
            )
          }
        >
          <Field
            label={
              status === "absent" ? "Lý do xin vắng *" : "Lời nhắn gửi BCS *"
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
    setModal({
      title: member ? "Hồ sơ thành viên" : "Thêm thành viên",
      description:
        "Email là thông tin liên hệ. Thành viên dùng MSSV và mật khẩu để đăng nhập.",
      wide: true,
      content: (
        <form
          onSubmit={(e) => {
            const f = getForm(e);
            act(
              "member",
              {
                ...f,
                memberId: member?.id,
                ...(member ? { active: f.active === "true" } : {}),
                extraDuties: f.extraDuties === "on",
                ...(member
                  ? {
                      availability: [
                        ...(e.currentTarget.querySelectorAll<HTMLInputElement>(
                          'input[name="availability"]:checked',
                        ) ?? []),
                      ].map((i) => i.value),
                    }
                  : {}),
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
          {member ? (
            <Field label="Vai trò">
              <select name="role" defaultValue={member.role}>
                <option value="member">Thành viên</option>
                <option value="admin">Ban cán sự</option>
              </select>
            </Field>
          ) : null}
          {member ? (
            <Field label="Trạng thái hoạt động">
              <select name="active" defaultValue={String(member.active)}>
                <option value="true">Đang hoạt động</option>
                <option value="false">Ngừng hoạt động</option>
              </select>
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
              <span className="field-label">Lịch rảnh cố định</span>
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
                          defaultChecked={member.availability.includes(
                            `${d}-${p}`,
                          )}
                        />
                      </label>
                    ))}
                  </div>
                ))}
              </div>
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
          ? "Hỗ trợ mẫu MSSV hoặc file chi tiết gồm Họ và tên, Thứ, Buổi, Tuần học."
          : "Dùng file .xlsx theo mẫu để hệ thống ghép đúng MSSV.",
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
                    description: upload.filename,
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
                                },
                                `Đã lưu ${upload.rows.length} dòng lịch rảnh chi tiết`,
                              )
                            )
                              go("availability");
                          }}
                        >
                          <FormFooter
                            label={`Lưu ${upload.rows.length} dòng lịch rảnh`}
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
                notify("Chưa tải được file mẫu.", true);
              }
            }}
          >
            <ArrowDownToLine size={16} /> Tải file mẫu
          </Button>
          {kind === "availability" ? (
            <p className="dialog-copy">
              Điền 1 hoặc x vào ca rảnh, để trống ca bận. Lịch mới áp dụng khi
              xếp lịch nháp tiếp theo; lịch đã công bố vẫn giữ nguyên. File theo
              tuần học và khung giờ cụ thể sẽ được lưu tại mục Lịch rảnh để đối
              chiếu trước khi áp dụng.
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
        `Nhip-CLB-${month}${warnings.length ? "-ban-tam" : ""}.xlsx`,
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
  function changeAssignment(shift: Shift, position: number) {
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
      description: `${dateLabel(shift.date, true)} · Ca ${shift.period === "am" ? "sáng" : "chiều"}. Người thay được cộng điểm khi đã xác minh đi trực.`,
      content: (
        <form
          onSubmit={(e) =>
            act(
              "shift",
              { ...getForm(e), month, shiftId: shift.id, position },
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
                  schedule?.shifts
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
              Chưa có người phù hợp. Kiểm tra lịch rảnh trước.
            </div>
          ) : null}
          <FormFooter label="Lưu phân công" onCancel={closeModal} busy={busy} />
        </form>
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
        <div className="meeting-art" aria-hidden="true">
          <div className="art-orbit" />
          <div className="art-orbit two" />
          <div className="art-center">
            <HeartHandshake size={44} strokeWidth={1.4} />
          </div>
          <span className="art-spark">✦</span>
          <span className="art-dot" />
        </div>
        <div className="meeting-card-top">
          <span className="eyebrow">
            <span className="live-dot" /> CUỘC HẸN TUẦN NÀY
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
          {w.cancelled ? "Tuần này nghỉ họp." : "Gặp nhau, cùng tiến lên."}
        </h2>
        <p>Một buổi gặp, thêm nhiều kết nối.</p>
        <div className="meeting-info">
          <span>
            <CalendarDays size={16} />
            {w.meetingDate
              ? `${["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"][weekday(w.meetingDate)]}, ${dateLabel(w.meetingDate)}`
              : "BCS chưa đặt ngày họp"}
            {w.meetingDate ? ` · ${w.time}` : ""}
          </span>
          <span>
            <MapPin size={16} />
            {w.location || "Địa điểm sẽ được cập nhật"}
          </span>
        </div>
        <div className="meeting-card-bottom">
          <div className="avatar-stack">
            {club.members.slice(0, 4).map((m, i) => (
              <Avatar key={m.id} name={m.name} size="small" index={i} />
            ))}
            <span>
              {personal
                ? "Hẹn gặp bạn tại buổi họp!"
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
          title={full ? "Đang chờ BCS duyệt" : "Cần bạn xử lý"}
          action={<span className="count-pill">{pending.length}</span>}
        />
        {items.length ? (
          <div className="request-list">
            {items.map(({ week: w, entry: e }, i) => (
              <div className="request-item" key={`${w.id}-${e.memberId}`}>
                <div className="request-person">
                  <Avatar
                    name={findMember(e.memberId)?.name ?? "Thành viên"}
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
            Mọi yêu cầu đã được cập nhật.
          </Empty>
        )}
        {!full && pending.length ? (
          <div className="panel-link">
            <LinkButton onClick={() => go("requests")}>
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
                <th className="center">QUA QUY CHẾ</th>
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
                        <Avatar name={m.name} index={club.members.indexOf(m)} />
                        <span>
                          <strong>{m.name}</strong>
                          {e.reason ? (
                            <small title={e.reason}>{e.reason}</small>
                          ) : (
                            <small>
                              {m.role === "admin" ? "Ban cán sự" : "Thành viên"}
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
                        aria-label={`Qua quy chế: ${m.name}`}
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
              Thử bộ lọc khác hoặc thêm thành viên vào CLB.
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
            <span className="eyebrow">MỘT TUẦN MỚI, CÙNG MỘT NHỊP</span>
            <h1>
              Mọi hoạt động, trong tầm tay<span className="heading-dot">.</span>
            </h1>
            <p>Theo dõi buổi họp, lịch trực và kết nối các thành viên.</p>
          </div>
          {weekSelect}
        </div>
        <div className="stats-grid">
          <Stat
            title="Thành viên CLB"
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
            description="Đang chờ BCS phê duyệt"
            icon={Clock3}
            color="amber"
            onClick={() => go("requests")}
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
              .flatMap((s) => s.shifts)
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
                    {shift.assignments.length}/2 người
                  </Badge>
                </div>
              ))}
            {!club.schedules.some(
              (s) => s.published && s.shifts.some((t) => t.date >= today()),
            ) ? (
              <div className="compact-empty">
                <CalendarDays size={20} />
                <span>
                  Chưa có ca trực sắp tới. Xếp lịch cho tháng mới nhé.
                </span>
              </div>
            ) : null}
          </section>
          <section className="note-card">
            <div className="note-icon">
              <Leaf size={23} />
            </div>
            <h3>
              Đều đặn một chút.
              <br />
              Gắn kết nhiều hơn.
            </h3>
            <p>
              Mỗi ca trực, mỗi buổi họp đều là một phần đóng góp của bạn cho
              CLB.
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
    const visibleShifts = schedule?.shifts ?? [];
    const activeShifts = visibleShifts.filter((t) => !t.cancelled),
      cancelledCount = visibleShifts.length - activeShifts.length;
    const seats = activeShifts.flatMap((t) => t.assignments).length;
    const shortage = activeShifts.length * 2 - seats;
    const linkedIds = activeDataset
      ? new Set(Object.values(activeDataset.memberLinks ?? {}))
      : null;
    const counts = liveMembers
      .filter((m) => !linkedIds || linkedIds.has(m.id))
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
              Lịch trực C1<span className="heading-dot">.</span>
            </h1>
            <p>
              Hai người mỗi ca · Sáng và chiều · Ưu tiên 2 ca/người, có thể trực
              thêm.
            </p>
          </div>
          <div className="heading-actions">
            {monthSelect}
            {isAdmin ? (
              <Button
                onClick={() => importDialog("availability")}
                variant="secondary"
              >
                <Upload size={16} /> Nhập lịch rảnh
              </Button>
            ) : null}
          </div>
        </div>
        {isAdmin ? (
          <div className="notice green">
            <Sparkles size={19} />
            <div>
              <strong>Hai ca là mức ưu tiên, không phải giới hạn.</strong>
              <p>
                Chia lượt đầu cho mọi người, hướng tới hai ca, sau đó ưu tiên
                người muốn trực thêm.{" "}
                {club.availabilityVersion
                  ? `Lịch rảnh cập nhật ${dateLabel(club.availabilityVersion.slice(0, 10))}.`
                  : "Hãy nhập lịch rảnh để bắt đầu."}
              </p>
            </div>
            {activeDataset?.settings ? (
              <p className="hint">
                Ca sáng {activeDataset.settings.amStart}–
                {activeDataset.settings.amEnd} · Ca chiều{" "}
                {activeDataset.settings.pmStart}–
                {activeDataset.settings.pmEnd} · Cho phép đến muộn
                tối đa {activeDataset.settings.allowedLateMinutes}{" "}
                phút khi xếp lịch.
              </p>
            ) : null}
            <Button
              disabled={busy || !!schedule?.published}
              onClick={() =>
                act(
                  "schedule",
                  { month },
                  "Đã xếp lịch nháp. Kiểm tra trước khi công bố.",
                  false,
                )
              }
            >
              <WandSparkles size={16} />{" "}
              {schedule ? "Xếp lại bản nháp" : "Xếp lịch nháp"}
            </Button>
          </div>
        ) : null}
        {schedule ? (
          <>
            <div className="schedule-summary">
              <div>
                <Badge status={schedule.published ? "attending" : "pending"}>
                  {schedule.published
                    ? "Đã công bố"
                    : "Bản nháp · Chỉ BCS nhìn thấy"}
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
              {isAdmin && !schedule.published ? (
                <Button
                  onClick={() =>
                    setModal({
                      title: "Công bố lịch trực?",
                      description: shortage
                        ? `Lịch còn thiếu ${shortage} lượt. Thành viên sẽ nhìn thấy các phân công hiện tại.`
                        : "Thành viên sẽ nhìn thấy lịch và ca trực của mình.",
                      content: (
                        <div className="form-footer">
                          <Button variant="secondary" onClick={closeModal}>
                            Kiểm tra lại
                          </Button>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              act("publish", { month }, "Đã công bố lịch trực")
                            }
                          >
                            <CheckCheck size={16} /> Công bố lịch
                          </Button>
                        </div>
                      ),
                    })
                  }
                >
                  Công bố lịch <ArrowRight size={16} />
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
                  {Array.from(
                    { length: (weekday(month + "-01") + 6) % 7 },
                    (_, i) => (
                      <div className="calendar-cell blank" key={`blank-${i}`} />
                    ),
                  )}
                  {monthDays(month).map((date) => {
                    const shifts = visibleShifts.filter((t) => t.date === date);
                    return (
                      <div
                        key={date}
                        className={`calendar-cell ${date === today() ? "today" : ""} ${!shifts.length ? "offday" : ""}`}
                      >
                        <span className="calendar-number">
                          {Number(date.slice(8))}
                          {date === today() ? <small>Hôm nay</small> : null}
                        </span>
                        {shifts.map((shift) => (
                          <button
                            className={`calendar-shift ${shift.period} ${shift.cancelled ? "cancelled" : ""}`}
                            aria-label={`Ca ${shift.period === "am" ? "sáng" : "chiều"} ngày ${dateLabel(date, true)}${shift.cancelled ? " · Đã hủy" : ""}`}
                            key={shift.id}
                            onClick={() =>
                              setModal({
                                title: `Trực C1 · ${dateLabel(date, true)}`,
                                description: `Ca ${shift.period === "am" ? "sáng" : "chiều"}${shift.startTime ? ` ${shift.startTime}–${shift.endTime}` : ""}${shift.academicWeek ? ` · Tuần học ${shift.academicWeek}` : ""} · ${shift.cancelled ? "Đã hủy" : schedule.published ? "Đã công bố" : "Bản nháp"}`,
                                content: (
                                  <div className="shift-detail">
                                    {shift.cancelled ? (
                                      <div className="notice neutral">
                                        Ca này đã hủy cho cả hai người, không
                                        cộng/trừ điểm. {shift.cancelReason}
                                      </div>
                                    ) : null}
                                    {[0, 1].map((position) => {
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
                                                index={position + 1}
                                              />
                                              <div>
                                                <strong>{m.name}</strong>
                                                <small>
                                                  {a.originalId &&
                                                  a.originalId !== a.memberId
                                                    ? `Thay ${findMember(a.originalId)?.name}`
                                                    : "Thành viên phụ trách"}
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
                                              BCS: {a.note}
                                            </p>
                                          ) : null}
                                          {isAdmin ? (
                                            <>
                                              <Button
                                                variant="secondary"
                                                disabled={
                                                  busy || shift.cancelled
                                                }
                                                onClick={() =>
                                                  changeAssignment(
                                                    shift,
                                                    position,
                                                  )
                                                }
                                              >
                                                {m ? "Đổi người" : "Chọn người"}
                                              </Button>
                                              {a && schedule.published ? (
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
                                                          month,
                                                          shiftId: shift.id,
                                                          position,
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
                                              {a && schedule.published ? (
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
                                                          month,
                                                          shiftId: shift.id,
                                                          position,
                                                          late: e.target
                                                            .checked,
                                                        },
                                                        "Đã ghi nhận đến muộn",
                                                      )
                                                    }
                                                  />{" "}
                                                  Đến muộn{" "}
                                                  <small>
                                                    Không tích = không đến muộn.
                                                    Tích ô sẽ trừ{" "}
                                                    {rulesFor(club, month).D ??
                                                      0}{" "}
                                                    điểm. Lý do hợp lệ thì để
                                                    trống.
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
                                                        month,
                                                        shiftId: shift.id,
                                                        position,
                                                      },
                                                      "Đã lưu ghi chú ca trực",
                                                    )
                                                  }
                                                >
                                                  <Field
                                                    label={`Ghi chú BCS: ${m?.name}`}
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
                                            { month, shiftId: shift.id },
                                            shift.cancelled
                                              ? "Đã khôi phục cả ca"
                                              : "Đã hủy cả ca cho hai người; ca này không cộng/trừ điểm",
                                          )
                                        }
                                      >
                                        {shift.cancelled
                                          ? "Khôi phục ca"
                                          : "Hủy cả ca"}
                                      </Button>
                                    ) : null}
                                    {isAdmin &&
                                    !schedule.published &&
                                    !shift.cancelled ? (
                                      <Button
                                        variant="danger"
                                        onClick={() =>
                                          act(
                                            "shift",
                                            {
                                              month,
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
                            shift.assignments.length < 2 ? (
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
                    description="Mức ưu tiên: 2 ca/người"
                  />
                  <div className="distribution-list">
                    {counts
                      .sort((a, b) => b.n - a.n)
                      .map(({ m, n }, i) => (
                        <div key={m.id}>
                          <Avatar name={m.name} size="small" index={i} />
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
                    Số ca có thể hơn 2 theo nhu cầu và lịch rảnh. Các ca chưa đủ
                    người được đánh dấu trong lịch.
                  </p>
                </aside>
              ) : null}
            </div>
            {isAdmin ? (
              <DutyRegister
                key={schedule.month}
                schedule={schedule}
                members={club.members}
                busy={busy}
                onUpdate={(data) =>
                  act("shift", data, "Đã lưu kết quả ca trực", false)
                }
                rule={rulesFor(club, month)}
              />
            ) : null}
          </>
        ) : (
          <section className="panel">
            <Empty
              title="Chưa có lịch trực tháng này"
              icon={CalendarDays}
              action={
                isAdmin ? (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      act("schedule", { month }, "Đã tạo lịch nháp", false)
                    }
                  >
                    <WandSparkles size={16} /> Xếp lịch nháp
                  </Button>
                ) : undefined
              }
            >
              {isAdmin
                ? "Nhập lịch rảnh và để hệ thống gợi ý phân công cho cả tháng."
                : "BCS sẽ công bố lịch trực sau khi kiểm tra bản nháp."}
            </Empty>
          </section>
        )}
      </>
    );
  }

  function members() {
    const result = club.members.filter((m) =>
      `${m.name} ${m.studentId}`
        .toLocaleLowerCase("vi")
        .includes(search.toLocaleLowerCase("vi")),
    );
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">MỖI NGƯỜI LÀ MỘT PHẦN CỦA TẬP THỂ</span>
            <h1>
              Những người cùng nhịp<span className="heading-dot">.</span>
            </h1>
            <p>
              {liveMembers.length} thành viên đang hoạt động · Quản lý hồ sơ và
              lịch rảnh tại đây.
            </p>
            {!club.demo && club.officialSince ? (
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
          <div className="heading-actions">
            <Button variant="secondary" onClick={() => importDialog("members")}>
              <Upload size={16} /> Nhập Excel
            </Button>
            <Button onClick={() => editMember()}>
              <Plus size={16} /> Thêm thành viên
            </Button>
          </div>
        </div>
        <section className="panel">
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
                  <th>VAI TRÒ</th>
                  <th>LỊCH RẢNH</th>
                  <th>TRỰC THÊM</th>
                  <th>TRẠNG THÁI</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {result.map((m, i) => (
                  <tr key={m.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={m.name} index={i} />
                        <span>
                          <strong>{m.name}</strong>
                          <small>{m.email || "Chưa có email liên hệ"}</small>
                        </span>
                      </div>
                    </td>
                    <td className="mono muted">
                      {m.studentId || "Chờ bổ sung MSSV"}
                    </td>
                    <td>
                      {m.role === "admin" ? (
                        <span className="role-tag">
                          <ShieldCheck size={13} /> BCS
                        </span>
                      ) : (
                        "Thành viên"
                      )}
                    </td>
                    <td>
                      {Object.values(
                        activeDataset?.memberLinks ?? {},
                      ).includes(m.id)
                        ? `${activeDataset?.rows.filter((r) => activeDataset?.memberLinks?.[r.name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi")] === m.id).length} khung theo tuần học`
                        : `${m.availability.length} khung giờ/tuần`}
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
                        {m.active ? "Hoạt động" : "Tạm dừng"}
                      </Badge>
                    </td>
                    <td>
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result.length ? (
            <Empty
              title="Danh sách đang chờ những cái tên đầu tiên"
              icon={Users}
              action={
                <Button onClick={() => editMember()}>
                  <Plus size={16} /> Thêm thành viên
                </Button>
              }
            >
              Thêm thủ công hoặc nhập danh sách từ Excel.
            </Empty>
          ) : null}
        </section>
      </>
    );
  }

  function reports() {
    const total = reportMembers(club, month).map((m) => ({
      m,
      ...scoreFor(club, m.id, month),
    }));
    const rule = rulesFor(club, month);
    const waiting = club.schedules
      .filter((s) => s.month === month && s.published)
      .flatMap((s) => s.shifts.flatMap((t) => t.assignments))
      .filter((a) => a.result === "unverified").length;
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">MỖI ĐÓNG GÓP ĐỀU ĐƯỢC GHI NHẬN</span>
            <h1>
              Báo cáo hoạt động<span className="heading-dot">.</span>
            </h1>
            <p>Tổng hợp trực C1, tham gia họp và quy chế trong tháng.</p>
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
            description="Đã được BCS xác minh"
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
            title="Lượt qua quy chế"
            value={total.reduce((a, s) => a + s.passed, 0)}
            description="BCS ghi nhận trực tiếp"
            icon={ClipboardCheck}
            color="amber"
          />
          <Stat
            title="Trực chưa xác minh"
            value={waiting}
            description="Chưa tính A/B; đi muộn do BCS tích được tính riêng"
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
            <i>D</i> × đi muộn
          </strong>
          <span>
            A = {rule.A} · B = {rule.B} · C = {rule.C} · D = {rule.D ?? 0}
          </span>
          <button className="text-button" onClick={() => go("settings")}>
            Điều chỉnh <Settings2 size={14} />
          </button>
        </div>
        <section className="panel">
          <PanelHead
            title={monthLabel(month)}
            description="Họp và quy chế tính theo ngày họp; ca trực tính theo ngày trực thực tế."
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
                  <th className="center">QUA QUY CHẾ</th>
                  <th className="center">ĐI MUỘN</th>
                  <th className="center">TRỪ ĐI MUỘN</th>
                  <th className="center">ĐIỂM THÁNG</th>
                </tr>
              </thead>
              <tbody>
                {total.map((s, i) => (
                  <tr key={s.m.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar name={s.m.name} index={i} />
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>
              * Chỉ tính vắng không phép. Không qua quy chế không bị trừ điểm.
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
              Cài đặt CLB<span className="heading-dot">.</span>
            </h1>
            <p>
              Điều chỉnh lịch trực và hệ số điểm phù hợp với quy định của CLB.
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
              <Field label="Tên CLB">
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
                Mỗi ngày có 2 ca, mỗi ca 2 người. Thay đổi ngày trực áp dụng cho
                lần xếp lịch nháp tiếp theo.
              </p>
              <Button type="submit" disabled={busy}>
                <Check size={16} /> Lưu cấu hình
              </Button>
            </form>
          </section>
          <section className="panel settings-card">
            <PanelHead
              title="Hệ số điểm"
              description="A cộng trực đủ; B/C trừ vắng không phép; D trừ mỗi lượt BCS tích đi muộn."
            />
            <form
              key={month}
              onSubmit={(e) => {
                const f = getForm(e);
                act(
                  "settings",
                  {
                    rule: {
                      month: f.month,
                      A: Number(f.A),
                      B: Number(f.B),
                      C: Number(f.C),
                      D: Number(f.D),
                    },
                  },
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
                {[
                  ["A", "Cộng mỗi ca trực đủ"],
                  ["B", "Trừ mỗi ca trực vắng không phép"],
                  ["C", "Trừ mỗi buổi họp vắng không phép"],
                  ["D", "Trừ mỗi lượt đi muộn"],
                ].map(([key, label]) => (
                  <Field key={key} label={`${key} · ${label}`}>
                    <input
                      name={key}
                      type="number"
                      min={0}
                      max={100000}
                      step="0.5"
                      defaultValue={rule[key as "A" | "B" | "C" | "D"] ?? 0}
                      required
                    />
                  </Field>
                ))}
              </div>
              <p className="hint">
                Họp có mặt, vắng có phép và quy chế không làm thay đổi điểm. Hệ
                số mặc định là 0 cho đến khi BCS đặt quy định.
              </p>
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
                onClick={() => importDialog("availability")}
              >
                <Upload size={16} /> Nhập lịch rảnh
              </Button>
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
                        "Xóa các thành viên, lịch trực và hoạt động mẫu. Giữ lại tài khoản của bạn.",
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
                    <strong>{l.text}</strong>
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
                <p className="muted">Chưa có lịch sử thay đổi.</p>
              ) : null}
            </div>
          </section>
        </div>
      </>
    );
  }

  function personal() {
    const mine = scoreFor(club, me!.id, month);
    const shifts = club.schedules
      .filter((s) => s.published)
      .flatMap((s) => s.shifts)
      .filter(
        (t) =>
          t.date >= today() && t.assignments.some((a) => a.memberId === me!.id),
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    return (
      <>
        <div className="page-heading">
          <div>
            <span className="eyebrow">MỖI THÀNH VIÊN, MỘT NHỊP CHUNG</span>
            <h1>
              Chào {me!.name.split(" ").at(-1)}, tuần này bạn thế nào
              <span className="heading-dot">?</span>
            </h1>
            <p>Đăng ký họp và xem những đóng góp của bạn tại đây.</p>
          </div>
          <Badge status="neutral">MSSV {me!.studentId}</Badge>
        </div>
        <div className="personal-top">
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
                  <p>{currentWeek.closed ? "Kết quả điểm danh đã chốt bởi BCS hoặc hệ thống." : "Kết quả điểm danh đã được BCS ghi nhận."}</p>
                </>
              ) : (
                <Badge status={ownEntry?.status ?? "unregistered"} />
              )}
              {ownEntry?.reason ? (
                <p>Lý do xin vắng đã gửi: {ownEntry.reason}</p>
              ) : !currentWeek.closed && !currentWeek.cancelled ? (
                <p>Hãy cho BCS biết bạn có tham gia buổi họp tuần này nhé.</p>
              ) : null}
            </div>
            {currentWeek.closed || currentWeek.cancelled || ownEntry?.attendanceVerified || !ownEntry ? (
              <div className="notice neutral">
                {currentWeek.cancelled
                  ? "Tuần này không tổ chức họp."
                  : !ownEntry
                    ? "Bạn không thuộc danh sách buổi họp tuần này. Liên hệ BCS nếu cần bổ sung."
                    : "Kết quả đã được ghi nhận. Liên hệ BCS nếu cần điều chỉnh."}
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
                      Yêu cầu đang chờ BCS duyệt, được thống kê trong nhóm chưa
                      xử lý.
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
                  {
                    dutyNames[
                      shift.assignments.find((a) => a.memberId === me!.id)!
                        .result
                    ]
                  }
                </Badge>
              </div>
            ))}
            {!shifts.length ? (
              <Empty title="Bạn chưa có ca trực sắp tới" icon={CalendarDays}>
                Theo dõi tại đây sau khi BCS công bố lịch.
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
                <small>Ưu tiên phân thêm sau khi mọi người đã có lượt.</small>
              </span>
              <HeartHandshake size={20} />
            </label>
          </section>
          <section className="panel personal-score">
            <PanelHead title="Đóng góp tháng này" action={monthSelect} />
            <div className="my-score">
              <span>ĐIỂM HOẠT ĐỘNG</span>
              <strong>
                {mine.points > 0 ? "+" : ""}
                {mine.points}
              </strong>
              <p>
                {mine.completed} ca trực đủ · {mine.passed} lượt qua quy chế
              </p>
              <p>
                {mine.dutyMissed} lượt vắng trực không phép ·{" "}
                {mine.meetingMissed} lượt vắng họp không phép
              </p>
              <p>
                {mine.lateCount} lượt đi muộn · trừ {mine.lateDeduction} điểm
              </p>
            </div>
            <p className="hint">
              Trực đủ/vắng trực tính khi xác minh; họp tính khi chốt. Đi muộn
              tính theo ô BCS tích trên lịch đã công bố.
            </p>
          </section>
        </div>
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
                      <Check size={14} /> Qua quy chế
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
              {isAdmin ? "Không gian ban cán sự" : "Không gian thành viên"}
            </span>
          </div>
          <ChevronDown size={14} />
        </div>
        <span className="nav-label">KHÔNG GIAN LÀM VIỆC</span>
        <nav aria-label="Điều hướng chính">
          {(isAdmin ? tabs : tabs.filter((t) => t.id === "duties")).map(
            (item) => (
              <button
                key={item.id}
                className={activeTab === item.id ? "active" : ""}
                onClick={() => go(item.id)}
              >
                <item.icon size={19} />
                <span>{item.name}</span>
                {item.id === "requests" && pending.length ? (
                  <b>{pending.length}</b>
                ) : null}
              </button>
            ),
          )}
          <button
            className={activeTab === "personal" ? "active" : ""}
            onClick={() => go("personal")}
          >
            <UserRound size={19} />
            <span>Góc thành viên</span>
          </button>
        </nav>
        <div className="sidebar-week">
          <div>
            <span className="live-dot" /> TUẦN HIỆN TẠI
          </div>
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
              <span>Cài đặt CLB</span>
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
                      nhật. Xin vắng cần lý do; đổi sang tham gia cần BCS duyệt.
                    </p>
                    <p>
                      <strong>Lịch trực:</strong> BCS nhập lịch rảnh, xếp bản
                      nháp rồi công bố. Hai ca/người là ưu tiên; có thể xếp
                      thêm.
                    </p>
                    <p>
                      <strong>Điểm tháng:</strong> chỉ ca đã xác minh và họp đã
                      chốt được tính. Qua quy chế được ghi nhận riêng, không trừ
                      điểm.
                    </p>
                    <p>
                      <strong>Báo cáo:</strong> BCS chọn tháng rồi bấm xuất
                      Excel. Dữ liệu thiếu được ghi rõ trong bản tạm.
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
            <Avatar name={me.name} />
            <div>
              <strong>{me.name}</strong>
              <span>{isAdmin ? "Ban cán sự" : "Thành viên"}</span>
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
            <span>Không gian CLB</span>
            <ChevronRight size={14} />
            <strong>{titles[activeTab]}</strong>
          </div>
          <div className="topbar-right">
            <span className="today-label">{dateLabel(today(), true)}</span>
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
                aria-label={`${pending.length} yêu cầu chờ xử lý`}
                onClick={() => go("requests")}
              >
                <Bell size={19} />
                {pending.length ? <i /> : null}
              </button>
            ) : null}
            <span className="topbar-divider" />
            <Avatar name={me.name} size="small" />
            <span className="topbar-role">
              {isAdmin ? "Ban cán sự" : "Thành viên"}
              <ChevronDown size={13} />
            </span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          {club.demo &&
          activeTab !== "availability" &&
          !(activeTab === "duties" && schedule?.sourceFilename) ? (
            <div className="demo-banner">
              <Sparkles size={15} />
              <span>
                Đang xem dữ liệu mẫu · Mọi thao tác đều được lưu để bạn trải
                nghiệm.
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
                Không gian đã sẵn sàng. Thêm thành viên hoặc xem bản mẫu để làm
                quen.
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
          {activeTab === "overview" ? (
            overview()
          ) : activeTab === "meetings" ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">CÙNG GẶP NHAU MỖI TUẦN</span>
                  <h1>
                    Họp hằng tuần<span className="heading-dot">.</span>
                  </h1>
                  <p>
                    Đăng ký, ghi nhận có mặt và kết quả quy chế trong một bảng.
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
                  <Button
                    onClick={closeWeekDialog}
                    disabled={week.closed || busy}
                  >
                    <CheckCheck size={16} />
                    {week.closed ? "Đã chốt" : "Chốt cuộc họp"}
                  </Button>
                </div>
              </div>
              {meetingCard()}
              <div className="week-notice">
                <Clock3 size={16} />{" "}
                {week.closed
                  ? "Tuần đã chốt. Điều chỉnh kết quả cần ghi lý do và được lưu lịch sử."
                  : "Chưa xử lý và chưa đăng ký là hai nhóm riêng. Cả hai chuyển vắng khi chốt hoặc hết tuần."}
              </div>
              {meetingTable()}
            </>
          ) : activeTab === "requests" ? (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    LẮNG NGHE VÀ CẬP NHẬT KỊP THỜI
                  </span>
                  <h1>
                    Yêu cầu đăng ký<span className="heading-dot">.</span>
                  </h1>
                  <p>
                    {pending.length} yêu cầu đổi từ xin vắng sang tham gia đang
                    chờ phê duyệt.
                  </p>
                </div>
              </div>
              {requestsPanel(true)}
            </>
          ) : activeTab === "duties" ? (
            duties()
          ) : activeTab === "availability" ? (
            <AvailabilityPage
              dataset={club.availabilityDataset}
              onImport={() => importDialog("availability")}
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
          ) : activeTab === "members" ? (
            members()
          ) : activeTab === "reports" ? (
            reports()
          ) : activeTab === "settings" ? (
            settings()
          ) : (
            personal()
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={13} /> nhịp. · Cùng nhau giữ nhịp hoạt động
            </span>
            <span>Tuần từ thứ Hai đến Chủ nhật · Giờ Việt Nam</span>
          </footer>
        </main>
      </div>
      {modal ? (
        <Dialog
          title={modal.title}
          description={modal.description}
          wide={modal.wide}
          onClose={closeModal}
          busy={busy}
        >
          {modal.content}
        </Dialog>
      ) : null}
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
