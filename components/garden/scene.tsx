"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, PawPrint, Expand, ArrowLeft } from "lucide-react";
import { GardenClock, GardenControls, useAtmosphere } from "./atmosphere";
import { gardenLabels, periodAt } from "../../lib/garden-time";
import type { GardenWorld } from "./world";

export function GardenScene({ className = "" }: { className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const world = useRef<GardenWorld | null>(null);
  const { hour, paused } = useAtmosphere();
  const latest = useRef({ hour, paused });
  const [status, setStatus] = useState("loading");
  useEffect(() => { latest.current = { hour, paused }; world.current?.update(hour, paused); }, [hour, paused]);
  useEffect(() => {
    let cancelled = false;
    import("./world").then(({ createGarden }) => {
      if (cancelled || !host.current) return;
      try {
        world.current = createGarden(host.current, latest.current, () => setStatus("fallback"));
        setStatus("ready");
      } catch { setStatus("fallback"); }
    }).catch(() => { if (!cancelled) setStatus("fallback"); });
    return () => { cancelled = true; world.current?.dispose(); world.current = null; };
  }, []);
  return <div className={`garden-scene ${className}`} data-scene-status={status} role="img" aria-label="Khu vườn Nhật Bản 3D với nhà gỗ, hoa anh đào, hồ cá và hai chú mèo: mèo Anh lông ngắn xám trắng và mèo Xiêm.">
    <div className="garden-canvas" ref={host} aria-hidden="true" />
    {status !== "ready" ? <div className="garden-fallback" aria-hidden="true"><div className="fallback-house">庭</div><span>🐈</span><span>🐈‍⬛</span><p>{status === "loading" ? "Khu vườn đang thức giấc…" : "Một góc vườn bình yên"}</p></div> : null}
  </div>;
}

export function GardenBackdrop() {
  const { focused, toggleFocus, hour, mode } = useAtmosphere();
  return <>
    <div className="garden-backdrop"><GardenScene /></div>
    {focused ? <div className="garden-view-caption"><span>庭 · NHỊP GARDEN</span><h1>Một góc bình yên.</h1><p>Mèo Anh xám trắng & mèo Xiêm</p><GardenClock /></div> : null}
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
