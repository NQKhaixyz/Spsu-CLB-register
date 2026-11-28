"use client";

import { ArrowDown, ArrowUp, Check } from "lucide-react";
import { useState } from "react";
import { sidebarTabLabels, type SidebarTab } from "../lib/workspace-navigation";
import { Button, PanelHead } from "./ui";

export function TeamSidebarSettings({ order, busy, onSave }: {
  order: SidebarTab[];
  busy: boolean;
  onSave: (order: SidebarTab[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(order);
  const changed = draft.some((tab, index) => tab !== order[index]);

  function move(index: number, nextIndex: number) {
    const next = [...draft];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setDraft(next);
  }

  return <section className="panel settings-card">
    <PanelHead title="Thứ tự các tab" description="Áp dụng cho mọi tài khoản trong Đội" />
    <form onSubmit={event => {
      event.preventDefault();
      if (changed && !busy) void onSave(draft);
    }}>
      <ol className="team-sidebar-order">
        {draft.map((tab, index) => <li key={tab}>
          <span>{sidebarTabLabels[tab]}</span>
          <Button variant="secondary" disabled={busy || index === 0}
            aria-label={`Đưa ${sidebarTabLabels[tab]} lên`} onClick={() => move(index, index - 1)}>
            <ArrowUp size={16} aria-hidden="true" />
          </Button>
          <Button variant="secondary" disabled={busy || index === draft.length - 1}
            aria-label={`Đưa ${sidebarTabLabels[tab]} xuống`} onClick={() => move(index, index + 1)}>
            <ArrowDown size={16} aria-hidden="true" />
          </Button>
        </li>)}
      </ol>
      <Button type="submit" disabled={busy || !changed}><Check size={16} aria-hidden="true" /> Lưu thứ tự</Button>
    </form>
  </section>;
}
