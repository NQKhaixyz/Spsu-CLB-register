"use client";
// Living Green entry extracted from the verified LandingPages.tsx. The full
// registered file is retained under upstream; unrelated variants are not bundled.
import { splitTypographyProps, usePageTypography, type PageTypographyProps } from "./landing-pages/pageTypography";
import { LandingPageFrame, type LandingPageProps } from "./landing-pages/LandingPageFrame";
import { SYLVA_TYPOGRAPHY } from "./landing-pages/pageRecipes";

export type SylvaHeroProps = LandingPageProps & PageTypographyProps & { variant?: "living-green" };
export function SylvaHero({ variant = "living-green", ...props }: SylvaHeroProps) {
  const [type, frame] = splitTypographyProps(props);
  const customization = usePageTypography(SYLVA_TYPOGRAPHY, type);
  return <LandingPageFrame {...frame} key={variant} customization={customization}
    title="Sylva — Into the living world" sourceUrl="/landing-pages/inner-green-3d.html" />;
}
