"use client";

import { Camera, ImagePlus, Image as ImageIcon, Link2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { isEventRoundQuantity, isPointAmount } from "../lib/activity";
import type { EvidenceAssignment } from "../lib/duty-evidence";
import { eventEvidenceLinkLimit, type EventEvidenceView } from "../lib/event-evidence";
import { preparePhoto } from "./prepare-photo";
import { Badge, Button, Field } from "./ui";
import { displayMessage } from "../lib/display-message";
import { EventRoundField } from "./event-round-field";

const statusLabels = {
  attached: { badge: "neutral", label: "Ảnh đính kèm" },
  pending: { badge: "pending", label: "Chờ duyệt" },
  approved: { badge: "attending", label: "Đã duyệt" },
  rejected: { badge: "absent", label: "Từ chối" },
};
const evidenceTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});

async function evidenceRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json() as EventEvidenceView & { error?: string };
  if (!response.ok) throw new Error(data.error || "Chưa tải được minh chứng");
  return data;
}

export default function DutyEvidenceAction({ target, canSend, isAdmin, label, variant = "secondary", defaultExpanded = false, onSaved }: {
  target: EvidenceAssignment;
  canSend: boolean;
  isAdmin: boolean;
  label?: string;
  variant?: "primary" | "secondary";
  defaultExpanded?: boolean;
  onSaved?: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const id = useId();
  const endpoint = "/api/duty-evidence?" + new URLSearchParams(target).toString();
  return (
    <div className="duty-evidence">
      <button
        type="button"
        className={`btn ${variant}`}
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        onClick={() => setExpanded(value => !value)}
      >
        <ImageIcon size={16} aria-hidden="true" />
        {label ?? (canSend && !isAdmin ? "Gửi minh chứng" : "Xem minh chứng")}
      </button>
      {expanded && <EvidencePanel key={endpoint} id={id} endpoint={endpoint} onSaved={onSaved} />}
    </div>
  );
}

export function EvidencePanel({ id, endpoint, event = false, showRoundPoints = true, onSaved }: {
  id?: string;
  endpoint: string;
  event?: boolean;
  showRoundPoints?: boolean;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<EventEvidenceView | null>(null);
  const [draft, setDraft] = useState<{ photo: Blob; url: string } | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [contribution, setContribution] = useState("");
  const [roundQuantity, setRoundQuantity] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [loadedPhotoId, setLoadedPhotoId] = useState<string>();
  const camera = useRef<HTMLInputElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const loadSignal = useRef<AbortSignal | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadSignal.current = controller.signal;
    evidenceRequest(endpoint, { signal: controller.signal }).then(setData).catch(reason => {
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Chưa tải được minh chứng");
    });
    return () => controller.abort();
  }, [endpoint]);

  const preview = draft?.url;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const expiresAt = data && !data.expired && (data.canUpload || data.evidence) ? data.expiresAt : null;
  useEffect(() => {
    if (expiresAt === null) return;
    let timer: number;
    const expire = () => {
      const remaining = expiresAt - Date.now();
      if (remaining > 0) {
        timer = window.setTimeout(expire, Math.min(remaining, 2_147_000_000));
        return;
      }
      setDraft(null);
      setLinkDraft(null);
      setData(current => current && { ...current, expired: true, canUpload: false, canReview: false });
    };
    timer = window.setTimeout(expire, Math.max(0, Math.min(expiresAt - Date.now(), 2_147_000_000)));
    return () => window.clearTimeout(timer);
  }, [expiresAt]);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    const signal = loadSignal.current;
    setBusy(true);
    setDraft(null);
    setLinkDraft(null);
    setMessage("");
    setError("");
    try {
      const photo = await preparePhoto(file);
      if (!signal?.aborted) setDraft({ photo, url: URL.createObjectURL(photo) });
    } catch (reason) {
      setError(reason instanceof DOMException ? "Không đọc được ảnh, hãy thử ảnh JPG hoặc PNG" :
        reason instanceof Error ? reason.message : "Không đọc được ảnh");
    } finally {
      setBusy(false);
    }
  }

  async function save(url: string, options: RequestInit, success: string) {
    const signal = loadSignal.current ?? undefined;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setData(await evidenceRequest(url, { ...options, signal }));
      setDraft(null);
      setLinkDraft(null);
      setNote("");
      setPhotoFailed(false);
      setMessage(success);
      onSaved?.();
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Chưa lưu được minh chứng");
    } finally {
      setBusy(false);
    }
  }

  const replacement = data?.evidence ? "&replace=" + encodeURIComponent(data.evidence.id) : "";
  function upload() {
    if (!draft || busy) return;
    void save(endpoint + replacement, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: draft.photo }, "Đã gửi ảnh cho BĐH");
  }

  function uploadLink() {
    if (!linkDraft?.trim() || busy) return;
    void save(endpoint + replacement, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ linkUrl: linkDraft.trim() }) }, "Đã gửi link cho BĐH");
  }

  function review(status: "approved" | "rejected") {
    if (!data?.evidence || busy) return;
    void save(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.evidence.id, status, note,
        contributionPoints: status === "approved" && data.requiresContributionPoints ? Number(contribution) : undefined,
        quantity: status === "approved" && data.recordedRounds !== undefined ? Number(roundQuantity) : undefined,
        previousQuantity: data.recordedRounds }),
    }, status === "approved" ? (event ? "Đã duyệt minh chứng và ghi điểm sự kiện" : "Đã duyệt minh chứng") : "Đã từ chối minh chứng");
  }

  const evidence = data?.evidence;
  const status = evidence && !(evidence.status === "pending" && data.expired) ? statusLabels[evidence.status] : null;
  const linkUrl = data && !data.expired && !draft ? evidence?.linkUrl : undefined;
  const photoUrl = data && !data.expired
    ? draft?.url ?? (evidence && !evidence.linkUrl && !photoFailed ? endpoint + "&photo=" + encodeURIComponent(evidence.id) : null)
    : null;
  const evidenceType = linkUrl ? "link" : "ảnh";
  const canReview = data?.canReview && (linkUrl || (photoUrl && !draft && !photoFailed && loadedPhotoId === evidence?.id));
  return (
    <div id={id} className="duty-evidence-panel">
      {!data && !error && <p className="hint" role="status">Đang tải minh chứng…</p>}
      {data?.expired && <p className="hint">{event ? "Minh chứng của sự kiện đã hết hạn lưu" : "Ảnh minh chứng của ca này đã hết hạn lưu"}</p>}
      {data && !data.expired && !evidence && <p className="hint">Chưa gửi minh chứng</p>}
      {evidence && status && (
        <>
          <div className="duty-evidence-meta">
            <Badge status={status.badge}>{evidence.status === "attached" && evidence.linkUrl ? "Link đính kèm" : status.label}</Badge>
            <span>Gửi lúc {evidenceTime.format(evidence.submittedAt)}</span>
          </div>
          {evidence.reviewNote && <p className="duty-evidence-note">{evidence.reviewNote}</p>}
        </>
      )}
      {photoUrl && (
        // The authenticated source and local upload preview must bypass image optimization.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="duty-evidence-photo"
          src={photoUrl}
          alt={draft ? "Ảnh sẽ gửi" : event ? "Ảnh minh chứng sự kiện" : "Ảnh minh chứng ca trực"}
          onLoad={() => { if (!draft) setLoadedPhotoId(evidence?.id); }}
          onError={() => !draft && setPhotoFailed(true)}
        />
      )}
      {linkUrl && <div className="event-proof-link">
        <a href={linkUrl} target="_blank" rel="noopener noreferrer">
          <Link2 size={16} aria-hidden="true" /> Mở link minh chứng
        </a>
        <span>{linkUrl}</span>
      </div>}
      {!draft && evidence && !data.expired && !evidence.linkUrl && photoFailed &&
        <p className="hint">Ảnh không còn khả dụng, mở lại minh chứng để kiểm tra</p>}
      {data?.canUpload && (
        <>
          <p className="hint">{event ? `Gửi một ảnh hoặc một link trước ${evidenceTime.format(data.expiresAt)} (giờ Việt Nam)` : "Gửi một ảnh cho ca trực, ảnh được lưu đến 00:00 thứ Hai"}</p>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={choosePhoto} />
          <input ref={filePicker} type="file" accept="image/*" hidden onChange={choosePhoto} />
          <div className="duty-evidence-actions">
            <Button variant="secondary" disabled={busy} onClick={() => camera.current?.click()}>
              <Camera size={16} aria-hidden="true" /> Chụp ảnh
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => filePicker.current?.click()}>
              <ImagePlus size={16} aria-hidden="true" /> Chọn ảnh
            </Button>
            {event && linkDraft === null && <Button variant="secondary" disabled={busy} onClick={() => {
              setDraft(null);
              setLinkDraft("");
              setMessage("");
              setError("");
            }}>
              <Link2 size={16} aria-hidden="true" /> Thêm link
            </Button>}
            {draft && <Button disabled={busy} onClick={upload}>Gửi ảnh</Button>}
          </div>
          {linkDraft !== null && <form className="event-proof-form" onSubmit={formEvent => {
            formEvent.preventDefault();
            uploadLink();
          }}>
            <Field label="Link minh chứng">
              <input type="url" value={linkDraft} onChange={e => setLinkDraft(e.target.value)}
                required maxLength={eventEvidenceLinkLimit} placeholder="https://" disabled={busy} />
            </Field>
            <div className="duty-evidence-actions">
              <Button type="submit" disabled={busy || !linkDraft.trim()}>Gửi link</Button>
              <Button variant="secondary" disabled={busy} onClick={() => { setLinkDraft(null); setError(""); }}>Quay lại</Button>
            </div>
          </form>}
        </>
      )}
      {canReview && data && (
        <>
          {data.requiresContributionPoints && <Field label="Điểm đóng góp">
            <input type="number" inputMode="decimal" min={0} max={100000} step="0.01" value={contribution}
              onChange={event => setContribution(event.target.value)} />
          </Field>}
          {data.recordedRounds !== undefined &&
            <EventRoundField value={roundQuantity} onChange={setRoundQuantity} pointsPerRound={showRoundPoints ? data.pointsPerRound : undefined} />}
          <Field label="Ghi chú duyệt">
            <textarea rows={2} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="Nhập lý do nếu từ chối" />
          </Field>
          <div className="duty-evidence-actions">
            <Button disabled={busy || (data.requiresContributionPoints && (!contribution || !isPointAmount(Number(contribution)))) ||
              (data.recordedRounds !== undefined && (!roundQuantity || !isEventRoundQuantity(Number(roundQuantity))))}
              onClick={() => review("approved")}>
              {data.recordedRounds !== undefined ? `Duyệt ${evidenceType} và lưu số lượt` : event ? `Duyệt ${evidenceType} và tính điểm` : "Duyệt ảnh"}
            </Button>
            <Button variant="danger" disabled={busy || !note.trim()} onClick={() => review("rejected")}>Từ chối {evidenceType}</Button>
          </div>
        </>
      )}
      {busy && <p className="hint" role="status">{event ? "Đang xử lý minh chứng…" : "Đang xử lý ảnh…"}</p>}
      {message && <p className="hint" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{displayMessage(error)}</p>}
    </div>
  );
}
