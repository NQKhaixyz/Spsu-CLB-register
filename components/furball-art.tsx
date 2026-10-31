import { useId } from "react";

/** Original vector artwork inspired by soft, hand-drawn virtual pets. */
export function FurballArt() {
  const id = useId().replace(/:/g, "");
  return <svg viewBox="0 0 180 172" className="screen-cat-art" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-fur`} cx=".38" cy=".27" r=".8"><stop stopColor="#fffefa"/><stop offset=".62" stopColor="#fff9ef"/><stop offset="1" stopColor="#d9e9e1"/></radialGradient>
      <radialGradient id={`${id}-blush`}><stop stopColor="#efb8a4" stopOpacity=".8"/><stop offset="1" stopColor="#f8ceb8" stopOpacity="0"/></radialGradient>
      <linearGradient id={`${id}-ear`} x2=".5" y2="1"><stop stopColor="#397b75"/><stop offset="1" stopColor="#75a39a"/></linearGradient>
      <filter id={`${id}-paper`} x="-6%" y="-6%" width="112%" height="112%"><feTurbulence type="fractalNoise" baseFrequency=".62" numOctaves="2" seed="8" result="grain"/><feComposite in="grain" in2="SourceAlpha" operator="in" result="texture"/><feBlend in="SourceGraphic" in2="texture" mode="soft-light"/></filter>
    </defs>
    <ellipse className="cat-shadow" cx="90" cy="149" rx="48" ry="7" fill="#275f55" opacity=".14"/>
    <g className="cat-roll"><g className="cat-breathe"><g className="cat-squish">
      <path className="cat-tail" d="M132 127Q162 136 157 112Q155 105 150 110Q149 122 135 115" fill={`url(#${id}-fur)`} stroke="#81a49a" strokeWidth="2" strokeLinecap="round"/>
      <g className="cat-feet" fill="#f6eee1" stroke="#a7beb1" strokeWidth="1.4"><ellipse className="cat-foot-left" cx="61" cy="141" rx="14" ry="8"/><ellipse className="cat-foot-right" cx="118" cy="141" rx="14" ry="8"/></g>
      <path className="cat-body" d="M40 66Q33 47 35 26L59 43Q75 35 89 37L96 32 99 38Q110 37 123 44L147 28Q149 49 140 68L146 76 143 81Q154 98 150 116L153 119 148 123Q144 145 116 147L111 150 106 148Q89 153 71 148L65 150 61 146Q32 143 29 121L25 117 29 113Q25 92 38 77L34 72Z" fill={`url(#${id}-fur)`} stroke="#88aba0" strokeWidth="1.7" strokeLinejoin="round"/>
      <path d="M37 30 56 45 44 54Q39 44 37 30M143 33 126 46 137 55Q142 45 143 33" fill={`url(#${id}-ear)`}/>
      <path d="M44 45 51 47 46 51M135 45 130 47 134 51" fill="#c5d4c6"/>
      <path d="M42 79Q34 90 35 108M53 54q14-9 26-9" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" opacity=".8"/>
      <path d="M37 116Q52 143 88 143Q127 146 145 120" fill="none" stroke="#c7ded3" strokeWidth="2.5" strokeLinecap="round" opacity=".7"/>
      <path d="M42 66Q35 48 36 29L59 44Q75 36 90 38L97 34 99 39Q112 38 123 46L146 30Q148 49 139 68Q156 96 148 122Q142 148 91 149Q39 149 30 121Q23 96 42 66Z" fill="#faf4e7" opacity=".12" filter={`url(#${id}-paper)`}/>
      <ellipse cx="49" cy="100" rx="19" ry="15" fill={`url(#${id}-blush)`}/><ellipse cx="130" cy="100" rx="19" ry="15" fill={`url(#${id}-blush)`}/>
      <g className="cat-face"><g className="cat-eyes"><g className="cat-pupils" fill="#316f69"><ellipse cx="65" cy="84" rx="4.5" ry="5.4"/><ellipse cx="114" cy="84" rx="4.5" ry="5.4"/><g fill="#fffdf6"><circle cx="64" cy="82" r="1.2"/><circle cx="113" cy="82" r="1.2"/></g></g></g>
        <g className="cat-sleep-eyes" fill="none" stroke="#39756c" strokeWidth="2.4" strokeLinecap="round"><path d="M60 86q5-6 10 0M109 86q5-6 10 0"/></g>
        <path d="M86 96q4-3 8 0l-4 4Z" fill="#497b71"/>
        <path className="cat-mouth" d="M90 100v3m0 0q-4 5-7 1m7-1q4 5 7 1" stroke="#497b71" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
        <ellipse className="cat-chew-mouth" cx="90" cy="105" rx="4" ry="5" fill="#9c7470"/>
      </g>
      <g className="cat-paw-marks" fill="#dcae9f"><ellipse cx="65" cy="125" rx="6" ry="5"/><circle cx="58" cy="119" r="2"/><circle cx="64" cy="116" r="2"/><circle cx="70" cy="118" r="2"/><ellipse cx="117" cy="125" rx="6" ry="5"/><circle cx="110" cy="119" r="2"/><circle cx="116" cy="116" r="2"/><circle cx="122" cy="118" r="2"/></g>
      <g className="cat-wet-lines" fill="none" stroke="#81ada5" strokeWidth="1.5" strokeLinecap="round"><path d="m49 111-4 9m84-9 5 9m-54 12-2 8m19-8 2 8"/><path d="M48 60q-5 9 0 11q5-2 0-11M137 87q-5 9 0 11q5-2 0-11" fill="#b7dcd6"/></g>
    </g></g></g>
    <g className="cat-food"><ellipse cx="138" cy="148" rx="23" ry="5" fill="#d0d9c7"/><path d="m122 130 3-15q13-8 25 0l5 15q-13 9-33 0" fill="#efc68c" stroke="#ce9765" strokeWidth="1.4"/><path d="M125 115q13-8 25 0l-1 5q-12-5-24 1Z" fill="#b7815c"/><path d="m114 136 5 11q19 9 38 0l5-11Z" fill="#e6aca0" stroke="#b98177" strokeWidth="1.5"/><path d="m132 125-5-4m18 3 4-5" stroke="#e9ba79" strokeWidth="3" className="cat-crumbs" strokeLinecap="round"/></g>
    <g className="cat-dryer"><path d="M12 97h22v18H12q-9-9 0-18" fill="#dfb3a2" stroke="#a98075" strokeWidth="1.6"/><path d="m17 115 3 15h9l-3-15" fill="#c59385"/><path d="M34 100h8v12h-8" fill="#657e76"/><path className="cat-wind" d="M48 100q9-6 17 0m-17 7h24m-24 7q8 6 19 0" fill="none" stroke="#a0c5b6" strokeWidth="2" strokeLinecap="round"/></g>
    <g className="cat-rain"><path d="M57 20q-7-12 5-18q11-5 17 5q15-10 25 2q17-4 19 11Z" fill="#b4cfcb"/><g className="cat-raindrops" stroke="#8dbab4" strokeWidth="2" strokeLinecap="round"><path d="m60 29-4 10m27-11-4 10m26-10-4 10m22-7-4 10m-52 9-4 10m27-11-4 10m27-10-4 10"/></g></g>
    <g className="cat-hearts" fill="#d99294"><path d="M145 49c-19-11-9-24 0-14c9-10 19 3 0 14Z"/><path d="M31 68c-13-8-6-17 0-10c6-7 13 2 0 10Z"/></g>
    <g className="cat-sparkles" fill="#c6ac66"><path d="m34 49 3-8 3 8 8 3-8 3-3 8-3-8-8-3Z"/><path d="m149 71 2-6 2 6 6 2-6 2-2 6-2-6-6-2Z"/></g>
    <g className="cat-zzz" fill="#77958a" fontFamily="Georgia,serif" fontStyle="italic"><text x="133" y="47" fontSize="18">z</text><text x="151" y="30" fontSize="23">z</text></g>
  </svg>;
}
