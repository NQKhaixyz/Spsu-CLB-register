"use client";
import { useCallback } from "react";
import { SylvaHero } from "@designcodeio/threeui";

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
