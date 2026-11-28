"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  dateLabel,
  dutyNames,
  isShiftPublished,
  latePenaltyFor,
  monthLabel,
  type Member,
  type Schedule,
  type Rule,
} from "../lib/club";
import { formatScore } from "../lib/score-format";
import { Button, PanelHead } from "./ui";
import { MemberName } from "./member-identity";
export default function DutyRegister({
  schedule,
  members,
  busy,
  onUpdate,
  rule,
}: {
  schedule: Schedule;
  members: Member[];
  busy: boolean;
  onUpdate: (data: Record<string, unknown>) => Promise<boolean>;
  rule: Rule;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const rows = schedule.shifts
    .flatMap((shift) =>
      shift.assignments.map((assignment, position) => ({
        shift,
        assignment,
        position,
        name: names.get(assignment.memberId) ?? "Thành viên",
      })),
    )
    .filter((row) =>
      row.name.toLocaleLowerCase("vi").includes(search.toLocaleLowerCase("vi")),
    );
  const last = Math.max(0, Math.ceil(rows.length / 20) - 1),
    current = Math.min(page, last);
  return (
    <section className="panel duty-register">
      <PanelHead
        title="Theo dõi trực và đến muộn"
        description={`${monthLabel(schedule.month)} · Đến muộn trừ ${formatScore(rule.D ?? 0)} điểm/lượt`}
      />
      <div className="availability-toolbar">
        <input
          aria-label="Tìm người trong bảng trực"
          placeholder="Tìm tên người trực…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
      </div>
      {!schedule.shifts.some(shift => isShiftPublished(schedule, shift)) ? (
        <p className="hint duty-register-hint">
          Lịch còn là bản nháp, công bố trước khi ghi nhận kết quả thực tế và
          đến muộn
        </p>
      ) : null}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>NGÀY / CA</th>
              <th>THÀNH VIÊN</th>
              <th>GHI CHÚ</th>
              <th>KẾT QUẢ</th>
              <th>ĐẾN MUỘN</th>
              <th>TRỪ ĐI MUỘN</th>
            </tr>
          </thead>
          <tbody>
            {rows
              .slice(current * 20, (current + 1) * 20)
              .map(({ shift, assignment: a, position, name }) => {
                const data = {
                    month: schedule.month,
                    shiftId: shift.id,
                    position,
                    assignmentMemberId: a.memberId,
                  },
                  label = `${name} ${shift.date} ${shift.period === "am" ? "sáng" : "chiều"}`;
                return (
                  <tr key={`${shift.id}-${position}-${a.memberId}`}>
                    <td>
                      {dateLabel(shift.date, true)}
                      <small className="duty-cell-detail">
                        Ca {shift.period === "am" ? "sáng" : "chiều"}
                        {shift.startTime
                          ? ` ${shift.startTime}–${shift.endTime}`
                          : ""}
                        {shift.academicWeek
                          ? ` · Tuần ${shift.academicWeek}`
                          : ""}
                      </small>
                      {shift.draft ? <small className="duty-cell-detail">Bản nháp</small> : null}
                      {shift.cancelled ? (
                        <small className="duty-cell-detail">
                          Đã hủy cả ca · {shift.cancelReason}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      <MemberName as="strong" memberId={a.memberId} name={name} />
                    </td>
                    <td className="duty-note-cell">
                      <p>{a.availabilityNote || "—"}</p>
                      <form
                        onSubmit={async (e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          await onUpdate({
                            ...data,
                            note: f.get("note") ?? "",
                          });
                        }}
                      >
                        <input
                          name="note"
                          aria-label={`Ghi chú trực: ${label}`}
                          placeholder="Ví dụ: Có ca học tan lúc 14:30"
                          maxLength={1000}
                          defaultValue={a.note ?? ""}
                        />
                        <Button
                          type="submit"
                          variant="secondary"
                          disabled={busy || shift.cancelled}
                        >
                          Lưu ghi chú
                        </Button>
                      </form>
                    </td>
                    <td>
                      <select
                        aria-label={`Kết quả trực: ${label}`}
                        disabled={
                          busy || !isShiftPublished(schedule, shift) || shift.cancelled
                        }
                        value={a.result}
                        onChange={(e) =>
                          onUpdate({ ...data, result: e.target.value })
                        }
                      >
                        {Object.entries(dutyNames)
                          .filter(
                            ([value]) =>
                              value !== "cancelled" || a.result === "cancelled",
                          )
                          .map(([value, text]) => (
                            <option key={value} value={value}>
                              {text}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="center">
                      <input
                        type="checkbox"
                        aria-label={`Đến muộn: ${label}`}
                        checked={!!a.late}
                        disabled={
                          busy ||
                          !isShiftPublished(schedule, shift) ||
                          ["unexcused", "excused", "cancelled"].includes(
                            a.result,
                          )
                        }
                        onChange={(e) =>
                          onUpdate({ ...data, late: e.target.checked })
                        }
                      />
                    </td>
                    <td className="center">
                      {latePenaltyFor(a, rule) > 0
                        ? `−${latePenaltyFor(a, rule)}`
                        : "0"}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          {rows.length
            ? `${current * 20 + 1}–${Math.min((current + 1) * 20, rows.length)} / ${rows.length} lượt trực`
            : "Chưa có phân công phù hợp"}
        </span>
        <div className="availability-pagination">
          <button
            className="icon-button"
            aria-label="Trang trước bảng trực"
            disabled={!current}
            onClick={() => setPage(current - 1)}
          >
            <ChevronLeft size={17} />
          </button>
          <span>
            {current + 1}/{last + 1}
          </span>
          <button
            className="icon-button"
            aria-label="Trang sau bảng trực"
            disabled={current === last}
            onClick={() => setPage(current + 1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}
