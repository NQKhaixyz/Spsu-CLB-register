"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CloudRain, Cookie, Ellipsis, Hand, Moon, PawPrint, RotateCw, Sun, Volume2, VolumeX, Wind, X } from "lucide-react";
import { createScreenPet, type PetAction, type PetController } from "../lib/screen-pet";
import { FurballArt } from "./furball-art";

export function ScreenCat() {
  const hostRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const ballRef = useRef<HTMLDivElement>(null);
  const controller = useRef<PetController | null>(null);
  const [open, setOpen] = useState(false);
  const [sleeping, setSleeping] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [muted, setMuted] = useState(true);
  const [notice, setNotice] = useState("Một cục bông, rất thích được cưng.");
  const id = useId();

  useEffect(() => {
    const pet = createScreenPet(hostRef.current!, buttonRef.current!, ballRef.current!, { notice: setNotice, sleeping: setSleeping });
    controller.current = pet;
    try {
      setHidden(localStorage.getItem("nhip-pet-hidden") === "true");
      setMuted(localStorage.getItem("nhip-pet-muted") !== "false");
    } catch { /* Browser storage is optional. */ }
    return () => { pet.destroy(); controller.current = null; };
  }, []);
  useEffect(() => { controller.current?.setHidden(hidden); }, [hidden]);
  useEffect(() => { controller.current?.setMuted(muted); }, [muted]);
  useEffect(() => {
    controller.current?.setMenu(open ? panelRef.current : null);
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    const dismiss = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || event.target.closest("[data-pet-ui]")) return;
      setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggleRef.current?.focus({ preventScroll: true }); }
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", dismiss); window.removeEventListener("keydown", escape); };
  }, [open]);

  function act(action: PetAction) {
    controller.current?.act(action); setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  }
  function hide(value: boolean) {
    setHidden(value); setOpen(false);
    try { localStorage.setItem("nhip-pet-hidden", String(value)); } catch { /* Optional preference. */ }
  }
  function sound() {
    const value = !muted; setMuted(value); controller.current?.setMuted(value);
    if (!value) controller.current?.act("hello");
    try { localStorage.setItem("nhip-pet-muted", String(value)); } catch { /* Optional preference. */ }
  }

  return <>
    <div className="screen-cat" ref={hostRef} data-state="idle" data-pet-ui hidden={hidden}>
      <button ref={buttonRef} className="screen-cat-touch" type="button"
        aria-label="Bông: chạm để vuốt ve, giữ để bóp mềm, kéo để di chuyển"
        title="Vuốt ve · Giữ để bóp mềm · Kéo và thả"
        onContextMenu={event => { event.preventDefault(); setOpen(value => !value); }}>
        <FurballArt />
      </button>
      <button ref={toggleRef} className="pet-menu-toggle" type="button" aria-label="Chăm sóc Bông"
        aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><Ellipsis size={19} aria-hidden="true" /></button>
    </div>
    <div ref={ballRef} className="pet-ball" data-pet-ui aria-hidden="true" hidden><span /></div>
    {open && !hidden && <div ref={panelRef} id={id} className="pet-panel" role="dialog" aria-label="Chăm sóc Bông" data-pet-ui>
      <div className="pet-panel-heading"><div><span className="pet-eyebrow">BẠN NHỎ CỦA BẠN</span><h2>Bông <span>✦</span></h2></div>
        <button className="pet-icon-button" type="button" aria-label="Đóng chăm sóc" onClick={() => { setOpen(false); toggleRef.current?.focus(); }}><X size={18} /></button>
      </div>
      <p className="pet-notice">{notice}</p>
      <div className="pet-actions">
        <button type="button" onClick={() => act("pet")}><Hand /><span>Vuốt ve</span></button>
        <button type="button" onClick={() => act("feed")}><Cookie /><span>Cho ăn</span></button>
        <button type="button" onClick={() => act("ball")}><PawPrint /><span>Chơi bóng</span></button>
        <button type="button" onClick={() => act("roll")}><RotateCw /><span>Lăn một vòng</span></button>
        <button type="button" onClick={() => act("rain")}><CloudRain /><span>Mưa nhỏ</span></button>
        <button type="button" onClick={() => act("dry")}><Wind /><span>Sấy lông</span></button>
      </div>
      <button className="pet-rest" type="button" onClick={() => act("sleep")}>{sleeping ? <Sun size={17} /> : <Moon size={17} />}<span>{sleeping ? "Dậy chơi nào" : "Ngủ một chút"}</span></button>
      <p className="pet-hint">Rê chuột để gọi Bông. Giữ nhẹ để bóp mềm, kéo rồi thả để tung bé lên.</p>
      <div className="pet-panel-footer"><button type="button" onClick={sound}>{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}{muted ? "Bật âm thanh" : "Tắt âm thanh"}</button><button type="button" onClick={() => hide(true)}>Ẩn Bông</button></div>
    </div>}
    {hidden && <button className="pet-restore" type="button" onClick={() => hide(false)} aria-label="Gọi Bông trở lại" data-pet-ui><PawPrint size={19} /><span>Gọi Bông</span></button>}
    <span className="pet-announcement" role="status" aria-live="polite">{notice}</span>
  </>;
}
