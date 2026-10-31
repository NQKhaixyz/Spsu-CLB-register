"use client";
import { useCallback } from "react";
import { SylvaHero } from "@designcodeio/threeui";
import { ArrowUpRight } from "lucide-react";

export function GardenBackdrop() {
  const prepareFrame = useCallback((frame: HTMLIFrameElement) => {
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
  }, []);
  return <div className="garden-backdrop" aria-hidden="true" inert>
    <div className="garden-scene shader-frame">
      <SylvaHero variant="living-green" headingFont="lexend" bodyFont="lexend" headingWeight="300" bodyWeight="300"
        primaryColor="#ffffff" headingSize={63} bodySize={16.5} headingLetterSpacing={-0.006} applyScene={prepareFrame} />
    </div>
  </div>;
}

export function GardenHero({ name, onAction, actionLabel = "Xem lịch trực" }: { name: string; onAction: () => void; actionLabel?: string }) {
  return <section className="club-welcome" aria-label="Tổng quan hoạt động">
    <div><span className="eyebrow">NHỊP CLB</span><h2>Chào {name}.</h2><p>Theo dõi lịch họp và ca trực của bạn.</p></div>
    <button type="button" className="btn primary" onClick={onAction}>{actionLabel}<ArrowUpRight size={18} /></button>
  </section>;
}
