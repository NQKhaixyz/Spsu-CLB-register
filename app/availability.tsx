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
import type { AvailabilityDataset, AvailabilityDetail } from "../lib/club";
import { Badge, Button, Empty, PanelHead, Stat } from "./ui";

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
        Bản chi tiết này được lưu để xem và đối chiếu. Để đưa vào xếp lịch cần
        ghép đúng MSSV, xác định ngày bắt đầu tuần học số 1 và giờ ca
        sáng/chiều.
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
}: {
  dataset?: AvailabilityDataset;
  onImport: () => void;
  busy: boolean;
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
            <strong>Đã lưu bản chi tiết · Chưa áp dụng xếp lịch</strong>
            <p>
              File chưa có MSSV. Cần ghép thành viên, bổ sung mốc tuần học và
              giờ ca sáng/chiều trước khi phân công theo dữ liệu này.
            </p>
          </div>
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
