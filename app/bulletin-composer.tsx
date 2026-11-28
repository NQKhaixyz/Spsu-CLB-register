"use client";

import { FileText, ImagePlus, Video, X } from "lucide-react";
import { lazy, Suspense, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { bulletinContentLimit, bulletinDateInput, bulletinTitleLimit, type BulletinBody, type BulletinPostView } from "../lib/bulletin";
import {
  bulletinDocumentAccept, bulletinDocumentLimitMb, bulletinDocumentName, bulletinDocumentType, bulletinMediaByteLimit,
  bulletinMediaEndpoint, bulletinMediaLimit, bulletinMediaUrl, bulletinStageMs, bulletinVideoLimitMb, bulletinVideoTypes,
  isBulletinDocument, isBulletinMediaId, isBulletinVideo, validBulletinDocumentPrefix, type BulletinMedia, type BulletinMediaType,
} from "../lib/bulletin-media";
import { displayMessage } from "../lib/display-message";
import { BulletinAttachmentView } from "./bulletin-attachments";
import { BulletinText } from "./bulletin-text";
import { preparePhoto } from "./prepare-photo";
import { TitleField } from "./title-field";
import { Button, Dialog, Field, FormFooter } from "./ui";

const BulletinRichEditor = lazy(() => import("./bulletin-rich-editor"));

type DraftMedia = {
  key: string;
  label: string;
  type: BulletinMediaType;
  url: string;
  body?: Blob;
  file?: BulletinMedia;
  stagedAt?: number;
};

const videoExtensions = { mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime" } as const;
export const bulletinVideoAccept = [...bulletinVideoTypes, ".mp4", ".webm", ".mov"].join(",");
export type BulletinMediaSelection = { files: File[]; kind: "image" | "video" | "document" };

async function prepareSelection({ files, kind }: BulletinMediaSelection) {
  if (files.length > bulletinMediaLimit)
    throw new Error(`Mỗi bản tin đính kèm tối đa ${bulletinMediaLimit} tệp`);
  const prepared: { label: string; type: BulletinMediaType; body: Blob }[] = [];
  for (const file of files) {
    if (kind === "image") {
      if (file.size > 24 * 1024 * 1024) throw new Error("Ảnh đã chọn vượt quá 24 MB");
      prepared.push({ label: file.name, type: "image/jpeg", body: await preparePhoto(file) });
    } else if (kind === "video") {
      const extension = file.name.split(".").at(-1)?.toLowerCase() as keyof typeof videoExtensions;
      const type = isBulletinVideo(file.type) ? file.type : videoExtensions[extension];
      if (!isBulletinVideo(type)) throw new Error("Chọn video MP4, WebM hoặc MOV");
      if (file.size > bulletinMediaByteLimit(type)) throw new Error(`Video tối đa ${bulletinVideoLimitMb} MB mỗi tệp`);
      if (!file.size) throw new Error("Video không có dữ liệu");
      prepared.push({ label: file.name, type, body: file });
    } else {
      const label = bulletinDocumentName(file.name);
      const type = bulletinDocumentType(label);
      if (!type || label.length > 255) throw new Error("Chọn tài liệu PDF, Word, Excel hoặc PowerPoint có tên hợp lệ");
      if (!file.size) throw new Error("Tài liệu không có dữ liệu");
      if (file.size > bulletinMediaByteLimit(type)) throw new Error(`Tài liệu tối đa ${bulletinDocumentLimitMb} MB mỗi tệp`);
      if (!validBulletinDocumentPrefix(new Uint8Array(await file.slice(0, 12).arrayBuffer()), type))
        throw new Error(`Nội dung của ${label} không đúng định dạng tài liệu`);
      prepared.push({ label, type, body: file });
    }
  }
  return prepared;
}

async function sendFile(postId: string, draft: DraftMedia) {
  if (!draft.body) throw new Error("Tệp đã hết hạn, hãy chọn lại");
  const response = await fetch(bulletinMediaEndpoint + "?" + new URLSearchParams({ postId }), {
    method: "POST",
    headers: {
      "Content-Type": draft.type, "X-Upload-Size": String(draft.body.size),
      ...(isBulletinDocument(draft.type) ? { "X-Upload-Name": encodeURIComponent(draft.label) } : {}),
    },
    body: draft.body,
  });
  const file = await response.json().catch(() => null) as (BulletinMedia & { error?: string }) | null;
  if (!response.ok || !file || !isBulletinMediaId(file.id))
    throw new Error(file?.error || "Tải tệp lên chưa thành công, hãy thử lại");
  return file;
}

export function BulletinComposer({ postId, original, initialSelection, isAdmin, busy, onSave, onClose }: {
  postId: string;
  original?: BulletinPostView;
  initialSelection?: BulletinMediaSelection;
  isAdmin: boolean;
  busy: boolean;
  onSave: (form: FormData, mediaIds: string[], body: BulletinBody) => Promise<boolean>;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<DraftMedia[]>(() => (original?.media ?? []).map((file, index) => ({
    key: file.id, file, type: file.type, url: bulletinMediaUrl(postId, file.id),
    label: file.name ?? `${file.type === "image/jpeg" ? "Ảnh" : "Video"} ${index + 1}`,
  })));
  const [status, setStatus] = useState("");
  const [title, setTitle] = useState(original?.title ?? "");
  const [initialBody] = useState<BulletinBody>(() => ({
    content: original?.content ?? "", contentFormat: original?.contentFormat, richContent: original?.richContent,
  }));
  const [draft, setDraft] = useState<BulletinBody | undefined>(initialBody);
  const [editorExpanded, setEditorExpanded] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(true);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState(initialSelection);
  const photos = useRef<HTMLInputElement>(null);
  const videos = useRef<HTMLInputElement>(null);
  const documents = useRef<HTMLInputElement>(null);
  const previews = useRef(new Set<string>());
  const waiting = busy || !!status || !!selection;
  useEffect(() => {
    const owned = previews.current;
    return () => { for (const url of owned) URL.revokeObjectURL(url); };
  }, []);

  useEffect(() => {
    if (!selection) return;
    let cancelled = false;
    void prepareSelection(selection).then(prepared => {
      if (cancelled) return;
      const newFiles = prepared.map(file => {
        const url = URL.createObjectURL(file.body);
        previews.current.add(url);
        return { ...file, key: url, url };
      });
      setFiles(current => [...current, ...newFiles]);
    }).catch(reason => {
      if (cancelled) return;
      setError(reason instanceof DOMException ? "Không đọc được ảnh, hãy thử ảnh JPG hoặc PNG"
        : displayMessage(reason instanceof Error ? reason.message : "Không đọc được tệp đã chọn"));
    }).finally(() => {
      if (!cancelled) setSelection(undefined);
    });
    return () => { cancelled = true; };
  }, [selection]);

  function choose(event: ChangeEvent<HTMLInputElement>, kind: BulletinMediaSelection["kind"]) {
    const picked = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    if (!picked.length || waiting) return;
    setError("");
    if (files.length + picked.length > bulletinMediaLimit) {
      setError(`Mỗi bản tin đính kèm tối đa ${bulletinMediaLimit} tệp`);
      return;
    }
    setSelection({ files: picked, kind });
  }

  function remove(draft: DraftMedia) {
    setFiles(current => current.filter(file => file.key !== draft.key));
    if (previews.current.delete(draft.url)) URL.revokeObjectURL(draft.url);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (waiting) return;
    setError("");
    const fields = new FormData(event.currentTarget);
    if (!String(fields.get("title") ?? "").trim()) {
      setError("Nhập tiêu đề cho bản tin");
      return;
    }
    if (!draft) return;
    if (!draft.content.trim() && !files.length) {
      setError("Nhập nội dung hoặc thêm tệp đính kèm");
      return;
    }
    setStatus("Đang lưu bản tin…");
    try {
      const next = [...files];
      const mediaIds: string[] = [];
      for (const [index, file] of next.entries()) {
        const staged = file.file && (file.stagedAt === undefined || file.stagedAt + bulletinStageMs > Date.now());
        if (staged && file.file) {
          mediaIds.push(file.file.id);
          continue;
        }
        setStatus(`Đang tải tệp ${index + 1}/${next.length}…`);
        const uploaded = await sendFile(postId, file);
        next[index] = { ...file, file: uploaded, stagedAt: Date.now() };
        setFiles([...next]);
        mediaIds.push(uploaded.id);
      }
      setStatus("Đang lưu bản tin…");
      await onSave(fields, mediaIds, draft);
    } catch (reason) {
      setError(displayMessage(reason instanceof Error ? reason.message : "Chưa lưu được bản tin"));
    } finally {
      setStatus("");
    }
  }

  return <Dialog title={original ? "Sửa tin" : "Đăng tin"} onClose={onClose} wide
    className={editorExpanded ? "bulletin-composer-dialog bulletin-editor-expanded" : "bulletin-composer-dialog"} busy={waiting}>
    <form onSubmit={save}>
      <div className="bulletin-compose-layout">
        <div className="bulletin-compose-fields">
          <TitleField label="Tiêu đề" name="title" value={title} onChange={setTitle} maxLength={bulletinTitleLimit} busy={waiting} />
          <Suspense fallback={<div className="bulletin-editable" role="status">Đang mở trình soạn thảo</div>}>
            <BulletinRichEditor initial={initialBody} busy={waiting} expanded={editorExpanded}
              onExpand={() => setEditorExpanded(open => !open)} onDraftChange={body => {
                setDraft(body);
                setError("");
              }} />
          </Suspense>
          {!draft && <p className="form-error" role="alert">Rút gọn nội dung còn tối đa {bulletinContentLimit} ký tự hoặc giảm số cấp của danh sách để lưu</p>}
          <div className="bulletin-picker">
            <div className="bulletin-picker-actions">
              <input ref={photos} type="file" accept="image/*" multiple hidden onChange={event => choose(event, "image")} />
              <input ref={videos} type="file" accept={bulletinVideoAccept} multiple hidden onChange={event => choose(event, "video")} />
              <input ref={documents} type="file" accept={bulletinDocumentAccept} multiple hidden onChange={event => choose(event, "document")} />
              <Button variant="secondary" disabled={waiting || files.length >= bulletinMediaLimit} onClick={() => photos.current?.click()}>
                <ImagePlus size={16} aria-hidden="true" /> Thêm ảnh
              </Button>
              <Button variant="secondary" disabled={waiting || files.length >= bulletinMediaLimit} onClick={() => videos.current?.click()}>
                <Video size={16} aria-hidden="true" /> Thêm video
              </Button>
              <Button variant="secondary" disabled={waiting || files.length >= bulletinMediaLimit} onClick={() => documents.current?.click()}>
                <FileText size={16} aria-hidden="true" /> Thêm tài liệu
              </Button>
              <small>{files.length}/{bulletinMediaLimit} tệp</small>
            </div>
            <p className="hint">Video MP4, WebM hoặc MOV tối đa {bulletinVideoLimitMb} MB mỗi tệp</p>
            <p className="hint">PDF, Word, Excel và PowerPoint tối đa {bulletinDocumentLimitMb} MB mỗi tệp</p>
            {files.length > 0 && <ul className="bulletin-drafts">
              {files.map(file => <li key={file.key}>
                <div>
                  <span title={file.label}>{file.label}</span>
                  <button type="button" className="icon-button" disabled={waiting} aria-label={`Gỡ ${file.label}`}
                    onClick={() => remove(file)}><X size={17} aria-hidden="true" /></button>
                </div>
              </li>)}
            </ul>}
          </div>
          {isAdmin && <div className="form-grid bulletin-compose-schedule">
            <Field label="Hẹn đăng" hint="Giờ Việt Nam · Để trống để đăng ngay">
              <input name="publishAt" type="datetime-local" defaultValue={bulletinDateInput(original?.publishAt)} />
            </Field>
            <Field label="Hẹn tự xóa" hint="Giờ Việt Nam · Để trống để giữ tin">
              <input name="deleteAt" type="datetime-local" defaultValue={bulletinDateInput(original?.deleteAt)} />
            </Field>
          </div>}
          {(selection || status) && <p className="hint" role="status">{selection ? "Đang chuẩn bị tệp…" : status}</p>}
          {error && <p className="bulletin-picker-error" role="alert">{error}</p>}
        </div>
        <section className="bulletin-compose-preview" aria-label="Xem trước bài đăng" data-preview-open={previewOpen}>
          <h3 className="bulletin-compose-preview-label">Xem trước bài đăng</h3>
          <button type="button" className="btn secondary bulletin-compose-preview-toggle" aria-expanded={previewOpen}
            aria-controls="bulletin-draft-preview" onClick={() => setPreviewOpen(open => !open)}>
            {previewOpen ? "Ẩn bản xem trước" : "Xem trước bài đăng"}
          </button>
          <article className="bulletin-compose-preview-body" id="bulletin-draft-preview">
            <h4 className="bulletin-post-title">{title.trim() || "Tiêu đề bài đăng"}</h4>
            <div className="bulletin-fulltext">
              {draft?.content.trim() ? <BulletinText {...draft} /> : <span className="hint">Nội dung sẽ hiện ở đây</span>}
            </div>
            {files.length > 0 && <ul className="bulletin-media-gallery">
              {files.map(file => <li key={file.key} className={isBulletinDocument(file.type) ? "bulletin-media-document" :
                file.type === "image/jpeg" ? "bulletin-media-image" : "bulletin-media-video"}>
                <BulletinAttachmentView type={file.type} url={file.url} label={file.label} />
              </li>)}
            </ul>}
          </article>
        </section>
      </div>
      <FormFooter label={original ? "Lưu thay đổi" : "Đăng tin"} busy={waiting} disabled={!draft} onCancel={onClose} />
    </form>
  </Dialog>;
}
