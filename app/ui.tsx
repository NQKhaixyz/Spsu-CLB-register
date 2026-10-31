"use client";
import { useEffect, useRef, type ReactNode } from "react";
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

export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <Clover size={27} strokeWidth={1.9} />
      </span>
      <span>
        nhịp<span className="brand-dot">.</span>
        <small>KHÔNG GIAN CLB</small>
      </span>
    </div>
  );
}
export function Avatar({
  name,
  size = "",
  index = 0,
}: {
  name: string;
  size?: string;
  index?: number;
}) {
  return (
    <span className={`avatar ${size} color-${index % 6}`} aria-hidden="true">
      {name
        .split(" ")
        .slice(-2)
        .map((n) => n[0])
        .join("")
        .toUpperCase()}
    </span>
  );
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
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: string;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      title={title}
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
      <p>Đang kết nối không gian CLB…</p>
    </div>
  );
}
export function Dialog({
  title,
  description,
  children,
  onClose,
  wide = false,
  busy = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
        ) ?? [],
      );
    const timer = setTimeout(() => {
      (
        ref.current?.querySelector<HTMLElement>("input,textarea,select") ??
        focusables()[0]
      )?.focus();
    }, 30);
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
      if (e.key === "Tab") {
        const list = focusables();
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
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", handler);
      previous?.focus();
    };
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
  label: string;
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
  label = "Lưu thay đổi",
  onCancel,
}: {
  busy?: boolean;
  label?: string;
  onCancel: () => void;
}) {
  return (
    <div className="form-footer">
      <Button variant="secondary" onClick={onCancel} disabled={busy}>
        Hủy
      </Button>
      <Button type="submit" disabled={busy}>
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
