"use client";

import { useState } from "react";
import { bulletinMediaUrl, type BulletinMedia, type BulletinMediaType } from "../lib/bulletin-media";

export function BulletinAttachmentView({ type, url, label, lazy = false }: {
  type: BulletinMediaType;
  url: string;
  label: string;
  lazy?: boolean;
}) {
  const [videoFailed, setVideoFailed] = useState(false);
  if (type === "image/jpeg") {
    // This URL is either an authenticated original or a local upload preview.
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={label} loading={lazy ? "lazy" : "eager"} decoding="async" />;
  }
  return videoFailed ? (
    <div className="bulletin-video-fallback">
      <p>Trình duyệt này chưa phát được video</p>
      <a href={url} download>Tải video</a>
    </div>
  ) : (
    <video src={url} controls playsInline preload={lazy ? "none" : "metadata"}
      aria-label={label} onError={() => setVideoFailed(true)} />
  );
}

export function BulletinAttachments({ postId, title, files, onOpen }: {
  postId: string;
  title: string;
  files?: BulletinMedia[];
  onOpen?: () => void;
}) {
  if (!files?.length) return null;
  const visible = onOpen ? files.slice(0, 2) : files;
  const singleImage = visible.filter(file => file.type === "image/jpeg").length === 1;
  return <div className="bulletin-attachments">
    <ul className="bulletin-media-gallery" data-single-image={singleImage}>
      {visible.map((file, index) => {
        const url = bulletinMediaUrl(postId, file.id);
        const image = file.type === "image/jpeg";
        const label = `${image ? "Ảnh" : "Video"} ${index + 1} của ${title}`;
        const attachment = <BulletinAttachmentView type={file.type} url={url} label={label} lazy={!!onOpen} />;
        return <li key={file.id} className={image ? "bulletin-media-image" : "bulletin-media-video"}>
          {image ? onOpen
            ? <button type="button" aria-label={`Xem ${label.toLowerCase()}`} onClick={onOpen}>{attachment}</button>
            : <a href={url} target="_blank" rel="noopener">{attachment}</a>
            : attachment}
        </li>;
      })}
    </ul>
    {onOpen && files.length > visible.length && (
      <button type="button" className="text-button" onClick={onOpen}>Xem cả {files.length} tệp</button>
    )}
  </div>;
}
