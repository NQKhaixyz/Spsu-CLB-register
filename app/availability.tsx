"use client";
import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileSpreadsheet,
  Search,
  Upload,
  Users,
} from "lucide-react";
import {
  today,
  type AvailabilityDataset,
  type AvailabilityDetail,
} from "../lib/club";
import { Badge, Button, Empty, PanelHead, Stat, Field } from "./ui";

const personKey = (name: string) =>
  name.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("vi");
const peopleCount = (rows: AvailabilityDetail[]) =>
  new Set(rows.map((r) => personKey(r.name))).size;

export function AvailabilityPreview({ rows }: { rows: AvailabilityDetail[] }) {
  return (
    <>
      <div className="notice neutral">
        Đọc được{" "}
        <strong>
          {rows.length} dòng lịch rảnh của {peopleCount(rows)} người
        </strong>
        . File không có MSSV. Khung giờ, tuần học và ghi chú được lưu nguyên văn
        để BCS đối chiếu.
      </div>
      <DetailTable rows={rows.slice(0, 8)} />
      {rows.length > 8 ? (
        <p className="hint">
          Xem trước 8/{rows.length} dòng. Toàn bộ dữ liệu sẽ hiện trong mục Lịch
          rảnh sau khi lưu.
        </p>
      ) : null}
      <p className="dialog-copy">
        Bản chi tiết được lưu để xem và đối chiếu. Đặt mốc tuần học và giờ ca để
        áp dụng xếp lịch. Những tên chưa có trong danh sách được tạo hồ sơ chờ
        BCS bổ sung MSSV trước khi cấp tài khoản.
      </p>
    </>
  );
}

function DetailTable({ rows }: { rows: AvailabilityDetail[] }) {
  return (
    <div className="table-scroll availability-table">
      <table>
        <thead>
          <tr>
            <th>DÒNG</th>
            <th>HỌ VÀ TÊN</th>
            <th>THỨ</th>
            <th>KHUNG GIỜ</th>
            <th>TUẦN HỌC</th>
            <th>GHI CHÚ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.sourceRow}>
              <td className="muted mono">{r.sourceRow}</td>
              <td>
                <strong>{r.name}</strong>
              </td>
              <td>{r.day}</td>
              <td>{r.period}</td>
              <td>{r.weeks}</td>
              <td>{r.note || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AvailabilityPage({
  dataset,
  onImport,
  busy,
  onActivate,
  official,
  onOfficial,
}: {
  dataset?: AvailabilityDataset;
  onImport: () => void;
  busy: boolean;
  onActivate: (data: Record<string, unknown>) => Promise<boolean>;
  official: boolean;
  onOfficial: () => void;
}) {
  const [search, setSearch] = useState("");
  const [day, setDay] = useState("all");
  const [page, setPage] = useState(0);
  const rows = dataset?.rows ?? [];
  const filtered = rows.filter(
    (r) =>
      (day === "all" || r.day === day) &&
      personKey(`${r.name} ${r.period} ${r.weeks} ${r.note}`).includes(
        personKey(search),
      ),
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / 25) - 1),
    current = Math.min(page, lastPage);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">LỊCH RẢNH CỦA THÀNH VIÊN</span>
          <h1>
            Lịch rảnh chi tiết<span className="heading-dot">.</span>
          </h1>
          <p>Đối chiếu khung giờ, tuần học và ghi chú từ file Excel của CLB.</p>
        </div>
        <Button disabled={busy} onClick={onImport}>
          <Upload size={16} /> Nhập lịch rảnh
        </Button>
      </div>
      {!dataset ? (
        <section className="panel">
          <Empty title="Chưa có bản lịch rảnh chi tiết" icon={CalendarDays}>
            Nhập file có các cột Họ và tên, Thứ, Buổi, Tuần học; cột ghi chú có
            thể để trống.
          </Empty>
        </section>
      ) : (
        <>
          <div className="stats-grid">
            <Stat
              title="Thành viên trong file"
              value={peopleCount(rows)}
              description="Thống kê theo họ tên"
              icon={Users}
            />
            <Stat
              title="Khung rảnh đã lưu"
              value={rows.length}
              description="Giữ nguyên từng dòng nguồn"
              icon={Clock3}
              color="purple"
            />
            <Stat
              title="Ngày trong tuần"
              value={new Set(rows.map((r) => r.day)).size}
              description="Theo dữ liệu được nhập"
              icon={CalendarDays}
              color="amber"
            />
            <Stat
              title="Dòng có ghi chú"
              value={rows.filter((r) => r.note).length}
              description="BCS cần đối chiếu điều kiện riêng"
              icon={FileSpreadsheet}
              color="rose"
            />
          </div>
          <div className="notice amber availability-notice">
            <strong>
              {dataset.settings
                ? "Đã áp dụng lịch rảnh theo tuần học"
                : "Đã lưu bản chi tiết · Chưa áp dụng xếp lịch"}
            </strong>
            <p>
              {dataset.settings
                ? `Tuần ${dataset.settings.anchorWeek} bắt đầu ${dataset.settings.anchorDate}. Ca sáng ${dataset.settings.amStart}–${dataset.settings.amEnd}, ca chiều ${dataset.settings.pmStart}–${dataset.settings.pmEnd}. Cho phép đến muộn tối đa ${dataset.settings.allowedLateMinutes} phút.`
                : "Đặt mốc tuần học và giờ ca bên dưới để xếp lịch. Người chưa có MSSV được tạo hồ sơ theo tên, chờ BCS bổ sung MSSV trước khi cấp tài khoản."}
            </p>
          </div>
          {dataset.memberLinks ? (
            <div
              className={`notice ${official ? "green" : "neutral"} availability-notice`}
            >
              <strong>
                {official
                  ? `${Object.keys(dataset.memberLinks).length} người đã được lưu trong danh sách chính thức`
                  : `${Object.keys(dataset.memberLinks).length} hồ sơ từ file đã được lưu`}
              </strong>
              {!official ? (
                <>
                  <p>
                    Chuyển sang vận hành chính thức sẽ giữ danh sách thật và
                    lịch trực từ file, lưu riêng phần dữ liệu mẫu.
                  </p>
                  <Button disabled={busy} onClick={onOfficial}>
                    Dùng danh sách này làm chính thức
                  </Button>
                </>
              ) : (
                <p>
                  BCS bổ sung MSSV trong mục Thành viên trước khi cấp tài khoản
                  cho người chưa có MSSV.
                </p>
              )}
            </div>
          ) : null}
          <section className="panel availability-settings">
            <PanelHead
              title="Áp dụng và xếp lịch nháp"
              description="Bản nháp dành cho BCS kiểm tra trước khi công bố."
            />
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const f = Object.fromEntries(new FormData(e.currentTarget));
                await onActivate({
                  ...f,
                  anchorWeek: Number(f.anchorWeek),
                  allowedLateMinutes: Number(f.allowedLateMinutes),
                  ignoreSourceNotes: true,
                });
              }}
            >
              <div className="form-grid">
                <Field label="Tuần học tại mốc">
                  <input
                    name="anchorWeek"
                    type="number"
                    min={1}
                    max={53}
                    required
                    defaultValue={dataset.settings?.anchorWeek ?? 11}
                  />
                </Field>
                <Field label="Ngày bắt đầu tuần học tại mốc">
                  <input
                    name="anchorDate"
                    type="date"
                    required
                    defaultValue={dataset.settings?.anchorDate ?? today()}
                  />
                </Field>
                <Field label="Bắt đầu phân ca từ ngày">
                  <input
                    name="startDate"
                    type="date"
                    required
                    defaultValue={dataset.settings?.startDate ?? today()}
                  />
                </Field>
                <Field label="Tháng xếp lịch nháp">
                  <input
                    name="month"
                    type="month"
                    required
                    defaultValue={(
                      dataset.settings?.startDate ?? today()
                    ).slice(0, 7)}
                  />
                </Field>
                <Field label="Ca sáng bắt đầu">
                  <input
                    name="amStart"
                    type="time"
                    required
                    defaultValue={dataset.settings?.amStart ?? "08:30"}
                  />
                </Field>
                <Field label="Ca sáng kết thúc">
                  <input
                    name="amEnd"
                    type="time"
                    required
                    defaultValue={dataset.settings?.amEnd ?? "11:30"}
                  />
                </Field>
                <Field label="Ca chiều bắt đầu">
                  <input
                    name="pmStart"
                    type="time"
                    required
                    defaultValue={dataset.settings?.pmStart ?? "14:00"}
                  />
                </Field>
                <Field label="Ca chiều kết thúc">
                  <input
                    name="pmEnd"
                    type="time"
                    required
                    defaultValue={dataset.settings?.pmEnd ?? "17:30"}
                  />
                </Field>
                <Field label="Đến muộn tối đa (phút)">
                  <input
                    name="allowedLateMinutes"
                    type="number"
                    min={0}
                    max={60}
                    required
                    defaultValue={dataset.settings?.allowedLateMinutes ?? 30}
                  />
                </Field>
              </div>
              <p className="hint">
                Cột ghi chú cuối file không dùng để xếp lịch. BCS nhập ghi chú
                ca và tích Đến muộn trong bảng theo dõi trực. Chỉ các khung rảnh
                đủ đến hết ca và bắt đầu không muộn quá mức cho phép mới được
                chọn.
              </p>
              <Button type="submit" disabled={busy}>
                Áp dụng và xếp lịch nháp
              </Button>
            </form>
          </section>
          <section className="panel">
            <PanelHead
              title={dataset.filename}
              description={`Nhập lúc ${new Date(dataset.importedAt).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })} · ${dataset.importedBy}`}
              action={<Badge status="neutral">Dữ liệu từ Excel</Badge>}
            />
            <div className="availability-toolbar">
              <label className="availability-search">
                <Search size={17} />
                <input
                  aria-label="Tìm trong lịch rảnh"
                  placeholder="Tìm tên, khung giờ, tuần học…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <select
                aria-label="Lọc theo thứ"
                value={day}
                onChange={(e) => {
                  setDay(e.target.value);
                  setPage(0);
                }}
              >
                <option value="all">Tất cả các thứ</option>
                {[...new Set(rows.map((r) => r.day))]
                  .sort((a, b) => a.localeCompare(b, "vi", { numeric: true }))
                  .map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
              </select>
            </div>
            {filtered.length ? (
              <DetailTable
                rows={filtered.slice(current * 25, (current + 1) * 25)}
              />
            ) : (
              <Empty title="Không có dòng phù hợp">
                Thử đổi từ khóa hoặc bộ lọc.
              </Empty>
            )}
            <div className="table-footer">
              <span>
                {filtered.length
                  ? `${current * 25 + 1}–${Math.min((current + 1) * 25, filtered.length)} / ${filtered.length} dòng`
                  : "0 dòng"}
              </span>
              <div className="availability-pagination">
                <button
                  className="icon-button"
                  aria-label="Trang trước lịch rảnh"
                  disabled={!current}
                  onClick={() => setPage(current - 1)}
                >
                  <ChevronLeft size={17} />
                </button>
                <span>
                  {current + 1}/{lastPage + 1}
                </span>
                <button
                  className="icon-button"
                  aria-label="Trang sau lịch rảnh"
                  disabled={current === lastPage}
                  onClick={() => setPage(current + 1)}
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
