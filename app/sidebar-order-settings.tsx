"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { sidebarTabLabels, type SidebarTab } from "../lib/workspace-navigation";
import { Button, PanelHead } from "./ui";

export function SidebarOrderSettings({ current, defaults, busy, onSave }: {
  current: SidebarTab[];
  defaults: SidebarTab[];
  busy: boolean;
  onSave: (order: SidebarTab[]) => void;
}) {
  const [order, setOrder] = useState(current);
  const changed = order.some((tab, index) => tab !== current[index]);
  const isDefault = order.every((tab, index) => tab === defaults[index]);

  function move(index: number, offset: -1 | 1) {
    setOrder(previous => {
      const next = [...previous];
      const destination = index + offset;
      [next[index], next[destination]] = [next[destination], next[index]];
      return next;
    });
  }

  return (
    <section className="panel settings-card sidebar-order-settings" aria-label="Thứ tự tab">
      <PanelHead title="Thứ tự tab" description="Dùng mũi tên để sắp xếp các mục ở thanh bên cho tài khoản của bạn" />
      <form onSubmit={event => { event.preventDefault(); onSave(order); }}>
        <ol className="sidebar-order-list">
          {order.map((tab, index) => (
            <li key={tab}>
              <span>{sidebarTabLabels[tab]}</span>
              <div className="sidebar-order-actions">
                <Button variant="secondary" aria-label={`Đưa ${sidebarTabLabels[tab]} lên`}
                  disabled={busy || index === 0} onClick={() => move(index, -1)}>
                  <ChevronUp size={18} aria-hidden="true" />
                </Button>
                <Button variant="secondary" aria-label={`Đưa ${sidebarTabLabels[tab]} xuống`}
                  disabled={busy || index === order.length - 1} onClick={() => move(index, 1)}>
                  <ChevronDown size={18} aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ol>
        <div className="sidebar-order-footer">
          <Button type="submit" disabled={busy || !changed}><Check size={16} /> Lưu thứ tự</Button>
          <Button variant="secondary" disabled={busy || isDefault} onClick={() => setOrder(defaults)}>Về mặc định</Button>
        </div>
      </form>
    </section>
  );
}
