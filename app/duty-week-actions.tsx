"use client";

import { CalendarDays, ImageIcon, MapPin } from "lucide-react";
import { useEffect, useState } from "react";
import { dateLabel, dutyNames, isShiftPublished, today, type Club, type Member, type Schedule, type Shift } from "../lib/club";
import { displayMessage } from "../lib/display-message";
import { evidenceExpiry, evidenceSubmissionOpen, type DutyEvidenceSummary } from "../lib/duty-evidence";
import DutyEvidenceAction from "./duty-evidence";
import { Badge, Button, Dialog } from "./ui";

type DutyEntry = { schedule: Schedule; shift: Shift };
type DutyEvidenceResult = DutyEvidenceSummary | { week: string; error: string };

function shiftTime(shift: Shift) {
  const period = shift.period === "am" ? "Ca sáng" : "Ca chiều";
  if (!shift.startTime) return period;
  return `${period} · ${shift.startTime}${shift.endTime ? ` – ${shift.endTime}` : ""}`;
}

export default function DutyWeekActions({ week, entries, club, me }: {
  week: string; entries: DutyEntry[]; club: Club; me: Member;
}) {
  const [result, setResult] = useState<DutyEvidenceResult>();
  const [attempt, setAttempt] = useState(0);
  const [review, setReview] = useState<DutyEntry>();
  const [now, setNow] = useState(() => new Date());
  const isAdmin = me.role === "admin";
  const day = today(now);
  const expired = now.getTime() >= evidenceExpiry(week);
  const current = result?.week === week ? result : undefined;
  const loaded = current && "rows" in current ? current : undefined;
  const proofRows = loaded && !expired ? loaded.rows : [];
  const refresh = () => setAttempt(value => value + 1);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/duty-evidence/summary?" + new URLSearchParams({ week }), {
          cache: "no-store", signal: controller.signal,
        });
        const value = await response.json() as DutyEvidenceSummary & { error?: string };
        if (!response.ok || value.week !== week || !Array.isArray(value.rows))
          throw new Error(value.error || "Chưa tải được trạng thái minh chứng");
        if (!controller.signal.aborted) setResult(value);
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({ week, error: displayMessage(error instanceof Error ? error.message : "Chưa tải được trạng thái minh chứng") });
      }
    }
    void load();
    return () => controller.abort();
  }, [week, club, me.id, attempt]);

  useEffect(() => {
    function onFocus() {
      setNow(new Date());
      setAttempt(value => value + 1);
    }
    const timer = window.setInterval(() => setNow(new Date()), 15_000);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const priority = (date: string) => date === day ? 0 : date > day ? 1 : 2;
  const ordered = entries.filter(({ schedule, shift }) => isShiftPublished(schedule, shift))
    .sort((a, b) => priority(a.shift.date) - priority(b.shift.date) ||
      a.shift.date.localeCompare(b.shift.date) || a.shift.period.localeCompare(b.shift.period));
  const myShifts = ordered.filter(({ shift }) => shift.assignments.some(row => row.memberId === me.id));
  const waiting = (entry: DutyEntry) => proofRows.filter(row => row.shiftId === entry.shift.id &&
    row.month === entry.schedule.month && row.status === "pending" && !entry.shift.cancelled &&
    entry.shift.assignments.some(person => person.memberId === row.memberId && person.result !== "cancelled"));
  const reviewEntries = isAdmin ? ordered.map(entry => ({ entry, count: waiting(entry).length })).filter(item => item.count) : [];
  const reviewRows = review ? waiting(review) : [];

  return <section className="panel activity-panel duty-week-actions" aria-label={isAdmin ? "Minh chứng chờ duyệt" : "Ca trực của tôi"}>
    <div className="activity-panel-title">
      <h2>{isAdmin ? "Minh chứng chờ duyệt" : "Ca trực của tôi"}</h2>
    </div>
    {!expired && !current && <p className="activity-panel-message" role="status">Đang tải trạng thái minh chứng…</p>}
    {current && "error" in current && !expired && <div className="activity-panel-message" role="alert">
      <span>{current.error}</span><Button variant="secondary" onClick={refresh}>Thử lại</Button>
    </div>}
    {isAdmin && (expired || loaded) && reviewEntries.length === 0 &&
      <p className="activity-panel-message">Tuần này chưa có ảnh chờ duyệt</p>}
    {!isAdmin && myShifts.length === 0 && <p className="activity-panel-message">Bạn chưa có ca trực đã công bố trong tuần này</p>}

    {(isAdmin ? reviewEntries.map(({ entry, count }) => ({ ...entry, count })) : myShifts.map(entry => ({ ...entry, count: 0 })))
      .map(({ schedule, shift, count }) => {
        const assignment = shift.assignments.find(row => row.memberId === me.id);
        const cancelled = shift.cancelled || assignment?.result === "cancelled";
        const status = proofRows.find(row => row.shiftId === shift.id && row.month === schedule.month && row.memberId === me.id)?.status;
        const canSend = !!loaded && !isAdmin && !!assignment && !cancelled && status !== "approved" && evidenceSubmissionOpen(shift, now);
        const showEvidence = !isAdmin && !cancelled && (!!status || canSend);
        const label = status === "rejected" && canSend ? "Gửi lại minh chứng"
          : status ? "Xem minh chứng" : "Gửi minh chứng";
        return <div className="duty-action-row" key={shift.id}>
          <div>
            <h3>{shift.date === day ? "Hôm nay · " : ""}{dateLabel(shift.date, true)}</h3>
            <div className="activity-meta">
              <span><CalendarDays size={15} aria-hidden="true" /> {shiftTime(shift)}</span>
              <span><MapPin size={15} aria-hidden="true" /> Cơ sở C1</span>
            </div>
          </div>
          {isAdmin ? <Button onClick={() => setReview({ schedule, shift })}>
            <ImageIcon size={16} aria-hidden="true" /> Duyệt minh chứng <span className="activity-count">{count}</span>
          </Button> : <div className="duty-action-controls">
            {cancelled && <Badge status="neutral">Ca đã hủy</Badge>}
            {!cancelled && status === "pending" && <Badge status="pending">Ảnh chờ duyệt</Badge>}
            {!cancelled && status === "approved" && <Badge status="attending">Ảnh đã duyệt</Badge>}
            {!cancelled && status === "rejected" && <Badge status="absent">Ảnh bị từ chối</Badge>}
            {!cancelled && !status && assignment?.result && assignment.result !== "unverified" &&
              <Badge status="neutral">{dutyNames[assignment.result]}</Badge>}
            {showEvidence && <DutyEvidenceAction target={{ month: schedule.month, shiftId: shift.id, memberId: me.id }}
              canSend={canSend} isAdmin={false} label={label} variant={label === "Xem minh chứng" ? "secondary" : "primary"}
              onSaved={refresh} />}
          </div>}
        </div>;
      })}
    {review && <Dialog title="Duyệt minh chứng ca trực"
      description={`${dateLabel(review.shift.date, true)} · ${shiftTime(review.shift)} · Cơ sở C1`}
      onClose={() => setReview(undefined)}>
      {reviewRows.length ? <div className="duty-review-list">
        {reviewRows.map((row, index) => <div key={row.memberId} className="duty-review-person">
          <h3>{club.members.find(member => member.id === row.memberId)?.name ?? "Thành viên"}</h3>
          <DutyEvidenceAction target={{ month: row.month, shiftId: row.shiftId, memberId: row.memberId }}
            canSend={false} isAdmin label="Xem ảnh chờ duyệt"
            defaultExpanded={index === 0} onSaved={refresh} />
        </div>)}
      </div> : <p role="status">Ca này đã xử lý hết ảnh chờ duyệt</p>}
    </Dialog>}
  </section>;
}
