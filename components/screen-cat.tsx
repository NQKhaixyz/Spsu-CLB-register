"use client";

import { useEffect, useId, useRef } from "react";

type Point = { x: number; y: number };
type Mood = "idle" | "walk" | "chase" | "roll" | "drag" | "land" | "sleep" | "pet";
const CONTROL = 'input,textarea,select,button,a,[role="button"],[contenteditable="true"]';

/** A single viewport companion. Movement stays outside React's render cycle. */
export function ScreenCat() {
  const hostRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    const host = hostRef.current!, button = buttonRef.current!;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const bounds = { width: innerWidth, height: innerHeight, radius: host.offsetWidth / 2 + 5 };
    const clamp = (p: Point): Point => ({
      x: Math.max(bounds.radius, Math.min(bounds.width - bounds.radius, p.x)),
      y: Math.max(bounds.radius, Math.min(bounds.height - bounds.radius, p.y)),
    });
    let position = clamp({ x: innerWidth * .25, y: innerHeight * .74 });
    let target = { ...position };
    let pointer: Point | null = null;
    let pointerAt = 0, targetAt = 0, last = performance.now(), elapsed = 0;
    let mood: Mood = "idle", until = 0, nextWander = last + 1800;
    let nextRoll = last + 16000, frame = 0, lastAvoid = 0;
    let forbidden: DOMRect | null = null;
    let focused = false, reduced = motion.matches, running = true;
    let dragging: { id: number; start: Point; origin: Point; moved: boolean } | null = null;

    function state(value: Mood) {
      if (mood === value) return;
      mood = value; host.dataset.state = value;
    }
    function paint() {
      host.style.transform = `translate3d(${position.x - host.offsetWidth / 2}px,${position.y - host.offsetHeight / 2}px,0)`;
    }
    function controlAt(x: number, y: number) {
      return document.elementsFromPoint(x, y).find(el => !host.contains(el) && el.closest(CONTROL))?.closest(CONTROL);
    }
    function outside(rect: DOMRect, p: Point): Point {
      const gap = bounds.radius + 12;
      if (p.x < rect.left - gap || p.x > rect.right + gap || p.y < rect.top - gap || p.y > rect.bottom + gap) return p;
      const exits = [
        { x: rect.left - gap, y: p.y }, { x: rect.right + gap, y: p.y },
        { x: p.x, y: rect.top - gap }, { x: p.x, y: rect.bottom + gap },
      ].filter(q => q.x >= bounds.radius && q.x <= bounds.width - bounds.radius && q.y >= bounds.radius && q.y <= bounds.height - bounds.radius);
      return exits.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] ?? clamp({ x: bounds.radius, y: bounds.radius });
    }
    function avoidControls(now: number) {
      if (now - lastAvoid < 100 || dragging) return;
      lastAvoid = now;
      const active = document.activeElement;
      const activeRect = active instanceof HTMLElement && !host.contains(active) && active.matches(CONTROL) ? active.getBoundingClientRect() : null;
      // Test the pet's hit area, not just its centre, so form controls remain clickable.
      const offsets = [[0, 0], [-34, -24], [34, -24], [-34, 28], [34, 28]];
      const under = offsets.map(([x, y]) => controlAt(position.x + x, position.y + y)).find(Boolean);
      button.style.pointerEvents = under ? "none" : "auto";
      if (under && !focused) {
        // Leave the entire form rather than bouncing between adjacent fields.
        const obstacle = under.closest("form") ?? under;
        target = outside(obstacle.getBoundingClientRect(), position); pointerAt = 0;
      }
      if (activeRect) target = outside(activeRect, target);
      if (forbidden) target = outside(forbidden, target);
      target = clamp(target);
    }
    function play() {
      dragging = null; target = { ...position };
      state(reduced ? "pet" : "roll"); until = performance.now() + (reduced ? 700 : 1450);
      nextWander = until + 1500; nextRoll = until + 20000;
    }
    function onPointer(event: PointerEvent) {
      if (dragging) {
        if (event.pointerId !== dragging.id) return;
        dragging.moved ||= Math.hypot(event.clientX - dragging.start.x, event.clientY - dragging.start.y) > 6;
        position = clamp({ x: dragging.origin.x + event.clientX - dragging.start.x, y: dragging.origin.y + event.clientY - dragging.start.y });
        target = { ...position }; paint(); return;
      }
      if (event.pointerType === "touch" || host.contains(event.target as Node)) return;
      pointer = { x: event.clientX, y: event.clientY }; pointerAt = performance.now();
      const el = event.target instanceof Element ? event.target.closest(CONTROL) : null;
      forbidden = el?.getBoundingClientRect() ?? null;
    }
    function onPageTap(event: PointerEvent) {
      if (host.contains(event.target as Node) || (event.target instanceof Element && event.target.closest(CONTROL))) return;
      pointer = { x: event.clientX, y: event.clientY }; pointerAt = performance.now(); forbidden = null;
    }
    function grab(event: PointerEvent) {
      if (event.button !== 0) return;
      event.preventDefault();
      dragging = { id: event.pointerId, start: { x: event.clientX, y: event.clientY }, origin: { ...position }, moved: false };
      button.setPointerCapture(event.pointerId); state("drag"); until = 0;
    }
    function release(event: PointerEvent) {
      if (!dragging || event.pointerId !== dragging.id) return;
      const moved = dragging.moved; dragging = null;
      if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
      if (!moved && event.type === "pointerup") play();
      else { state(reduced ? "idle" : "land"); until = performance.now() + 600; nextWander = until + 2000; }
      pointerAt = 0; target = { ...position };
    }
    const keyboardClick = (event: MouseEvent) => { if (event.detail === 0) play(); };
    const focus = () => { focused = true; target = { ...position }; state("idle"); };
    const blur = () => { focused = false; nextWander = performance.now() + 1800; };
    const approach = () => {
      if (dragging || until > performance.now()) return;
      target = { ...position }; pointerAt = 0; nextWander = performance.now() + 1800; state("idle");
    };
    const leave = () => { pointerAt = 0; forbidden = null; };
    const resize = () => {
      bounds.width = innerWidth; bounds.height = innerHeight; bounds.radius = host.offsetWidth / 2 + 5;
      position = clamp(position); target = clamp(target); paint();
    };
    const preference = () => { reduced = motion.matches; target = { ...position }; state("idle"); host.dataset.reduced = String(reduced); };

    function tick(now: number) {
      if (!running || document.hidden) return;
      const dt = Math.min((now - last) / 1000, .04); last = now; elapsed += dt;
      avoidControls(now);
      if (!dragging && !(until > now)) {
        if (until) { until = 0; state("idle"); }
        if (!reduced && !focused) {
          if (pointer && now - pointerAt < 2500 && now - targetAt > 150) {
            target = clamp({ x: pointer.x + (pointer.x > bounds.width * .6 ? -85 : 85), y: pointer.y + (pointer.y > bounds.height * .7 ? -65 : 65) });
            targetAt = now; nextWander = now + 2800;
          } else if (now > nextWander) {
            target = clamp({ x: bounds.radius + Math.random() * (bounds.width - 2 * bounds.radius), y: bounds.radius + Math.random() * (bounds.height - 2 * bounds.radius) });
            nextWander = now + 5500 + Math.random() * 3500;
          }
          const dx = target.x - position.x, dy = target.y - position.y, distance = Math.hypot(dx, dy);
          if (distance > 3) {
            const chasing = !!pointer && now - pointerAt < 2500;
            const speed = Math.min(chasing ? 310 : 115, distance * 3.2);
            position = clamp({ x: position.x + dx / distance * speed * dt, y: position.y + dy / distance * speed * dt });
            if (Math.abs(dx) > 4) host.style.setProperty("--cat-facing", dx < 0 ? "-1" : "1");
            state(chasing ? "chase" : "walk");
          } else if (now > nextRoll) play();
          else state(now - pointerAt > 30000 && Math.sin(elapsed / 10) > .5 ? "sleep" : "idle");
        } else {
          // Even a stationary pet must not cover an input after scrolling or resizing.
          if (!focused && Math.hypot(target.x - position.x, target.y - position.y) > 3) position = { ...target };
        }
      }
      if (pointer) {
        const x = Math.max(-3.5, Math.min(3.5, (pointer.x - position.x) / 90));
        const y = Math.max(-2.5, Math.min(2.5, (pointer.y - position.y) / 100));
        host.style.setProperty("--cat-look-x", `${x}px`); host.style.setProperty("--cat-look-y", `${y}px`);
      }
      paint(); frame = requestAnimationFrame(tick);
    }
    const visibility = () => { cancelAnimationFrame(frame); if (!document.hidden) { last = performance.now(); frame = requestAnimationFrame(tick); } };
    button.addEventListener("pointerdown", grab);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    button.addEventListener("pointerenter", approach);
    button.addEventListener("click", keyboardClick);
    button.addEventListener("focus", focus);
    button.addEventListener("blur", blur);
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPageTap, { passive: true });
    document.addEventListener("pointerleave", leave);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", resize);
    motion.addEventListener("change", preference);
    host.dataset.ready = "true"; host.dataset.reduced = String(reduced);
    paint(); frame = requestAnimationFrame(tick);
    return () => {
      running = false; cancelAnimationFrame(frame);
      button.removeEventListener("pointerdown", grab); button.removeEventListener("pointerup", release); button.removeEventListener("pointercancel", release);
      button.removeEventListener("lostpointercapture", release); button.removeEventListener("pointerenter", approach);
      button.removeEventListener("click", keyboardClick); button.removeEventListener("focus", focus); button.removeEventListener("blur", blur);
      window.removeEventListener("pointermove", onPointer); window.removeEventListener("pointerdown", onPageTap);
      document.removeEventListener("pointerleave", leave); document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", resize); motion.removeEventListener("change", preference);
    };
  }, []);

  return <div className="screen-cat" ref={hostRef} data-state="idle">
    <button ref={buttonRef} className="screen-cat-touch" type="button" aria-label="Chơi với mèo: nhấn để lăn, kéo để di chuyển" title="Bấm để lăn · Kéo để di chuyển">
      <svg viewBox="0 0 160 144" aria-hidden="true" className="screen-cat-art">
        <defs>
          <linearGradient id={`${id}-fur`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor="#d8dbe7"/><stop offset=".55" stopColor="#a8aebf"/><stop offset="1" stopColor="#838b9f"/></linearGradient>
          <linearGradient id={`${id}-cream`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#fffdf7"/><stop offset="1" stopColor="#e8e4da"/></linearGradient>
          <linearGradient id={`${id}-eye`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#84b9a0"/><stop offset="1" stopColor="#426e5a"/></linearGradient>
        </defs>
        <ellipse className="cat-shadow" cx="79" cy="130" rx="45" ry="7" fill="#263a30" opacity=".14"/>
        <g className="cat-roll"><g className="cat-facing"><g className="cat-breathe">
          <path className="cat-tail" d="M106 109C135 112 147 89 140 71C135 58 123 62 128 73C137 92 119 94 105 92Z" fill={`url(#${id}-fur)`} stroke="#7a8296" strokeWidth="1.2"/>
          <g className="cat-leg cat-leg-back"><ellipse cx="53" cy="115" rx="13" ry="13" fill="#959daf"/><ellipse cx="51" cy="123" rx="15" ry="7" fill={`url(#${id}-cream)`}/></g>
          <g className="cat-leg cat-leg-front"><ellipse cx="105" cy="115" rx="12" ry="13" fill="#959daf"/><ellipse cx="107" cy="123" rx="14" ry="7" fill={`url(#${id}-cream)`}/></g>
          <ellipse cx="79" cy="98" rx="35" ry="30" fill={`url(#${id}-fur)`}/>
          <ellipse cx="80" cy="102" rx="23" ry="24" fill={`url(#${id}-cream)`}/>
          <g className="cat-leg cat-leg-front"><path d="M57 98Q54 110 59 121" fill="none" stroke="#f4f0e6" strokeWidth="13" strokeLinecap="round"/><ellipse cx="61" cy="123" rx="12" ry="7" fill="#fffaf0"/><path d="M58 124v3m5-3v3" stroke="#c9c4bf" strokeWidth="1.2" strokeLinecap="round"/></g>
          <g className="cat-leg cat-leg-back"><path d="M97 99Q103 111 97 121" fill="none" stroke="#f4f0e6" strokeWidth="13" strokeLinecap="round"/><ellipse cx="96" cy="124" rx="12" ry="7" fill="#fffaf0"/><path d="M93 125v3m5-3v3" stroke="#c9c4bf" strokeWidth="1.2" strokeLinecap="round"/></g>
          <g className="cat-head">
            <path d="M43 48Q31 16 41 16Q55 17 64 35M94 35Q112 12 120 19Q126 29 115 52" fill={`url(#${id}-fur)`} stroke="#939aaa" strokeWidth="1.4"/>
            <path d="M44 39Q38 22 43 23Q52 26 56 37M104 38Q115 23 117 26L113 43" fill="#e2b2b3"/>
            <path d="M40 45Q48 29 77 29Q108 28 119 49Q131 75 112 89Q100 102 78 99Q46 99 35 79Q28 62 40 45Z" fill={`url(#${id}-fur)`} stroke="#9299aa" strokeWidth="1"/>
            <path d="M78 43C68 52 72 65 54 73Q36 83 56 94Q77 104 101 94Q120 85 105 76C87 67 87 52 78 43Z" fill={`url(#${id}-cream)`}/>
            <path d="M69 31l4 11m8-12v10m8-9-3 10" stroke="#7f889d" strokeWidth="3.5" strokeLinecap="round" opacity=".55"/>
            <path d="M39 58l9 3m-12 5 10 2m68-10-9 3m14 6-10 2" stroke="#7f889d" strokeWidth="2.5" strokeLinecap="round" opacity=".5"/>
            <g className="cat-eyes">
              <ellipse cx="59" cy="64" rx="10" ry="12" fill="#fdfcf8"/><ellipse cx="98" cy="64" rx="10" ry="12" fill="#fdfcf8"/>
              <g className="cat-pupils"><ellipse cx="61" cy="65" rx="7.5" ry="10" fill={`url(#${id}-eye)`}/><ellipse cx="96" cy="65" rx="7.5" ry="10" fill={`url(#${id}-eye)`}/><ellipse cx="62" cy="64" rx="3.8" ry="8" fill="#243b38"/><ellipse cx="95" cy="64" rx="3.8" ry="8" fill="#243b38"/><circle cx="59" cy="60" r="3" fill="white"/><circle cx="93" cy="60" r="3" fill="white"/><circle cx="65" cy="69" r="1.2" fill="white"/><circle cx="98" cy="69" r="1.2" fill="white"/></g>
            </g>
            <g className="cat-sleep-eyes" fill="none" stroke="#4c5668" strokeWidth="2.5" strokeLinecap="round"><path d="M51 66q9 7 17-1M89 65q9 8 17 0"/></g>
            <ellipse cx="49" cy="77" rx="9" ry="4" fill="#e1b7b4" opacity=".5"/><ellipse cx="108" cy="77" rx="9" ry="4" fill="#e1b7b4" opacity=".5"/>
            <ellipse cx="70" cy="80" rx="12" ry="9" fill="#fffcf4"/><ellipse cx="87" cy="80" rx="12" ry="9" fill="#fffcf4"/>
            <path d="M74 75Q79 72 84 75Q84 79 79 81Q74 79 74 75Z" fill="#c98d95"/>
            <path d="M79 81v3m0 0q-5 5-9 0m9 0q5 5 9 0" fill="none" stroke="#8c777b" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M57 81 32 77m25 8-26 2m67-6 26-4m-26 8 26 3" fill="none" stroke="#777e8c" strokeWidth="1.1" strokeLinecap="round" opacity=".7"/>
          </g>
          <g className="cat-beans" fill="#d7a2a8"><ellipse cx="61" cy="115" rx="6" ry="4"/><circle cx="56" cy="109" r="2"/><circle cx="61" cy="107" r="2"/><circle cx="66" cy="109" r="2"/><ellipse cx="97" cy="115" rx="6" ry="4"/><circle cx="92" cy="109" r="2"/><circle cx="97" cy="107" r="2"/><circle cx="102" cy="109" r="2"/></g>
        </g></g></g>
        <path className="cat-heart" d="M130 30C118 21 116 14 122 12Q128 10 130 16Q133 9 139 12C146 16 139 24 130 30Z" fill="#ca8792"/>
        <g className="cat-zzz" fill="#647b6a" fontFamily="system-ui" fontWeight="700"><text x="122" y="39" fontSize="13">z</text><text x="137" y="25" fontSize="17">z</text></g>
      </svg>
    </button>
  </div>;
}
