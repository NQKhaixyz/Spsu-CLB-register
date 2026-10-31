"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Clock3, Moon, Pause, Play, Sun, Sunrise, Sunset } from "lucide-react";
import { gardenHour, gardenLabels, periodAt, type GardenMode } from "../../lib/garden-time";

const Atmosphere = createContext({ hour: 12, mode: "live" as GardenMode, paused: false,
  focused: false, toggleFocus: () => {}, visitor: false, setVisitor: (_value: boolean) => {}, clock: "--:--", setMode: (_mode: GardenMode) => {}, toggleMotion: () => {} });
export function useAtmosphere() { return useContext(Atmosphere); }

export function AtmosphereProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState<Date | null>(null);
  const [mode, setMode] = useState<GardenMode>("live");
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visitor, setVisitor] = useState(false);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setFocused(false); };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => { document.documentElement.dataset.gardenFocus = String(focused); }, [focused]);
  useEffect(() => {
    const sync = () => setNow(new Date());
    sync();
    const timer = window.setInterval(sync, 30_000);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    try { setPaused(preference.matches || localStorage.getItem("nhip-garden-motion-v1") === "paused"); }
    catch { setPaused(preference.matches); }
    const reduceMotion = (event: MediaQueryListEvent) => { if (event.matches) setPaused(true); };
    preference.addEventListener("change", reduceMotion);
    document.addEventListener("visibilitychange", sync);
    return () => { clearInterval(timer); preference.removeEventListener("change", reduceMotion); document.removeEventListener("visibilitychange", sync); };
  }, []);
  const hour = now ? gardenHour(mode, now) : 12;
  const period = periodAt(hour);
  useEffect(() => { document.documentElement.dataset.gardenTime = period; }, [period]);
  function toggleMotion() {
    const next = !paused;
    setPaused(next);
    try { localStorage.setItem("nhip-garden-motion-v1", next ? "paused" : "playing"); } catch { /* Optional preference storage. */ }
  }
  const clock = now ? now.toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" }) : "--:--";
  return <Atmosphere.Provider value={{ hour, mode, paused, clock, setMode, toggleMotion, focused, visitor, setVisitor, toggleFocus: () => setFocused(value => !value) }}>
    {children}
  </Atmosphere.Provider>;
}

export function ClubSurface({ children }: { children: ReactNode }) {
  const { focused } = useAtmosphere();
  return <div className="club-interface" inert={focused} aria-hidden={focused || undefined}>{children}</div>;
}

export function GardenClock() {
  const { hour, mode, clock } = useAtmosphere();
  const Icon = { dawn: Sunrise, day: Sun, dusk: Sunset, night: Moon }[periodAt(hour)];
  return <span className="garden-clock" title="Giờ Việt Nam · UTC+7"><Icon size={15} /><span>{clock} <span className="clock-zone">· Việt Nam</span></span><i className={mode === "live" ? "clock-live" : ""} /></span>;
}

export function GardenControls() {
  const { paused, mode, setMode, toggleMotion } = useAtmosphere();
  return <div className="garden-controls">
    <label className="garden-time-picker"><Clock3 size={13} /><span className="sr-only">Thời gian khu vườn</span>
      <select aria-label="Thời gian khu vườn" value={mode} onChange={e => setMode(e.target.value as GardenMode)}>
        <option value="live">Theo giờ thực</option>
        {Object.entries(gardenLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <button type="button" onClick={toggleMotion} aria-label={paused ? "Bật chuyển động" : "Tạm dừng chuyển động"} title={paused ? "Bật chuyển động" : "Tạm dừng chuyển động"} aria-pressed={paused}>
      {paused ? <Play size={14} /> : <Pause size={14} />}
    </button>
  </div>;
}
