"use client";
import { useState } from "react";
import { Check } from "lucide-react";
import { interfaceFonts, type FontId } from "../lib/interface-fonts";
import { Button, PanelHead } from "./ui";

export function FontSettings({ current, busy, onSave }: {
  current: FontId;
  busy: boolean;
  onSave: (font: FontId) => void;
}) {
  const [selected, setSelected] = useState(current);
  return (
    <section className="panel settings-card font-settings" aria-label="Phông chữ">
      <PanelHead title="Phông chữ" description="Chọn kiểu chữ bạn muốn dùng, lựa chọn được lưu vào tài khoản của bạn" />
      <form onSubmit={e => { e.preventDefault(); onSave(selected); }}>
        <fieldset className="font-options" aria-label="Chọn phông chữ" disabled={busy}>
          {interfaceFonts.map(font => (
            <label key={font.id} className="font-option" data-font={font.id}>
              <input type="radio" name="fontPreference" aria-label={font.name} value={font.id}
                checked={font.id === selected} onChange={() => setSelected(font.id)} />
              <strong>{font.name}</strong>
              <span>{font.description}</span>
            </label>
          ))}
        </fieldset>
        <div className="font-preview" data-font={selected}>
          <span>Xem trước</span>
          <strong>Lịch trực của Đội</strong>
          <p>Thứ Bảy · Ca sáng · 2.75 điểm</p>
        </div>
        <Button type="submit" disabled={busy || selected === current}>
          <Check size={16} /> Lưu phông chữ
        </Button>
      </form>
    </section>
  );
}
