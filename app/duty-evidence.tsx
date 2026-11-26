"use client";

import { Camera, ImagePlus, Image as ImageIcon } from "lucide-react";
import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import type { EvidenceAssignment } from "../lib/duty-evidence";
import { maxPhotoBytes, type PhotoEvidenceView } from "../lib/photo-evidence";
import { Badge, Button, Field } from "./ui";

const statusLabels = {
  attached: { badge: "neutral", label: "Ảnh đính kèm" },
  pending: { badge: "pending", label: "Chờ duyệt" },
  approved: { badge: "attending", label: "Đã duyệt" },
  rejected: { badge: "absent", label: "Từ chối" },
};
const evidenceTime = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
});

async function preparePhoto(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const drawing = canvas.getContext("2d", { alpha: false });
    if (!drawing) throw new Error("Trình duyệt chưa xử lý được ảnh. Hãy thử ảnh JPG khác.");
    drawing.fillStyle = "#fff";
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    drawing.drawImage(image, 0, 0, canvas.width, canvas.height);
    const photo = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!photo || photo.size > maxPhotoBytes) throw new Error("Ảnh quá lớn. Hãy chọn ảnh nhỏ hơn.");
    return photo;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function evidenceRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json() as PhotoEvidenceView<"attached"> & { error?: string };
  if (!response.ok) throw new Error(data.error || "Chưa tải được minh chứng.");
  return data;
}

export default function DutyEvidenceAction({ target, canSend, isAdmin }: {
  target: EvidenceAssignment;
  canSend: boolean;
  isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const endpoint = "/api/duty-evidence?" + new URLSearchParams(target).toString();
  return (
    <div className="duty-evidence">
      <button
        type="button"
        className="btn secondary"
        aria-expanded={expanded}
        aria-controls={expanded ? id : undefined}
        onClick={() => setExpanded(value => !value)}
      >
        <ImageIcon size={16} aria-hidden="true" />
        {canSend && !isAdmin ? "Gửi minh chứng" : "Xem minh chứng"}
      </button>
      {expanded && <EvidencePanel key={endpoint} id={id} endpoint={endpoint} />}
    </div>
  );
}

export function EvidencePanel({ id, endpoint, event = false, onSaved }: {
  id?: string;
  endpoint: string;
  event?: boolean;
  onSaved?: () => void;
}) {
  const [data, setData] = useState<PhotoEvidenceView<"attached"> | null>(null);
  const [draft, setDraft] = useState<{ photo: Blob; url: string } | null>(null);
  const [note, setNote] = useState("");
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
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Chưa tải được minh chứng.");
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
    setMessage("");
    setError("");
    try {
      const photo = await preparePhoto(file);
      if (!signal?.aborted) setDraft({ photo, url: URL.createObjectURL(photo) });
    } catch (reason) {
      setError(reason instanceof DOMException ? "Không đọc được ảnh. Hãy thử ảnh JPG hoặc PNG." :
        reason instanceof Error ? reason.message : "Không đọc được ảnh.");
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
      setNote("");
      setPhotoFailed(false);
      setMessage(success);
      onSaved?.();
    } catch (reason) {
      if (!signal?.aborted) setError(reason instanceof Error ? reason.message : "Chưa lưu được minh chứng.");
    } finally {
      setBusy(false);
    }
  }

  function upload() {
    if (!draft || busy) return;
    const replacement = data?.evidence ? "&replace=" + encodeURIComponent(data.evidence.id) : "";
    void save(endpoint + replacement, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: draft.photo }, "Đã gửi ảnh cho BĐH.");
  }

  function review(status: "approved" | "rejected") {
    if (!data?.evidence || busy) return;
    void save(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: data.evidence.id, status, note }),
    }, status === "approved" ? (event ? "Đã duyệt minh chứng và ghi điểm sự kiện." : "Đã duyệt minh chứng.") : "Đã từ chối minh chứng.");
  }

  const evidence = data?.evidence;
  const status = evidence && !(evidence.status === "pending" && data.expired) ? statusLabels[evidence.status] : null;
  const photoUrl = data && !data.expired
    ? draft?.url ?? (evidence && !photoFailed ? endpoint + "&photo=" + encodeURIComponent(evidence.id) : null)
    : null;
  return (
    <div id={id} className="duty-evidence-panel">
      {!data && !error && <p className="hint" role="status">Đang tải minh chứng…</p>}
      {data?.expired && <p className="hint">{event ? "Ảnh minh chứng của sự kiện đã hết hạn lưu." : "Ảnh minh chứng của ca này đã hết hạn lưu."}</p>}
      {data && !data.expired && !evidence && <p className="hint">Chưa gửi minh chứng.</p>}
      {evidence && status && (
        <>
          <div className="duty-evidence-meta">
            <Badge status={status.badge}>{status.label}</Badge>
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
      {!draft && evidence && !data.expired && photoFailed && <p className="hint">Ảnh không còn khả dụng. Mở lại minh chứng để kiểm tra.</p>}
      {data?.canUpload && (
        <>
          <p className="hint">{event ? `Gửi một ảnh. Hạn gửi và duyệt: ${evidenceTime.format(data.expiresAt)} (giờ Việt Nam).` : "Gửi một ảnh cho ca trực. Ảnh được lưu đến 00:00 thứ Hai."}</p>
          <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={choosePhoto} />
          <input ref={filePicker} type="file" accept="image/*" hidden onChange={choosePhoto} />
          <div className="duty-evidence-actions">
            <Button variant="secondary" disabled={busy} onClick={() => camera.current?.click()}>
              <Camera size={16} aria-hidden="true" /> Chụp ảnh
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => filePicker.current?.click()}>
              <ImagePlus size={16} aria-hidden="true" /> Chọn ảnh
            </Button>
            {draft && <Button disabled={busy} onClick={upload}>Gửi ảnh</Button>}
          </div>
        </>
      )}
      {data?.canReview && photoUrl && !draft && !photoFailed && loadedPhotoId === evidence?.id && (
        <>
          <Field label="Ghi chú duyệt">
            <textarea rows={2} maxLength={500} value={note} onChange={event => setNote(event.target.value)} placeholder="Nhập lý do nếu từ chối" />
          </Field>
          <div className="duty-evidence-actions">
            <Button disabled={busy} onClick={() => review("approved")}>{event ? "Duyệt ảnh và tính điểm" : "Duyệt ảnh"}</Button>
            <Button variant="danger" disabled={busy || !note.trim()} onClick={() => review("rejected")}>Từ chối ảnh</Button>
          </div>
        </>
      )}
      {busy && <p className="hint" role="status">Đang xử lý ảnh…</p>}
      {message && <p className="hint" role="status">{message}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
