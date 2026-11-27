"use client";

import { ImagePlus } from "lucide-react";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { avatarEndpoint, maxAvatarBytes } from "../lib/avatar";
import type { Member, View } from "../lib/club";
import { displayMessage } from "../lib/display-message";
import { preparePhoto } from "./prepare-photo";
import { Avatar, Button, Dialog, FormFooter } from "./ui";

export function AvatarEditor({ member, onClose, onRefresh, onSaved }: {
  member: Member;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSaved: (updated: View, message: string) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<{ photo: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preview = draft?.url;
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setDraft(null);
    if (file.size > 20 * 1024 * 1024) {
      setError("Ảnh vượt quá 20 MB, hãy chọn ảnh nhỏ hơn");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const photo = await preparePhoto(file, { maxSide: 320, maxBytes: maxAvatarBytes, square: true });
      setDraft({ photo, url: URL.createObjectURL(photo) });
    } catch (reason) {
      setError(reason instanceof DOMException ? "Không đọc được ảnh, hãy thử ảnh JPG hoặc PNG"
        : reason instanceof Error ? reason.message : "Không đọc được ảnh");
    } finally {
      setBusy(false);
    }
  }

  async function save(method: "POST" | "DELETE") {
    if (busy || (method === "POST" && !draft)) return;
    setBusy(true);
    setError("");
    try {
      const url = member.avatarId ? `${avatarEndpoint}?replace=${encodeURIComponent(member.avatarId)}` : avatarEndpoint;
      const response = await fetch(url, {
        method,
        ...(method === "POST" && draft ? { headers: { "Content-Type": "image/jpeg" }, body: draft.photo } : {}),
      });
      const updated = await response.json() as View & { error?: string };
      if (response.status === 409) await onRefresh();
      if (!response.ok) throw new Error(updated.error || "Chưa lưu được ảnh đại diện");
      onSaved(updated, method === "POST" ? "Đã lưu ảnh đại diện" : "Đã gỡ ảnh đại diện");
    } catch (reason) {
      setError(displayMessage(reason instanceof Error ? reason.message : "Chưa lưu được ảnh đại diện"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title="Đổi ảnh đại diện" description="Thành viên trong Đội có thể xem ảnh của bạn" onClose={onClose} busy={busy}>
      <form onSubmit={event => { event.preventDefault(); void save("POST"); }}>
        <div className="avatar-editor">
          <Avatar name={member.name} photoId={member.avatarId} previewUrl={preview} size="large" />
          <div className="avatar-editor-actions">
            <input ref={picker} type="file" accept="image/*" onChange={choosePhoto} hidden />
            <Button variant="secondary" disabled={busy} onClick={() => picker.current?.click()}>
              <ImagePlus size={16} aria-hidden="true" /> Chọn ảnh
            </Button>
            {member.avatarId && !draft && (
              <Button variant="secondary" disabled={busy} onClick={() => void save("DELETE")}>Gỡ ảnh</Button>
            )}
          </div>
          {draft && <p className="hint" role="status">Ảnh xem trước</p>}
          {error && <p className="avatar-editor-error" role="alert">{error}</p>}
        </div>
        <FormFooter label="Lưu ảnh" onCancel={onClose} busy={busy} disabled={!draft} />
      </form>
    </Dialog>
  );
}
