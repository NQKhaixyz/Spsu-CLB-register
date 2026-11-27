"use client";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clover,
  LoaderCircle,
  X,
  type LucideIcon,
} from "lucide-react";
import { statusNames, type Registration } from "../lib/club";
import { avatarEndpoint } from "../lib/avatar";
import { monthlyScoreTier } from "../lib/score-ranks";
import { useMemberIdentity } from "./member-identity";

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Clover size={27} strokeWidth={1.9} />
      </span>
      <span>
        nhịp
        <small>KHÔNG GIAN ĐỘI</small>
      </span>
    </div>
  );
}
export function Avatar({
  name,
  memberId,
  size = "",
  index = 0,
  photoId,
  previewUrl,
  profileLink = true,
}: {
  name: string;
  memberId?: string;
  size?: string;
  index?: number;
  photoId?: string;
  previewUrl?: string;
  profileLink?: boolean;
}) {
  const src = previewUrl ?? (photoId ? `${avatarEndpoint}?photo=${encodeURIComponent(photoId)}` : undefined);
  const [failedSrc, setFailedSrc] = useState<string>();
  const identity = useMemberIdentity();
  const className = `avatar ${size} color-${index % 6}`;
  const portrait = (
    <>
      {name
        .split(" ")
        .slice(-2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()}
      {src && src !== failedSrc && (
        // The authenticated image and upload preview use their original URLs.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" loading="lazy" onError={() => setFailedSrc(src)} />
      )}
    </>
  );
  const face = <span className={className} aria-hidden="true">{portrait}</span>;
  if (!memberId || !identity?.members.has(memberId)) return face;

  const tier = monthlyScoreTier(identity.monthlyRanks.get(memberId) ?? 0);
  const frameClass = `avatar-frame ${size}`;
  const framedPortrait = <>
    {face}
    {tier && <>
      <span className="avatar-frame-sheen" aria-hidden="true" />
      <span className="avatar-frame-gem" aria-hidden="true" />
    </>}
  </>;
  if (!profileLink) return <span className={frameClass} data-tier={tier?.id} aria-hidden="true">{framedPortrait}</span>;
  const label = `Xem hồ sơ ${name}`;
  return <button type="button" className={`${frameClass} avatar-profile-trigger`} data-tier={tier?.id} aria-label={label}
    title={tier ? `${label} · ${tier.label}` : label} aria-haspopup="dialog"
    onClick={event => { event.stopPropagation(); identity.openProfile(memberId); }}>
    {framedPortrait}
  </button>;
}
export function Badge({
  status,
  children,
}: {
  status: string;
  children?: ReactNode;
}) {
  return (
    <span className={`badge ${status}`}>
      <i />
      {children ?? statusNames[status as Registration] ?? status}
    </span>
  );
}
export function Button({
  children,
  onClick,
  variant = "primary",
  type = "button",
  disabled,
  className = "",
  title,
  "aria-label": ariaLabel,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <button
      title={title}
      aria-label={ariaLabel}
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`btn ${variant} ${className}`}
    >
      {children}
    </button>
  );
}
export function Empty({
  title,
  children,
  icon: Icon = CalendarDays,
  action,
}: {
  title: string;
  children?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Stat({
  title,
  value,
  description,
  icon: Icon,
  color = "green",
  onClick,
}: {
  title: string;
  value: number | string;
  description: string;
  icon: LucideIcon;
  color?: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`stat-card ${color}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <div className="stat-top">
        <span>{title}</span>
        <span className="stat-icon">
          <Icon size={18} />
        </span>
      </div>
      <strong>{value.toLocaleString("vi-VN")}</strong>
      <div className="stat-bottom">
        <span>{description}</span>
        {onClick ? <ArrowUpRight size={15} /> : null}
      </div>
    </button>
  );
}
export function PanelHead({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-head">
      <div>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
export function LinkButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="text-button" onClick={onClick}>
      {children}
      <ChevronRight size={15} />
    </button>
  );
}
export function Loading() {
  return (
    <div className="loading-screen">
      <Brand />
      <LoaderCircle className="spin" size={24} />
      <p>Đang kết nối không gian Đội…</p>
    </div>
  );
}
function dialogControls(dialog: HTMLDivElement | null) {
  return Array.from(dialog?.querySelectorAll<HTMLElement>(
    'button:not([disabled]),a[href],input:not([disabled]):not([hidden]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
  ) ?? []);
}

export function Dialog({
  title,
  description,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = ref.current;
    if (!dialog?.contains(previous)) {
      const list = dialogControls(dialog);
      (list.find(element => element.matches("input,textarea,select")) ?? list[0] ?? dialog)?.focus();
    }
    return () => {
      document.body.style.overflow = bodyOverflow;
      previous?.focus();
    };
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "Escape" || e.key === "Tab") && document.querySelector("dialog[open]")) return;
      if (e.key === "Escape" && !busy) onClose();
      if (e.key === "Tab") {
        const list = dialogControls(ref.current);
        if (!list.length) return;
        if (e.shiftKey && document.activeElement === list[0]) {
          e.preventDefault();
          list.at(-1)?.focus();
        } else if (!e.shiftKey && document.activeElement === list.at(-1)) {
          e.preventDefault();
          list[0].focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, busy]);
  return (
    <div
      className="dialog-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        className={`dialog ${wide ? "wide" : ""}`}
      >
        <div className="dialog-heading">
          <div>
            <h2 id="dialog-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Đóng hộp thoại"
            disabled={busy}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: ReactNode;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
export function FormFooter({
  busy,
  disabled,
  label = "Lưu thay đổi",
  onCancel,
}: {
  busy?: boolean;
  disabled?: boolean;
  label?: string;
  onCancel: () => void;
}) {
  return (
    <div className="form-footer">
      <Button variant="secondary" onClick={onCancel} disabled={busy}>
        Hủy
      </Button>
      <Button type="submit" disabled={busy || disabled}>
        {busy ? (
          <LoaderCircle className="spin" size={16} />
        ) : (
          <Check size={16} />
        )}{" "}
        {label}
      </Button>
    </div>
  );
}
