"use client";
import { CalendarDays, ChevronDown, ImageIcon, MapPin, Plus } from "lucide-react";
import { useCallback, useRef, useState, type FormEvent } from "react";
import { addDays, dateLabel, today, uid, weekId, type Club, type Member, type WeeklyScore } from "../lib/club";
import { activityLabels, activityName, activityPointsFor, allowsMultipleEventRounds, canAttendEvent, defaultEventPoints, eventQuantityPoints, eventRoundRegistration, recordedEventQuantity, registrationStatusLabel, eventDescriptionLimit, eventLocationLimit, eventForActivity, isEventOpen, manualKinds, visibleActivityKinds, type ActivityRegistration, type ClubEvent, type ManualActivityKind } from "../lib/activity";
import { committeeKinds, committeeLabels, isCommitteeKind, memberCommittees, memberCommitteeNames, matchesCommittee, type CommitteeFilter, type CommitteeKind } from "../lib/committees";
import { eventEvidenceView } from "../lib/event-evidence";
import { EvidencePanel } from "./duty-evidence";
import { Avatar, Badge, Button, Dialog, Empty, Field, FormFooter, PanelHead } from "./ui";
import { MemberName, MemberOption } from "./member-identity";
import { formatScore } from "./scoreboard";
import { EventRoundField } from "./event-round-field";
type ActivityProps = {club:Club;me:Member;isAdmin:boolean;week:string;busy:boolean;onAction:Act};
type Act = (action: string, data: Record<string, unknown>, message: string, close?: boolean) => Promise<boolean>;
type EventChange = "cancel" | "restore" | "delete";
type EventDialog = { mode: "create" } | { mode: "edit"; event: ClubEvent } | { mode: "participant"; eventId: string } | { mode: EventChange; event: ClubEvent };
const formData = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); return Object.fromEntries(new FormData(e.currentTarget)); };

function eventPointsLabel(event: ClubEvent) {
  if (event.scoringMode === "contribution") return "BĐH chấm điểm theo đóng góp từng thành viên";
  if (event.scoringMode === "perRound") return `${formatScore(event.points)} điểm × số lượt đã duyệt`;
  if (event.participationMultiplier !== undefined) return `${formatScore(event.points)} điểm lượt đầu · Hệ số ×${formatScore(event.participationMultiplier)}`;
  return `${formatScore(event.points)} điểm mỗi thành viên được duyệt`;
}

function ContributionField({ initial }: { initial?: number }) {
  return <Field label="Điểm đóng góp">
    <input name="contributionPoints" type="number" inputMode="decimal" min={0} max={100000} step="0.01"
      defaultValue={initial} required />
  </Field>;
}

function eventRegistrationGroups(event: ClubEvent, rows: ActivityRegistration[]) {
  if (event.scoringMode !== "perRound") return rows.filter(row => !row.supersededBy).map(row => [row]);
  const groups = new Map<string, ActivityRegistration[]>();
  for (const row of rows) {
    const group = groups.get(row.memberId);
    if (group) group.push(row);
    else groups.set(row.memberId, [row]);
  }
  return [...groups.values()];
}

function eventScheduleLabel({ startDate, startTime, endDate, endTime }: ClubEvent) {
  const date = dateLabel(startDate, true);
  if (startDate !== endDate) {
    const from = startTime ? `${date} ${startTime}` : date;
    const until = dateLabel(endDate, true) + (endTime ? ` ${endTime}` : "");
    return `${from} – ${until}`;
  }
  if (startTime && endTime) return `${date} · ${startTime} – ${endTime}`;
  if (startTime) return `${date} · Bắt đầu ${startTime}`;
  if (endTime) return `${date} · Kết thúc ${endTime}`;
  return date;
}

export default function Activities({ club, me, isAdmin, busy, onAction, onEvidenceSaved }: Omit<ActivityProps, "week"> & { onEvidenceSaved: () => void }) {
  const [eventDialog, setEventDialog] = useState<EventDialog | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [eventFilter, setEventFilter] = useState("");
  const [review, setReview] = useState<{row:ActivityRegistration; confirmed:boolean} | null>(null);
  const [roundEdit, setRoundEdit] = useState<{ event: ClubEvent; member: Member; row: ActivityRegistration; previousQuantity: number }>();
  const [contributionId, setContributionId] = useState<string>();
  const [proof, setProof] = useState<{ row: ActivityRegistration; event: ClubEvent } | null>(null);
  const requestsByEvent = useRef(new Map<string, string>());
  const results = useRef<HTMLElement>(null);
  const close = useCallback(() => { setReview(null); setEventDialog(null); setProof(null); setContributionId(undefined); setRoundEdit(undefined); }, []);
  const now = Date.now();
  const currentDay = today(new Date(now));
  const events = [...(club.events ?? [])].sort((a, b) => a.startDate.localeCompare(b.startDate) ||
    (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.name.localeCompare(b.name));
  const visibleEvents = events.filter(event => showHistory || isEventOpen(event, currentDay));
  const visibleEventIds = new Set(visibleEvents.map(event => event.id));
  const selectedEvent = visibleEventIds.has(eventFilter) ? eventFilter : "";
  const registrations = (club.activityRegistrations ?? []).filter(r => r.kind === "event" && (isAdmin || r.memberId === me.id));
  const cards = visibleEvents.map(event => {
    const eventRows = registrations.filter(row => row.eventId === event.id);
    const groups = eventRegistrationGroups(event, eventRows);
    const ownRows = eventRows.filter(row => row.memberId === me.id && !row.supersededBy && row.status !== "withdrawn");
    const proofRows = (isAdmin ? eventRows : ownRows).filter(row => {
      const evidence = eventEvidenceView(row, event, me);
      return isAdmin ? evidence.canReview : evidence.canUpload && (!evidence.evidence || row.status === "declined");
    });
    const awaitingRegistration = isAdmin && !event.cancelledAt && !event.requiresEvidence
      ? groups.filter(group => group.some(row => !row.supersededBy && row.status === "pending")).length : 0;
    return { event, eventRows, groups, ownRows, proofRows, awaitingRegistration };
  }).sort((a, b) => Number(!!b.proofRows.length) - Number(!!a.proofRows.length) ||
    Number(!!b.awaitingRegistration) - Number(!!a.awaitingRegistration) ||
    Number(isEventOpen(b.event, currentDay)) - Number(isEventOpen(a.event, currentDay)));
  const rows = cards.filter(({ event }) => !selectedEvent || event.id === selectedEvent)
    .flatMap(({ event, groups }) => groups.flatMap(group => {
      const perRound = event.scoringMode === "perRound";
      const row = perRound ? eventRoundRegistration(group) : group[0];
      if (!row) return [];
      const evidence = event.requiresEvidence || row.evidence ? eventEvidenceView(row, event, me) : undefined;
      const photos = group.flatMap(item => {
        if (item.status === "withdrawn" || (!item.evidence && item !== row)) return [];
        const view = eventEvidenceView(item, event, me);
        return view.evidence || view.canUpload ? [{ row: item, view }] : [];
      });
      const pending = group.find(item => !item.supersededBy && item.status === "pending");
      const ready = !!pending && !event.cancelledAt && (!event.requiresEvidence || photos.some(item => item.view.canReview));
      return [{ row, event, group, evidence, photos, pending, ready }];
    }))
    .sort((a, b) => Number(!!b.ready) - Number(!!a.ready) ||
      b.row.submittedAt.localeCompare(a.row.submittedAt));
  const editingEvent = eventDialog?.mode === "edit" ? eventDialog.event : undefined;
  const contributionRow = registrations.find(row => row.id === contributionId && row.status === "confirmed");
  const reviewEvent = review && eventForActivity(club, review.row);
  const reviewContribution = review?.confirmed && reviewEvent?.scoringMode === "contribution";
  const participantEvent = eventDialog?.mode === "participant" ? events.find(event => event.id === eventDialog.eventId && !event.cancelledAt) : undefined;
  const eventChange = eventDialog && (eventDialog.mode === "cancel" || eventDialog.mode === "restore" || eventDialog.mode === "delete") ? eventDialog : null;
  const roundNumber = (row: ActivityRegistration) => registrations
    .filter(item => item.eventId === row.eventId && item.memberId === row.memberId)
    .findIndex(item => item.id === row.id) + 1;

  function showRegistrations(eventId: string) {
    setEventFilter(eventId);
    requestAnimationFrame(() => {
      results.current?.focus({ preventScroll: true });
      results.current?.scrollIntoView({ block: "start" });
    });
  }

  async function register(event: ClubEvent) {
    const requests = requestsByEvent.current;
    const registrationId = allowsMultipleEventRounds(event) ? requests.get(event.id) ?? uid() : undefined;
    if (registrationId) requests.set(event.id, registrationId);
    const message = event.requiresEvidence ? "Đã đăng ký, gửi ảnh minh chứng để BĐH duyệt" : "Đã đăng ký sự kiện, chờ BĐH duyệt";
    if (await onAction("registerEvent", { eventId: event.id, registrationId }, message, false)) requests.delete(event.id);
  }

  return <div className="activity-sections event-sections">
    <section className="panel activity-panel event-index">
      <div className="event-toolbar">
        <h1>Sự kiện của Đội</h1>
        {isAdmin && <Button disabled={busy} onClick={() => setEventDialog({ mode: "create" })}>
          <Plus size={17} aria-hidden="true" /> Tạo sự kiện
        </Button>}
        <label className="event-history">
          <input type="checkbox" checked={showHistory} onChange={e => setShowHistory(e.target.checked)} />
          Hiện cả sự kiện đã kết thúc hoặc đã hủy
        </label>
      </div>
      {cards.length ? <div className="activity-list">{cards.map(({ event, eventRows, ownRows, proofRows, awaitingRegistration }) => {
        const perRound = event.scoringMode === "perRound";
        const own = perRound ? eventRoundRegistration(ownRows) : ownRows[0];
        const multiple = allowsMultipleEventRounds(event);
        const ended = event.endDate < currentDay;
        const cancelled = !!event.cancelledAt;
        const evidence = own && event.requiresEvidence ? eventEvidenceView(own, event, me) : null;
        const startsLater = event.startDate > currentDay ||
          (event.startTime && now < Date.parse(`${event.startDate}T${event.startTime}:00+07:00`));
        const afterSchedule = event.endTime && now >= Date.parse(`${event.endDate}T${event.endTime}:00+07:00`);
        const status = cancelled ? "Đã hủy" : ended ? "Đã kết thúc" :
          startsLater ? "Sắp diễn ra" : afterSchedule ? "Đang mở đăng ký" : "Đang diễn ra";
        const actionableProof = proofRows[0];
        return <article className="activity-item event-card" key={event.id}>
          <header className="event-card-header">
            <div>
              <h3>{event.name}</h3>
              <div className="activity-meta">
                <span><CalendarDays size={16} aria-hidden="true" /> {eventScheduleLabel(event)}</span>
                <span><MapPin size={16} aria-hidden="true" /> {event.location || "Chưa cập nhật địa điểm"}</span>
              </div>
            </div>
            <Badge status={cancelled ? "absent" : "neutral"}>{status}</Badge>
          </header>
          <div className="activity-actions event-card-actions">
            {actionableProof && <Button disabled={busy} onClick={() => {
              if (multiple || (isAdmin && proofRows.length > 1)) showRegistrations(event.id);
              else setProof({ row: actionableProof, event });
            }}>
              <ImageIcon size={16} aria-hidden="true" />
              {isAdmin ? "Duyệt minh chứng" : actionableProof.status === "declined" ? "Gửi lại minh chứng" : "Gửi minh chứng"}
              {(isAdmin || multiple) && <span className="activity-count">{perRound ? new Set(proofRows.map(row => row.memberId)).size : proofRows.length}</span>}
            </Button>}
            {awaitingRegistration > 0 && <Button disabled={busy} onClick={() => showRegistrations(event.id)}>
              Duyệt đăng ký <span className="activity-count">{awaitingRegistration}</span>
            </Button>}
            {!cancelled && !ended && (!own || multiple) && <Button disabled={busy}
              variant={actionableProof || awaitingRegistration ? "secondary" : "primary"} onClick={() => void register(event)}>
              {own && multiple ? "Đăng ký thêm lượt" : "Đăng ký tham gia"}
            </Button>}
            {!multiple && !cancelled && own && evidence?.evidence && !actionableProof && <Button variant="secondary"
              disabled={busy} onClick={() => setProof({ row: own, event })}>Xem minh chứng</Button>}
            {multiple && ownRows.length > 0 && !actionableProof && <Button variant="secondary" onClick={() => showRegistrations(event.id)}>Xem lượt của tôi</Button>}
            {!multiple && !cancelled && own?.status==="pending" ? <Button variant="secondary" disabled={busy} onClick={()=>onAction("withdrawActivity",{id:own.id},"Đã rút đăng ký",false)}>Rút đăng ký</Button> : null}
            {isAdmin && <details className="event-management">
              <summary className="btn secondary">Quản lý <ChevronDown size={15} aria-hidden="true" /></summary>
              <div className="event-management-menu">
                <Button variant="secondary" onClick={() => showRegistrations(event.id)}>Xem đăng ký</Button>
                {cancelled ? <Button variant="secondary" disabled={busy}
                  onClick={() => setEventDialog({ mode: "restore", event })}>Khôi phục sự kiện</Button> : <>
                  <Button variant="secondary" disabled={busy} onClick={() => setEventDialog({ mode: "participant", eventId: event.id })}>Thêm người đã tham gia</Button>
                  <Button variant="secondary" disabled={busy} onClick={() => setEventDialog({ mode: "edit", event })}>Sửa sự kiện</Button>
                  <Button variant="danger" disabled={busy} onClick={() => setEventDialog({ mode: "cancel", event })}>Hủy sự kiện</Button>
                </>}
                <Button variant="danger" disabled={busy} onClick={() => setEventDialog({ mode: "delete", event })}>Xóa sự kiện</Button>
              </div>
            </details>}
          </div>
          {event.description && <p className="event-description">{event.description}</p>}
          <div className="event-card-meta">
            {!cancelled && <span className="event-points">{eventPointsLabel(event)}</span>}
            {!cancelled && event.requiresEvidence && (multiple || isAdmin || !own?.confirmedDirectly) && <span>Cần ảnh minh chứng</span>}
            {own && !multiple && !cancelled && <Badge status={own.status === "confirmed" ? "attending" : own.status === "pending" ? "pending" : "neutral"}>
              {eventRegistrationLabel(own, evidence)}
            </Badge>}
            {multiple && ownRows.length > 0 && !cancelled && <span>{ownRows.length} lượt của bạn</span>}
            {perRound && !isAdmin && !cancelled && own?.status === "confirmed" &&
              <span>{recordedEventQuantity(ownRows)} lượt đã ghi nhận</span>}
            {isAdmin && !cancelled && <span>{recordedEventQuantity(eventRows)} lượt đã duyệt</span>}
          </div>
        </article>;
      })}</div> : <Empty title="Chưa có sự kiện đang mở">{isAdmin ? "Bấm Tạo sự kiện để nhập tên, điểm và khoảng ngày diễn ra" : "Sự kiện do BĐH tạo sẽ xuất hiện ở đây để bạn đăng ký"}</Empty>}
    </section>
    <section className="panel activity-panel event-results" ref={results} tabIndex={-1}>
      <PanelHead title={isAdmin ? "Duyệt đăng ký sự kiện" : "Kết quả tham gia của tôi"} description="Lượt được BĐH duyệt tính điểm vào tuần kết thúc sự kiện" />
      <div className="activity-search"><Field label="Lọc theo sự kiện"><select value={selectedEvent} onChange={e=>setEventFilter(e.target.value)}><option value="">Tất cả sự kiện</option>{visibleEvents.map(event=><option key={event.id} value={event.id}>{event.name}{event.cancelledAt ? " (đã hủy)" : ""}</option>)}</select></Field></div>
      {rows.length ? <div className="activity-list">{rows.map(({ row: r, event, group, evidence, photos, pending }) => {
        const cancelled = !!event.cancelledAt;
        const perRound = event.scoringMode === "perRound";
        const recorded = recordedEventQuantity(group);
        const participant = club.members.find(m => m.id === r.memberId);
        const points = cancelled || r.status !== "confirmed" ? 0
          : perRound ? eventQuantityPoints(event.points, recorded) : activityPointsFor(club, r);
        const photoButton = ({ row, view }: (typeof photos)[number], index?: number) => <Button
          key={row.id} variant={view.canReview || (view.canUpload && (!view.evidence || row.status === "declined")) ? "primary" : "secondary"}
          disabled={busy} onClick={() => setProof({ row, event })}>
          {eventEvidenceButton(row, view)}{index !== undefined && ` · ${index + 1}`}
        </Button>;
        return <article className="activity-item" key={r.id}>
        <div><strong>{activityName(club,r)}{allowsMultipleEventRounds(event) && ` · Lượt ${roundNumber(r)}`}</strong>
        <p className="event-participant">
          {participant && <Avatar memberId={participant.id} name={participant.name} photoId={participant.avatarId} size="small" />}
          <span><MemberName memberId={r.memberId} /> · {cancelled ? "Ngày kết thúc dự kiến" : "Ngày tính điểm"}: {dateLabel(r.date,true)}</span>
        </p>{r.note?<p>{r.note}</p>:null}
        <Badge status={cancelled ? "absent" : r.status==="confirmed"?"attending":r.status==="pending"?"pending":"neutral"}>{cancelled ? "Sự kiện đã hủy" : eventRegistrationLabel(r, evidence)}</Badge>
        {perRound && !cancelled && r.status === "confirmed" && <p className="hint">
          {recorded} lượt đã ghi nhận{participant?.role === "member" && ` · ${formatScore(points)} điểm`}{r.decision && ` · ${r.decision}`}
        </p>}
        {!perRound && participant?.role !== "admin" && <p className="hint">{formatScore(points)} điểm đã ghi nhận{r.decision?` · ${r.decision}`:""}</p>}</div>
        <div className="activity-actions">
        {!cancelled && photos.length === 1 && photoButton(photos[0])}
        {!cancelled && photos.length > 1 && <details className="event-manage">
          <summary>Minh chứng · {photos.length} ảnh</summary>
          <div className="activity-actions">{photos.map(photoButton)}</div>
        </details>}
        {perRound && isAdmin && !cancelled && r.status !== "withdrawn" && participant &&
          (!event.requiresEvidence || r.status === "confirmed") && <Button disabled={busy}
            onClick={() => setRoundEdit({ event, member: participant, row: r, previousQuantity: recorded })}>
            {r.status === "confirmed" ? "Chỉnh số lượt" : "Nhập số lượt"}
          </Button>}
        {!perRound && isAdmin && !cancelled && r.status!=="withdrawn" ? <>
          {event?.scoringMode === "contribution" && r.status === "confirmed" && participant?.role === "member" &&
            <Button variant="secondary" disabled={busy} onClick={() => setContributionId(r.id)}>Chỉnh điểm đóng góp</Button>}
          {!event?.requiresEvidence && r.status!=="confirmed"?<Button disabled={busy} onClick={()=>setReview({row:r,confirmed:true})}>Duyệt tham gia</Button>:null}
          {r.status==="confirmed" || (!event?.requiresEvidence && r.status!=="declined") ? <Button variant="secondary" disabled={busy} onClick={()=>setReview({row:r,confirmed:false})}>{r.status==="confirmed"?"Hủy duyệt":"Không duyệt"}</Button>:null}
        </>:null}{!cancelled && pending?.memberId === me.id && <Button variant="secondary" disabled={busy}
          onClick={() => onAction("withdrawActivity", { id: pending.id }, "Đã rút đăng ký", false)}>Rút đăng ký</Button>}</div>
      </article>;
      })}</div>:<Empty title="Chưa có người tham gia">Danh sách sẽ hiển thị khi có thành viên đăng ký hoặc được BĐH thêm vào sự kiện</Empty>}
    </section>
    {(eventDialog?.mode === "create" || editingEvent) ? (
      <Dialog title={editingEvent ? "Sửa sự kiện" : "Tạo sự kiện"} onClose={close} busy={busy}>
        <EventForm event={editingEvent} busy={busy} onAction={onAction} onClose={close} />
      </Dialog>
    ) : null}
    {eventChange && (
      <EventChangeDialog mode={eventChange.mode} event={eventChange.event} busy={busy} onAction={onAction} onClose={close} />
    )}
    {isAdmin && participantEvent && (
      <AddParticipantDialog key={participantEvent.id} event={participantEvent} members={club.members} registrations={registrations} busy={busy} onAction={onAction} onClose={close} />
    )}
    {isAdmin && roundEdit && <RoundCountDialog {...roundEdit} busy={busy} onAction={onAction} onClose={close} />}
    {isAdmin && contributionRow && <Dialog title="Chỉnh điểm đóng góp"
      description={<>{activityName(club, contributionRow)} · <MemberName memberId={contributionRow.memberId} /></>} onClose={close} busy={busy}>
      <form onSubmit={async e => {
        const fields = formData(e);
        if (await onAction("saveEventContribution", { id: contributionRow.id, contributionPoints: Number(fields.contributionPoints) },
          "Đã cập nhật điểm đóng góp", false)) close();
      }}>
        <ContributionField initial={contributionRow.contributionPoints} />
        <FormFooter label="Lưu điểm" onCancel={close} busy={busy} />
      </form>
    </Dialog>}
    {review?<Dialog title={review.confirmed?"Duyệt tham gia sự kiện":"Không duyệt tham gia"}
      description={<>{activityName(club,review.row)} · <MemberName memberId={review.row.memberId} /></>} onClose={close} busy={busy}>
      <form onSubmit={async e => {
        const fields = formData(e);
        if (await onAction("reviewActivity", { id: review.row.id, confirmed: review.confirmed, reason: fields.reason,
          contributionPoints: reviewContribution ? Number(fields.contributionPoints) : undefined },
          "Đã cập nhật kết quả duyệt", false)) close();
      }}>
        <p className="dialog-copy">{review.confirmed
          ? `${reviewContribution ? "Cộng số điểm bạn nhập" : reviewEvent?.participationMultiplier !== undefined
            ? "Cộng điểm theo thứ tự lượt đã duyệt" : `Cộng ${formatScore(activityPointsFor(club, review.row))} điểm`} vào tuần ${dateLabel(review.row.week)} – ${dateLabel(addDays(review.row.week, 6))}`
          : "Đăng ký này không được cộng điểm và không bị trừ điểm"}</p>
        {reviewContribution && <ContributionField />}
        <Field label={review.row.status==="pending"?"Ghi chú (không bắt buộc)":"Lý do điều chỉnh"}><textarea name="reason" required={review.row.status!=="pending"} minLength={review.row.status!=="pending"?3:undefined} maxLength={500}/></Field>
        <FormFooter label={review.confirmed?"Duyệt và tính điểm":"Lưu kết quả"} onCancel={close} busy={busy}/>
      </form>
    </Dialog>:null}
    {proof ? <Dialog title="Minh chứng sự kiện"
      description={<>{proof.event.name} · <MemberName memberId={proof.row.memberId} />
        {allowsMultipleEventRounds(proof.event) && ` · Lượt ${roundNumber(proof.row)}`}</>} onClose={close}>
      <EvidencePanel key={proof.row.id} endpoint={"/api/event-evidence?" + new URLSearchParams({ registrationId: proof.row.id })}
        event showRoundPoints={club.members.find(member => member.id === proof.row.memberId)?.role === "member"} onSaved={onEvidenceSaved} />
    </Dialog> : null}
  </div>;
}

function RoundCountDialog({ event, member, row, previousQuantity, busy, onAction, onClose }: {
  event: ClubEvent; member: Member; row: ActivityRegistration; previousQuantity: number;
  busy: boolean; onAction: Act; onClose: () => void;
}) {
  const [count, setCount] = useState(row.status === "confirmed" ? String(previousQuantity) : "");
  return <Dialog title={row.status === "confirmed" ? "Chỉnh số lượt tham gia" : "Nhập số lượt tham gia"}
    description={<>{event.name} · <MemberName memberId={member.id} /></>} onClose={onClose} busy={busy}>
    <form onSubmit={async e => {
      const fields = formData(e);
      if (await onAction("saveEventRounds", { eventId: event.id, memberId: member.id,
        quantity: Number(count), previousQuantity, reason: fields.reason }, "Đã lưu số lượt tham gia", false)) onClose();
    }}>
      <EventRoundField value={count} onChange={setCount} pointsPerRound={member.role === "member" ? event.points : undefined} />
      {row.status === "declined" && Number(count) > 0 &&
        <Field label="Lý do điều chỉnh"><textarea name="reason" required minLength={3} maxLength={500} /></Field>}
      <p className="hint">Nhập tổng số lượt thực tế. Nhập 0 để bỏ điểm sự kiện của người này</p>
      <FormFooter label="Lưu số lượt" onCancel={onClose} busy={busy} />
    </form>
  </Dialog>;
}

function AddParticipantDialog({ event, members, registrations, busy, onAction, onClose }: {
  event: ClubEvent; members: Member[]; registrations: ActivityRegistration[];
  busy: boolean; onAction: Act; onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [memberId, setMemberId] = useState("");
  const [roundId, setRoundId] = useState<string>();
  const [roundQuantity, setRoundQuantity] = useState("1");
  const [requestId] = useState(uid);
  const multiple = allowsMultipleEventRounds(event);
  const perRound = event.scoringMode === "perRound";
  const contribution = event.scoringMode === "contribution";
  const eventRows = registrations.filter(row => row.eventId === event.id);
  const singleRound = (id: string) => {
    const rows = eventRows.filter(row => row.memberId === id && !row.supersededBy);
    return perRound ? eventRoundRegistration(rows) : rows.find(row => row.status !== "withdrawn") ?? rows[0];
  };
  const candidates = members.filter(member => member.role !== "admin" && canAttendEvent(member, event) &&
    (multiple || singleRound(member.id)?.status !== "confirmed"));
  const search = query.trim().toLocaleLowerCase("vi");
  const matches = candidates.filter(member => (member.name + " " + member.studentId).toLocaleLowerCase("vi").includes(search))
    .sort((a, b) => a.name.localeCompare(b.name, "vi") || a.studentId.localeCompare(b.studentId));
  const selected = matches.find(member => member.id === memberId);
  const memberRows = eventRows.filter(row => row.memberId === memberId);
  const eligibleRounds = memberRows.filter(row => row.status !== "confirmed");
  const chosenRound = roundId ?? eligibleRounds.find(row => row.status === "pending")?.id ?? "";
  const previous = multiple ? eligibleRounds.find(row => row.id === chosenRound) : selected && singleRound(selected.id);
  return <Dialog title="Thêm người đã tham gia" description={event.name} onClose={onClose} busy={busy}>
    {candidates.length ? <form onSubmit={async e => {
      const fields = formData(e);
      if (!selected) return;
      const ok = await onAction("addEventParticipant", {
        eventId: event.id, memberId: selected.id, reason: fields.reason,
        registrationId: multiple ? previous?.id ?? requestId : undefined,
        previousStatus: previous?.status, previousDecisionAt: previous?.reviewedAt ?? previous?.submittedAt,
        contributionPoints: contribution ? Number(fields.contributionPoints) : undefined,
        ...(perRound ? { quantity: Number(roundQuantity), previousQuantity: recordedEventQuantity(memberRows) } : {}),
      }, `Đã ghi nhận ${selected.name} tham gia sự kiện`, false);
      if (ok) onClose();
    }}>
      <Field label="Tìm theo tên hoặc MSSV">
        <input type="search" value={query} onChange={e => { setQuery(e.target.value); setMemberId(""); setRoundId(undefined); setRoundQuantity("1"); }} />
      </Field>
      <Field label="Thành viên">
        <select required name="memberId" value={selected?.id ?? ""} onChange={e => { setMemberId(e.target.value); setRoundId(undefined); setRoundQuantity("1"); }}>
          <option value="" disabled>{matches.length ? "Chọn thành viên" : "Không tìm thấy thành viên phù hợp"}</option>
          {matches.map(member => {
            const row = multiple ? undefined : singleRound(member.id);
            return <MemberOption memberId={member.id} key={member.id}>{member.name}{member.studentId && ` · ${member.studentId}`}{row && ` · ${registrationStatusLabel(row)}`}</MemberOption>;
          })}
        </select>
      </Field>
      {multiple && selected && <Field label="Lượt xác nhận">
        <select value={chosenRound} onChange={e => setRoundId(e.target.value)}>
          <option value="">Thêm lượt mới</option>
          {eligibleRounds.map(row => <option key={row.id} value={row.id}>Lượt {memberRows.indexOf(row) + 1} · {registrationStatusLabel(row)}</option>)}
        </select>
      </Field>}
      {previous?.status === "declined" && <Field label="Lý do thay đổi kết quả"><textarea key={memberId} name="reason" required minLength={3} maxLength={500} /></Field>}
      {contribution && selected && <ContributionField key={selected.id} />}
      {perRound && selected && <EventRoundField value={roundQuantity} onChange={setRoundQuantity} min={1} pointsPerRound={event.points} />}
      <p className="hint">Xác nhận sẽ ghi {perRound ? "tổng số lượt và điểm tương ứng" : contribution ? "số điểm bạn nhập" : event.participationMultiplier !== undefined
        ? "điểm theo thứ tự lượt đã duyệt" : `${formatScore(event.points)} điểm`} vào tuần {dateLabel(weekId(event.endDate))} – {dateLabel(addDays(weekId(event.endDate), 6), true)}{event.requiresEvidence ? " · Lượt được BĐH xác nhận trực tiếp được miễn gửi ảnh" : ""}</p>
      <div className="form-footer">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Quay lại</Button>
        <Button type="submit" disabled={busy || !selected}>Xác nhận tham gia</Button>
      </div>
    </form> : <p className="dialog-copy">Không còn thành viên nào có thể thêm vào sự kiện này</p>}
  </Dialog>;
}

const eventChangeCopy = {
  cancel: {
    action: "cancelEvent", title: "Hủy sự kiện", label: "Xác nhận hủy sự kiện", message: "Đã hủy sự kiện",
    description: "Sự kiện sẽ ngừng nhận đăng ký và tạm ngừng tính điểm, BĐH có thể khôi phục sự kiện trong lịch sử",
  },
  restore: {
    action: "restoreEvent", title: "Khôi phục sự kiện", label: "Xác nhận khôi phục", message: "Đã khôi phục sự kiện",
    description: "Điểm của các đăng ký đã duyệt sẽ được tính lại, thành viên có thể đăng ký nếu sự kiện còn hạn",
  },
  delete: {
    action: "deleteEvent", title: "Xóa sự kiện", label: "Xóa vĩnh viễn", message: "Đã xóa sự kiện",
    description: "Sự kiện, đăng ký, điểm và ảnh minh chứng liên quan sẽ bị xóa, thao tác này không thể hoàn tác",
  },
};

function EventChangeDialog({ mode, event, busy, onAction, onClose }: {
  mode: EventChange;
  event: ClubEvent;
  busy: boolean;
  onAction: Act;
  onClose: () => void;
}) {
  const copy = eventChangeCopy[mode];
  return (
    <Dialog title={copy.title} description={event.name} onClose={onClose} busy={busy}>
      <form onSubmit={async e => {
        e.preventDefault();
        const data: Record<string, unknown> = { id: event.id };
        if (mode === "restore") data.cancelledAt = event.cancelledAt;
        if (mode === "delete") data.confirm = event.id;
        if (await onAction(copy.action, data, copy.message, false)) onClose();
      }}>
        <p className="dialog-copy">{copy.description}</p>
        <div className="form-footer">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Quay lại</Button>
          <Button variant={mode === "restore" ? "primary" : "danger"} type="submit" disabled={busy}>{copy.label}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function eventRegistrationLabel(row: ActivityRegistration, evidence: ReturnType<typeof eventEvidenceView> | null | undefined) {
  if (row.status === "pending" && evidence) {
    if (evidence.expired) return "Hết hạn duyệt minh chứng";
    return evidence.evidence ? "Ảnh đang chờ duyệt" : "Chưa gửi minh chứng";
  }
  return registrationStatusLabel(row);
}

function eventEvidenceButton(row: ActivityRegistration, evidence: ReturnType<typeof eventEvidenceView>) {
  if (evidence.canReview) return "Duyệt minh chứng";
  if (row.status === "declined" && evidence.canUpload) return "Gửi lại minh chứng";
  return evidence.evidence ? "Xem minh chứng" : "Gửi minh chứng";
}
export function WeeklyActivityPoints({club,me,isAdmin,week,weeklyScores,committeeFilter="all",busy,onAction}:ActivityProps & {weeklyScores: WeeklyScore[]; committeeFilter?: CommitteeFilter}) {
  const [member,setMember]=useState<Member|null>(null);
  const [deducting,setDeducting]=useState(false);
  const [search,setSearch]=useState("");
  const close=useCallback(()=>{setMember(null);setDeducting(false);},[]);
  const scoresByMember = new Map(weeklyScores.map(score => [score.memberId, score]));
  const roster = club.members.filter(m => scoresByMember.has(m.id) && (isAdmin || m.id === me.id) && matchesCommittee(m, committeeFilter));
  const rosterIds = new Set(roster.map(m => m.id));
  const deductions = (club.pointDeductions ?? []).filter(r => r.week === week && rosterIds.has(r.memberId));
  const query = search.trim().toLocaleLowerCase("vi");
  const members = roster.filter(m => (m.name+" "+m.studentId).toLocaleLowerCase("vi").includes(query));
  return <div className="activity-sections">
    <section className="panel"><PanelHead title={isAdmin?"Ghi nhận điểm trong tuần":"Điểm của tôi trong tuần"} description={`Tuần ${dateLabel(week)} – ${dateLabel(addDays(week,6))}, sáng kiến, đồng đẳng viên và sự kiện hiển thị số lượt, điểm theo ban, điểm riêng và điểm trừ hiển thị số điểm`} />
      {isAdmin?<div className="activity-search"><input aria-label="Tìm thành viên nhập điểm" placeholder="Tìm tên hoặc MSSV" value={search} onChange={e=>setSearch(e.target.value)}/></div>:null}
      <div className="table-scroll"><table><thead><tr><th>Thành viên</th><th>Đạt phiếu điểm danh</th>{visibleActivityKinds.map(k=><th key={k}>{activityLabels[k]}</th>)}</tr></thead><tbody>
        {members.map(m => {
          const score = scoresByMember.get(m.id);
          return <tr key={m.id}>
            <td><MemberName memberId={m.id} /><small className="score-committee">{memberCommitteeNames(m)}</small>{isAdmin ? <div className="member-point-actions">
              <Button variant="secondary" aria-label={`Nhập điểm · ${m.name}`} disabled={busy} onClick={() => {setDeducting(false); setMember(m);}}>Nhập điểm</Button>
              <Button variant="secondary" aria-label={`Trừ điểm · ${m.name}`} disabled={busy} onClick={() => {setDeducting(true); setMember(m);}}>Trừ điểm</Button>
            </div> : null}</td>
            <td className="center">{score?.passed ?? 0}</td>
            {visibleActivityKinds.map(k => <td className="center" key={k}>{score?.activityCounts[k] ?? 0}</td>)}
          </tr>;
        })}
      </tbody></table></div>
      {isAdmin && !members.length && <p className="activity-search" role="status">Không có thành viên phù hợp trong tuần này</p>}
    </section>
    {deductions.length ? <section className="panel"><PanelHead title={isAdmin?"Các khoản trừ điểm trong tuần":"Các khoản trừ điểm của tôi"} description="Điểm được trừ trực tiếp, lý do chỉ hiển thị cho BĐH và thành viên liên quan" />
      <div className="activity-list">{deductions.map(r=><article className="activity-item" key={r.id}><div><strong><MemberName memberId={r.memberId} /> · {r.cancelledAt?"Đã hủy khoản trừ":`−${r.points} điểm`}</strong><p>{dateLabel(r.date,true)} · {r.reason}</p>{r.cancelReason?<p className="hint">Lý do hủy: {r.cancelReason}</p>:null}</div></article>)}</div>
    </section> : null}
    {member?<Dialog title={<>{deducting ? "Trừ điểm" : "Điểm BĐH nhập"} · <MemberName memberId={member.id} /></>}
      description={`Tuần ${dateLabel(week)} – ${dateLabel(addDays(week,6))}`} onClose={close} busy={busy}>
      {deducting ? <DeductionForm club={club} member={member} week={week} busy={busy} onAction={onAction} onClose={close}/> : <ManualForm club={club} member={member} committeeFilter={committeeFilter} week={week} busy={busy} onAction={onAction} onClose={close}/>}
    </Dialog>:null}
  </div>;
}
function EventForm({ event, busy, onAction, onClose }: { event?: ClubEvent; busy: boolean; onAction: Act; onClose: () => void }) {
  const [id] = useState(uid);
  const [scoreSource, setScoreSource] = useState<"shared" | "individual" | "legacy">(
    event?.scoringMode === "contribution" ? "individual" : event && !event.scoringMode ? "legacy" : "shared");
  const [participation, setParticipation] = useState<"single" | "perRound">(event?.scoringMode === "perRound" ? "perRound" : "single");
  const [sharedPoints, setSharedPoints] = useState(String(event && event.scoringMode !== "contribution" ? event.points : defaultEventPoints));
  const currentDay = today();
  const [startDate, setStartDate] = useState(event?.startDate ?? currentDay);
  const [endDate, setEndDate] = useState(event?.endDate ?? currentDay);
  const [startTime, setStartTime] = useState(event?.startTime ?? "");
  const minEndDate = event || startDate > currentDay ? startDate : currentDay;
  return <form onSubmit={async e => {
    const fields = formData(e);
    const action = event ? "editEvent" : "createEvent";
    const message = event ? "Đã cập nhật sự kiện" : "Đã tạo sự kiện và mở đăng ký";
    if (await onAction(action, { ...fields, id: event?.id ?? id, requiresEvidence: fields.requiresEvidence === "on",
      scoringMode: scoreSource === "legacy" ? undefined : scoreSource === "individual" ? "contribution" : participation,
      points: scoreSource === "shared" ? Number(sharedPoints) : undefined }, message, false)) onClose();
  }}>
    <Field label="Tên sự kiện"><input name="name" defaultValue={event?.name} required minLength={2} maxLength={160} placeholder="Ví dụ: Hỗ trợ ngày hội sinh viên" autoFocus /></Field>
    <Field label="Địa điểm (không bắt buộc)"><input name="location" defaultValue={event?.location} maxLength={eventLocationLimit} /></Field>
    <div className="form-grid event-schedule-fields">
      <Field label="Ngày bắt đầu"><input name="startDate" type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} /></Field>
      <Field label="Giờ bắt đầu"><input name="startTime" type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></Field>
      <Field label="Ngày kết thúc"><input name="endDate" type="date" required min={minEndDate} value={endDate} onChange={e => setEndDate(e.target.value)} /></Field>
      <Field label="Giờ kết thúc"><input name="endTime" type="time" min={(startDate === endDate && startTime) || undefined} defaultValue={event?.endTime} /></Field>
    </div>
    <p className="hint event-schedule-hint">Giờ Việt Nam · Có thể để trống</p>
    <Field label="Mô tả sự kiện (không bắt buộc)"><textarea name="description" defaultValue={event?.description ?? ""} maxLength={eventDescriptionLimit} rows={3} /></Field>
    <Field label="Cách nhập điểm">
      <select value={scoreSource} onChange={e => setScoreSource(e.target.value as typeof scoreSource)}>
        {event && !event.scoringMode && <option value="legacy">Giữ cách tính hiện tại</option>}
        <option value="shared">Điểm chung cho sự kiện</option>
        <option value="individual">Điểm riêng từng người</option>
      </select>
    </Field>
    {scoreSource === "shared" && <>
      <Field label="Mức điểm">
        <input type="number" inputMode="decimal" min={0} max={100000} step="0.01" required
          value={sharedPoints} onChange={e => setSharedPoints(e.target.value)} />
      </Field>
      <Field label="Cách tính theo lượt">
        <select value={participation} onChange={e => setParticipation(e.target.value as typeof participation)}>
          <option value="single">Tính một lần</option>
          <option value="perRound">Tính theo số lượt</option>
        </select>
      </Field>
      <p className="hint">{participation === "perRound"
        ? "BĐH nhập tổng số lượt thực tế. Điểm bằng mức điểm nhân với số lượt"
        : "Mỗi thành viên được duyệt nhận mức điểm đã nhập một lần"}</p>
    </>}
    {scoreSource === "legacy" && event && <p className="hint">{eventPointsLabel(event)}</p>}
    {scoreSource === "individual" && <p className="hint">BĐH nhập số điểm riêng cho từng thành viên khi xác nhận tham gia</p>}
    <label className="event-history"><input type="checkbox" name="requiresEvidence" defaultChecked={event?.requiresEvidence} /> Yêu cầu ảnh minh chứng</label>
    <p className="hint">Khi bật, thành viên đăng ký rồi gửi ảnh để BĐH duyệt và tính điểm, hạn gửi và duyệt là hết 2 ngày sau ngày kết thúc, theo giờ Việt Nam</p>
    <p className="hint">Các lượt đã duyệt được tính vào tuần kết thúc sự kiện</p>
    <FormFooter label={event ? "Lưu thay đổi" : "Tạo và mở đăng ký"} onCancel={onClose} busy={busy} />
  </form>;
}
type ManualFormProps = { club: Club; member: Member; committeeFilter: CommitteeFilter; week: string; busy: boolean; onAction: Act; onClose: () => void };

function ManualForm(props: ManualFormProps) {
  const [kind,setKind]=useState<ManualActivityKind>(manualKinds[0]);
  return <><Field label="Mục điểm"><select value={kind} onChange={e=>setKind(e.target.value as ManualActivityKind)}>{manualKinds.map(k=><option key={k} value={k}>{activityLabels[k]}</option>)}</select></Field>
    <ManualEntryForm key={kind} {...props} kind={kind}/>
  </>;
}
function ManualEntryForm({club,member,committeeFilter,week,kind,busy,onAction,onClose}:ManualFormProps & {kind:ManualActivityKind}) {
  const old=club.manualActivities?.find(r=>r.memberId===member.id&&r.week===week&&r.kind===kind);
  const [date,setDate]=useState(old?.date??(week===weekId()?today():addDays(week,6)));
  const direct=kind==="special", byCommittee=kind==="committee";
  const retired = !!old?.committee && !isCommitteeKind(old.committee);
  const [committee, setCommittee] = useState<CommitteeKind | "none" | "">(() => {
    if (isCommitteeKind(old?.committee)) return old.committee;
    if (retired) return "";
    if (old) return "none";
    const assigned = memberCommittees(member);
    if (isCommitteeKind(committeeFilter) && assigned.includes(committeeFilter)) return committeeFilter;
    if (assigned.length > 1) return "";
    return assigned[0] ?? "none";
  });
  const existingPoints = old && (!byCommittee || retired || old.committee === committee) ? activityPointsFor(club, old) : undefined;
  return <form onSubmit={async e => {
    const f = formData(e);
    const value = direct || byCommittee
      ? { points: f.points === undefined ? undefined : Number(f.points) }
      : { quantity: Number(f.quantity) };
    if (byCommittee && !committee) return;
    if (byCommittee) f.committee = committee === "none" ? "" : committee;
    if (await onAction("saveManualActivity", { ...f, ...value, kind, memberId: member.id, week }, "Đã lưu điểm trong tuần", false)) onClose();
  }}>
    {byCommittee ? (
      <Field label="Ban">
        <select name="committee" required value={committee} onChange={e => setCommittee(e.target.value as CommitteeKind | "none")}>
          {(retired || !committee) && <option value="" disabled>{retired ? `${existingPoints} điểm đã ghi · Chọn ban để sửa` : "Chọn ban để ghi điểm"}</option>}
          <option value="none">Không ghi điểm theo ban</option>
          {committeeKinds.map(k => <option key={k} value={k}>{committeeLabels[k]}</option>)}
        </select>
      </Field>
    ) : null}
    {direct || (byCommittee && isCommitteeKind(committee)) ? (
      <Field key={committee} label={byCommittee ? "Số điểm BĐH chấm" : "Điểm riêng trong tuần"}>
        <input name="points" type="number" min={0} max={100000} step="0.01" defaultValue={existingPoints ?? (direct ? 0 : undefined)} required />
      </Field>
    ) : null}
    {!direct && !byCommittee ? <Field label={kind === "initiative" ? "Số sáng kiến trong tuần" : "Số lượt đồng đẳng viên trong tuần"}><input name="quantity" type="number" min={0} max={10000} step={1} defaultValue={old?.quantity??0} required /></Field> : null}
    <Field label="Ngày ghi nhận hoạt động"><input name="date" type="date" min={week>member.joined?week:member.joined} max={addDays(week,6)} value={date} onChange={e=>setDate(e.target.value)} required /></Field>
    <Field label="Ghi chú"><textarea name="note" defaultValue={old?.note??""} maxLength={500}/></Field>
    <p className="hint">{direct ? "Nhập trực tiếp số điểm riêng của tuần này, lưu lại thay thế số cũ; nhập 0 để bỏ điểm, không nhân số lượt hay hệ số"
      : byCommittee ? "Chọn ban và nhập số điểm của thành viên trong tuần này, để bỏ điểm đã ghi, chọn Không ghi điểm theo ban"
      : "Lưu số lượt mới thay thế số cũ của mục này trong tuần, nhập 0 để bỏ điểm, điểm = số lượt × điểm/lượt trong cài đặt"}</p>
    <FormFooter onCancel={onClose} busy={busy}/>
  </form>;
}

function DeductionForm({club,member,week,busy,onAction,onClose}:{club:Club;member:Member;week:string;busy:boolean;onAction:Act;onClose:()=>void}) {
  const [id,setId] = useState(uid);
  const [cancelId,setCancelId] = useState<string|null>(null);
  const rows = (club.pointDeductions ?? []).filter(r=>r.memberId===member.id && r.week===week);
  return <>
    <form onSubmit={async e=>{const f=formData(e);const form=e.currentTarget;if(await onAction("deductPoints",{...f,id,memberId:member.id,week,points:Number(f.points)},"Đã ghi nhận điểm trừ và lý do",false)){setId(uid());form.reset();}}}>
      <Field label="Số điểm trừ"><input name="points" type="number" min="0.01" max={100000} step="0.01" required placeholder="Nhập số điểm cần trừ" /></Field>
      <Field label="Ngày ghi nhận khoản trừ"><input name="date" type="date" min={week>member.joined?week:member.joined} max={addDays(week,6)} defaultValue={week===weekId()?today():addDays(week,6)} required /></Field>
      <Field label="Lý do trừ điểm (bắt buộc)"><textarea name="reason" minLength={3} maxLength={500} required placeholder="Ghi rõ lý do trừ điểm" /></Field>
      <p className="hint">Trừ trực tiếp số điểm đã nhập, không nhân hệ số, mỗi lần lưu tạo một khoản trừ riêng trong tuần đang chọn</p>
      <FormFooter label="Trừ điểm" onCancel={onClose} busy={busy}/>
    </form>
    {rows.length ? <div className="deduction-history"><h3>Lịch sử trừ điểm trong tuần</h3>{rows.map(row=><div className="deduction-row" key={row.id}>
      <strong>{row.cancelledAt?"Đã hủy":`−${row.points} điểm`} · {dateLabel(row.date)}</strong><p>{row.reason}</p>
      {row.cancelledAt ? <p className="hint">Lý do hủy: {row.cancelReason}</p> : cancelId===row.id ? <form onSubmit={async e=>{const f=formData(e);if(await onAction("cancelPointDeduction",{id:row.id,reason:f.reason},"Đã hủy khoản trừ, điểm được tính lại",false))setCancelId(null);}}>
        <Field label="Lý do hủy khoản trừ"><textarea name="reason" minLength={3} maxLength={500} required /></Field>
        <FormFooter label="Xác nhận hủy khoản trừ" onCancel={()=>setCancelId(null)} busy={busy}/>
      </form> : <Button variant="secondary" disabled={busy} onClick={()=>setCancelId(row.id)}>Hủy khoản trừ</Button>}
    </div>)}</div> : null}
  </>;
}
