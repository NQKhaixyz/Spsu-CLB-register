type Point = { x: number; y: number };
type Mood = "idle" | "walk" | "chase" | "roll" | "drag" | "land" | "sleep" | "pet" | "squish" | "feed" | "dry" | "rain" | "toss";
export type PetAction = "pet" | "feed" | "ball" | "roll" | "rain" | "dry" | "sleep" | "hello";
export type PetController = {
  act: (action: PetAction) => void;
  setMenu: (panel: HTMLElement | null) => void;
  setMuted: (value: boolean) => void;
  setHidden: (value: boolean) => void;
  destroy: () => void;
};
const CONTROL = 'input,textarea,select,button,a,[role="button"],[contenteditable="true"]';
const isPet = (el: EventTarget | null) => el instanceof Element && !!el.closest("[data-pet-ui]");

/** Viewport physics and gestures are imperative; React only renders the care panel. */
export function createScreenPet(host: HTMLElement, button: HTMLButtonElement, ballEl: HTMLElement,
  feedback: { notice: (message: string) => void; sleeping: (value: boolean) => void }): PetController {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const bounds = { width: innerWidth, height: innerHeight, radius: host.offsetWidth / 2 + 8 };
  const clamp = (p: Point, margin = bounds.radius): Point => ({
    x: Math.max(margin, Math.min(bounds.width - margin, p.x)),
    y: Math.max(margin, Math.min(bounds.height - margin, p.y)),
  });
  let position = clamp({ x: innerWidth * .26, y: innerHeight * .73 }), target = { ...position };
  let pointer: Point | null = null, pointerAt = 0, last = performance.now(), lastInteraction = last;
  let mood: Mood = "idle", until = 0, nextWander = last + 3000, frame = 0, lastAvoid = 0;
  let panel: HTMLElement | null = null, forbidden: DOMRect | null = null, under: Element | null = null;
  let hidden = false, reduced = motion.matches, running = true, muted = true, sleeping = false, wet = false;
  let squash = 0, squashVelocity = 0, stroke = 0, lastStroke = 0, hoverUntil = 0;
  let throwVelocity: Point = { x: 0, y: 0 }, audio: AudioContext | null = null;
  let ball: { p: Point; v: Point; ends: number; catches: number; lastCatch: number } | null = null;
  let dragging: { id: number; start: Point; origin: Point; moved: boolean; at: number; last: Point; lastAt: number; v: Point } | null = null;

  function state(value: Mood) {
    if (mood !== value) { mood = value; host.dataset.state = value; }
  }
  function wake() { sleeping = false; feedback.sleeping(false); lastInteraction = performance.now(); }
  function stopBall() { ball = null; ballEl.hidden = true; }
  function chirp() {
    if (muted || document.hidden) return;
    try {
      audio ??= new AudioContext();
      void audio.resume().catch(() => {});
      const oscillator = audio.createOscillator(), gain = audio.createGain(), time = audio.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(640, time);
      oscillator.frequency.exponentialRampToValueAtTime(880, time + .07);
      oscillator.frequency.exponentialRampToValueAtTime(420, time + .27);
      gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(.055, time + .025);
      gain.gain.exponentialRampToValueAtTime(.001, time + .3);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(time); oscillator.stop(time + .31);
    } catch { /* Sound is an optional enhancement. */ }
  }
  function act(action: PetAction) {
    const now = performance.now(); lastInteraction = now; target = { ...position }; pointerAt = 0;
    if (action === "hello") { chirp(); return; }
    if (action === "sleep") {
      stopBall(); sleeping = !sleeping; feedback.sleeping(sleeping); until = 0;
      state(sleeping ? "sleep" : "idle"); nextWander = now + 3000;
      feedback.notice(sleeping ? "Bông cuộn mình ngủ rồi. Chạm nhẹ để đánh thức." : "Dậy rồi! Chơi cùng Bông nhé."); return;
    }
    wake(); stopBall(); chirp();
    if (action === "ball") {
      ball = { p: clamp({ x: position.x + 140, y: position.y - 90 }, 22), v: { x: 220, y: -145 }, ends: now + 18000, catches: 0, lastCatch: 0 };
      ballEl.hidden = false; until = 0; state("chase");
      feedback.notice("Bắt bóng nào! Chạm vào chỗ trống để ném bóng tới đó.");
    } else {
      const durations = { pet: 1600, feed: 3000, roll: 1450, rain: 3200, dry: 3000 };
      state(action === "roll" && reduced ? "pet" : action); until = now + durations[action];
      if (action === "rain") { wet = true; host.dataset.wet = "true"; }
      const messages = { pet: "Bông thích lắm, thêm chút nữa đi!", feed: "Măm măm… một miếng bánh mềm cho Bông.", roll: "Lăn một vòng, khoe chiếc bụng tròn.", rain: "Lông ướt rồi. Sấy ấm cho Bông nhé.", dry: wet ? "Sấy khô bộ lông ướt cho Bông…" : "Sấy nhẹ, lông phồng lên như mây…" };
      feedback.notice(messages[action]);
    }
    nextWander = now + 6000;
  }
  function paint() {
    host.style.transform = `translate3d(${position.x - host.offsetWidth / 2}px,${position.y - host.offsetHeight / 2}px,0)`;
    if (panel) {
      let x = Math.max(12, Math.min(bounds.width - panel.offsetWidth - 12, position.x - panel.offsetWidth / 2));
      const above = position.y - host.offsetHeight / 2 - panel.offsetHeight - 12;
      const below = position.y + host.offsetHeight / 2 + 12;
      let y = above > 12 ? above : Math.min(bounds.height - panel.offsetHeight - 12, below);
      // Use the space beside the pet when neither vertical placement fits.
      if (above < 12 && below + panel.offsetHeight > bounds.height - 12) {
        const left = position.x - bounds.radius - panel.offsetWidth - 12;
        const right = position.x + bounds.radius + 12;
        if (left >= 12 || right + panel.offsetWidth <= bounds.width - 12) {
          x = left >= 12 ? left : right;
          y = Math.max(12, Math.min(bounds.height - panel.offsetHeight - 12, position.y - panel.offsetHeight / 2));
        }
      }
      panel.style.left = `${x}px`; panel.style.top = `${Math.max(12, y)}px`;
    }
    if (ball) ballEl.style.transform = `translate3d(${ball.p.x - 15}px,${ball.p.y - 15}px,0) rotate(${ball.p.x * 2}deg)`;
  }
  function outside(rect: DOMRect, p: Point): Point {
    const gap = bounds.radius + 12;
    if (p.x < rect.left - gap || p.x > rect.right + gap || p.y < rect.top - gap || p.y > rect.bottom + gap) return p;
    const exits = [{ x: rect.left - gap, y: p.y }, { x: rect.right + gap, y: p.y }, { x: p.x, y: rect.top - gap }, { x: p.x, y: rect.bottom + gap }]
      .filter(q => q.x >= bounds.radius && q.x <= bounds.width - bounds.radius && q.y >= bounds.radius && q.y <= bounds.height - bounds.radius);
    return exits.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0] ?? clamp({ x: bounds.radius, y: bounds.radius });
  }
  function avoidControls(now: number) {
    if (dragging) return;
    if (now - lastAvoid > 100) {
      lastAvoid = now;
      under = [[0, 0], [-42, -26], [42, -26], [-42, 34], [42, 34]].map(([x, y]) =>
        document.elementsFromPoint(position.x + x, position.y + y).find(el => !isPet(el) && el.closest(CONTROL))?.closest(CONTROL)).find(Boolean) ?? null;
      button.style.pointerEvents = under ? "none" : "auto";
    }
    if (under && !panel) { target = outside((under.closest("form") ?? under).getBoundingClientRect(), position); pointerAt = 0; }
    const active = document.activeElement;
    if (active instanceof HTMLElement && !isPet(active) && active.matches(CONTROL)) target = outside(active.getBoundingClientRect(), target);
    if (forbidden) target = outside(forbidden, target);
    target = clamp(target);
  }
  function grab(event: PointerEvent) {
    if (event.button !== 0 || panel) return;
    event.preventDefault(); wake(); stopBall();
    const now = performance.now(), point = { x: event.clientX, y: event.clientY };
    dragging = { id: event.pointerId, start: point, origin: { ...position }, moved: false, at: now, last: point, lastAt: now, v: { x: 0, y: 0 } };
    button.setPointerCapture(event.pointerId); state("squish"); until = 0; target = { ...position };
  }
  function release(event: PointerEvent) {
    if (!dragging || event.pointerId !== dragging.id) return;
    const drag = dragging, now = performance.now(); dragging = null;
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
    if (event.type !== "pointerup") { state("land"); until = now + 600; }
    else if (!drag.moved) { act("pet"); }
    else if (!reduced && now - drag.lastAt < 120 && Math.hypot(drag.v.x, drag.v.y) > 200) {
      const scale = Math.min(1, 950 / Math.hypot(drag.v.x, drag.v.y));
      throwVelocity = { x: drag.v.x * scale, y: drag.v.y * scale }; state("toss"); until = now + 1400;
      feedback.notice("Vèo! Bông nảy một cái rồi đáp xuống.");
    } else { state("land"); until = now + 650; }
    target = { ...position }; pointerAt = 0; nextWander = now + 3000;
  }
  function onPointer(event: PointerEvent) {
    const now = performance.now();
    if (dragging) {
      if (event.pointerId !== dragging.id) return;
      const dt = Math.max(.008, (now - dragging.lastAt) / 1000);
      dragging.v = { x: (event.clientX - dragging.last.x) / dt, y: (event.clientY - dragging.last.y) / dt };
      dragging.last = { x: event.clientX, y: event.clientY }; dragging.lastAt = now;
      dragging.moved ||= Math.hypot(event.clientX - dragging.start.x, event.clientY - dragging.start.y) > 8;
      if (dragging.moved) {
        position = clamp({ x: dragging.origin.x + event.clientX - dragging.start.x, y: dragging.origin.y + event.clientY - dragging.start.y });
        target = { ...position }; state("drag"); paint();
      }
      return;
    }
    if (panel || event.pointerType === "touch") return;
    if (button.contains(event.target as Node)) {
      // Moving back and forth over the fur pets it; pressing and moving picks it up.
      if (now - lastStroke > 400) stroke = 0;
      stroke += Math.abs(event.movementX) + Math.abs(event.movementY); lastStroke = now;
      if (stroke > 45 && (mood === "idle" || mood === "walk" || mood === "chase")) { act("pet"); stroke = 0; }
      return;
    }
    pointer = { x: event.clientX, y: event.clientY }; pointerAt = now;
    const el = event.target instanceof Element ? event.target.closest(CONTROL) : null;
    forbidden = el?.getBoundingClientRect() ?? null;
  }
  function pageTap(event: PointerEvent) {
    if (isPet(event.target) || (event.target instanceof Element && event.target.closest(CONTROL))) return;
    pointer = { x: event.clientX, y: event.clientY }; pointerAt = performance.now(); forbidden = null;
    if (ball) { ball.p = clamp(pointer, 22); ball.v = { x: Math.random() > .5 ? 190 : -190, y: -120 }; ball.lastCatch = pointerAt; }
  }
  const keyboard = (event: MouseEvent) => { if (event.detail === 0) act("pet"); };
  const approach = () => { if (!dragging && until < performance.now()) { target = { ...position }; pointerAt = 0; hoverUntil = performance.now() + 1600; } };
  const leave = () => { pointerAt = 0; forbidden = null; };
  const resize = () => {
    bounds.width = innerWidth; bounds.height = innerHeight;
    if (!hidden) bounds.radius = host.offsetWidth / 2 + 8;
    position = clamp(position); target = clamp(target); if (ball) ball.p = clamp(ball.p, 22); paint();
  };
  const preference = () => { reduced = motion.matches; target = { ...position }; stopBall(); until = 0; state(sleeping ? "sleep" : "idle"); host.dataset.reduced = String(reduced); };

  function tick(now: number) {
    if (!running || hidden || document.hidden) return;
    const dt = Math.min((now - last) / 1000, .04); last = now;
    const held = dragging && !dragging.moved ? Math.min(1, (now - dragging.at) / 1100) : mood === "pet" ? .28 : 0;
    squashVelocity += ((held - squash) * 110 - squashVelocity * 11) * dt;
    squash += squashVelocity * dt;
    const softness = reduced ? 0 : squash;
    host.style.setProperty("--pet-squish-x", String(1 + softness * .24));
    host.style.setProperty("--pet-squish-y", String(1 - softness * .43));
    if (mood === "toss" && until > now) {
      const next = { x: position.x + throwVelocity.x * dt, y: position.y + throwVelocity.y * dt };
      const safe = clamp(next);
      if (safe.x !== next.x) throwVelocity.x *= -.65;
      if (safe.y !== next.y) throwVelocity.y *= -.65;
      throwVelocity.x *= Math.exp(-2.3 * dt); throwVelocity.y *= Math.exp(-2.3 * dt);
      position = safe; target = { ...safe };
    }
    if (until && now >= until) {
      if (mood === "dry") { wet = false; host.dataset.wet = "false"; feedback.notice("Khô rồi! Bông lại mềm và thơm như mới."); }
      if (mood === "feed") feedback.notice("No bụng rồi. Bông dụi đầu cảm ơn bạn.");
      until = 0; state(sleeping ? "sleep" : "idle");
    }
    if (ball && !panel) {
      if (now > ball.ends) { stopBall(); state("pet"); until = now + 1300; feedback.notice("Bắt được rồi! Nghỉ lấy sức một chút nào."); }
      else {
        if (!reduced) {
          const next = { x: ball.p.x + ball.v.x * dt, y: ball.p.y + ball.v.y * dt }, safe = clamp(next, 22);
          if (safe.x !== next.x) ball.v.x *= -1;
          if (safe.y !== next.y) ball.v.y *= -1;
          ball.p = safe;
        }
        target = clamp(ball.p);
        if (Math.hypot(position.x - ball.p.x, position.y - ball.p.y) < 60 && now - ball.lastCatch > 1100) {
          ball.lastCatch = now; ball.catches++;
          ball.v = { x: (Math.random() > .5 ? 1 : -1) * 230, y: (Math.random() - .5) * 320 };
          host.dataset.catches = String(ball.catches);
        }
      }
    }
    const focused = isPet(document.activeElement) && document.activeElement?.matches(":focus-visible");
    if (!dragging && !panel && !until && !sleeping) {
      if (!ball && !focused && now > hoverUntil && !reduced) {
        if (pointer && now - pointerAt < 2200) {
          target = clamp({ x: pointer.x + (pointer.x > bounds.width * .6 ? -100 : 100), y: pointer.y + (pointer.y > bounds.height * .7 ? -75 : 75) });
          nextWander = now + 3200;
        } else if (now > nextWander && now - lastInteraction < 45000) {
          target = clamp({ x: Math.random() * bounds.width, y: Math.random() * bounds.height });
          nextWander = now + 6500;
        }
      }
      avoidControls(now);
      const dx = target.x - position.x, dy = target.y - position.y, distance = Math.hypot(dx, dy);
      if (!reduced && distance > 3 && (!focused || ball || under)) {
        const chasing = !!ball || now - pointerAt < 2200, speed = Math.min(chasing ? 315 : 110, distance * 3.4);
        position = clamp({ x: position.x + dx / distance * speed * dt, y: position.y + dy / distance * speed * dt });
        host.style.setProperty("--pet-lean", `${Math.max(-7, Math.min(7, dx / 25))}deg`); state(chasing ? "chase" : "walk");
      } else if (reduced && under) { position = { ...target }; }
      else state(!ball && now - lastInteraction > 45000 && now - pointerAt > 10000 ? "sleep" : "idle");
    } else avoidControls(now);
    if (pointer) {
      host.style.setProperty("--cat-look-x", `${Math.max(-3, Math.min(3, (pointer.x - position.x) / 90))}px`);
      host.style.setProperty("--cat-look-y", `${Math.max(-2, Math.min(2, (pointer.y - position.y) / 100))}px`);
    }
    paint(); frame = requestAnimationFrame(tick);
  }
  const visibility = () => { cancelAnimationFrame(frame); if (!document.hidden && !hidden) { last = performance.now(); frame = requestAnimationFrame(tick); } };
  button.addEventListener("pointerdown", grab); button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release); button.addEventListener("lostpointercapture", release);
  button.addEventListener("pointerenter", approach); button.addEventListener("click", keyboard);
  window.addEventListener("pointermove", onPointer, { passive: true }); window.addEventListener("pointerdown", pageTap, { passive: true });
  document.addEventListener("pointerleave", leave); document.addEventListener("visibilitychange", visibility);
  window.addEventListener("resize", resize); motion.addEventListener("change", preference);
  host.dataset.ready = "true"; host.dataset.reduced = String(reduced); paint(); frame = requestAnimationFrame(tick);
  return {
    act,
    setMenu(value) {
      panel = value;
      if (panel && bounds.width < 600) {
        const half = host.offsetHeight / 2;
        if (position.y - half - panel.offsetHeight < 24 && position.y + half + panel.offsetHeight > bounds.height - 24) {
          // Keep the pet visible above its care panel on narrow screens.
          position.y = Math.max(bounds.radius, bounds.height - panel.offsetHeight - half - 24);
        }
      }
      target = { ...position }; pointerAt = 0; paint();
    },
    setMuted(value) { muted = value; },
    setHidden(value) { hidden = value; if (hidden) { stopBall(); dragging = null; } else resize(); visibility(); },
    destroy() {
      running = false; cancelAnimationFrame(frame); stopBall(); void audio?.close().catch(() => {});
      button.removeEventListener("pointerdown", grab); button.removeEventListener("pointerup", release);
      button.removeEventListener("pointercancel", release); button.removeEventListener("lostpointercapture", release);
      button.removeEventListener("pointerenter", approach); button.removeEventListener("click", keyboard);
      window.removeEventListener("pointermove", onPointer); window.removeEventListener("pointerdown", pageTap);
      document.removeEventListener("pointerleave", leave); document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", resize); motion.removeEventListener("change", preference);
    },
  };
}
