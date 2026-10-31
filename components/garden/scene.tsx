"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SylvaHero } from "@designcodeio/threeui";
import { ArrowUpRight, PawPrint, Expand, ArrowLeft } from "lucide-react";
import { GardenClock, GardenControls, useAtmosphere } from "./atmosphere";
import { gardenLabels, periodAt } from "../../lib/garden-time";

export function GardenScene({ className = "" }: { className?: string }) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const { hour, paused, visitor, focused, toggleFocus, toggleMotion } = useAtmosphere();
  const [status, setStatus] = useState("loading");
  const settings = useRef({ hour, paused, presentation: "background" as "hero" | "background" });
  const sync = useCallback(() => {
    (frame.current?.contentWindow as (Window & { nhipSylva?: { set: (s: typeof settings.current) => void } }) | null)?.nhipSylva?.set(settings.current);
  }, []);
  useEffect(() => {
    settings.current = { hour, paused, presentation: visitor && !focused ? "hero" : "background" };
    sync();
  }, [hour, paused, visitor, focused, sync]);
  const applyScene = useCallback((element: HTMLIFrameElement) => {
    frame.current = element;
    const doc = element.contentDocument;
    if (!doc) return;
    if (!doc.getElementById("nhip-sylva-extension")) {
      const script = doc.createElement("script"); script.id = "nhip-sylva-extension";
      script.src = "/landing-pages/inner-green-assets/nhip-sylva.js";
      script.onload = () => { sync(); setStatus("ready"); };
      script.onerror = () => setStatus("fallback");
      doc.body.appendChild(script);
    }
    sync();
  }, [sync]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "nhip-sylva-loaded") { sync(); return; }
      if (event.data?.type !== "nhip-sylva-action") return;
      if (event.data.action === "motion") toggleMotion();
      if (event.data.action === "focus") toggleFocus();
      if (event.data.action === "login") {
        if (visitor) window.dispatchEvent(new Event("nhip-open-login"));
        else if (focused) toggleFocus();
      }
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [visitor, focused, toggleFocus, toggleMotion, sync]);
  return <div className={`garden-scene shader-frame ${className}`} data-scene-status={status} aria-label="Thế giới rêu xanh Sylva với mèo Xiêm và mèo Anh lông ngắn bicolor xám trắng">
    <SylvaHero variant="living-green" headingFont="lexend" bodyFont="lexend" headingWeight="300" bodyWeight="300"
      primaryColor="#ffffff" headingSize={63} bodySize={16.5} headingLetterSpacing={-0.006} applyScene={applyScene} />
    {status === "fallback" ? <p className="sylva-load-note" role="status">Không tải được hai bạn mèo. Bạn vẫn có thể đăng nhập CLB.</p> : null}
  </div>;
}

export function GardenBackdrop() {
  const { focused, toggleFocus, hour, mode } = useAtmosphere();
  return <>
    <div className="garden-backdrop"><GardenScene /></div>
    {focused ? <div className="garden-view-caption"><span>NHỊP CLB · LIVING GREEN</span><h1>Cùng một nhịp, cùng lớn lên.</h1><p>Mèo Anh lông ngắn bicolor xám trắng & mèo Xiêm</p><GardenClock /></div> : null}
    <div className="garden-dock">
      <span className="garden-dock-period">{mode === "live" ? "" : "Xem trước · "}{gardenLabels[periodAt(hour)]}</span>
      <GardenControls />
      <button type="button" className="garden-focus-button" onClick={toggleFocus} aria-pressed={focused}>{focused ? <ArrowLeft size={15} /> : <Expand size={15} />}{focused ? "Trở lại CLB" : "Ngắm khu vườn"}</button>
    </div>
  </>;
}

export function GardenHero({ name, onAction, actionLabel = "Xem lịch trực" }: { name: string; onAction: () => void; actionLabel?: string }) {
  return <section className="garden-hero" aria-label="Khu vườn CLB">
    <div className="garden-hero-copy">
      <span className="garden-kicker"><span /> MỘT GÓC BÌNH YÊN · MỘT NHỊP CHUNG</span>
      <h2>Chào {name},<br />cùng một nhịp <em>hôm nay.</em></h2>
      <p>Hẹn nhau một buổi họp.<br />Góp sức qua từng ca trực.</p>
      <button type="button" className="garden-action" onClick={onAction}>{actionLabel}<ArrowUpRight size={17} /></button>
      <div className="garden-cats-caption"><PawPrint size={14} /> Hai người bạn nhỏ đang dạo vườn.</div>
    </div>
  </section>;
}
