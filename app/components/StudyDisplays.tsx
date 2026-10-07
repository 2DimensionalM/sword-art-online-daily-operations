import { useId } from 'react';

type Point = readonly [number, number];
type Display = { name: string; corners: readonly [Point, Point, Point, Point]; cursor: Point; code: Point };

// Inner glass corners of the v8 plates, clockwise from top-left.
// Every screen effect uses this geometry; no independent legacy scene coordinates.
const displays: Display[] = [
  { name: 'left', corners: [[506, 344], [868, 423], [832, 623], [473, 534]], cursor: [.34, .37], code: [.28, .25] },
  { name: 'right', corners: [[914, 438], [1309, 536], [1258, 733], [872, 624]], cursor: [.27, .39], code: [.23, .27] },
];

function point(display: Display, u: number, v: number) {
  const [a, b, c, d] = display.corners;
  return [0, 1].map((axis) => (1 - v) * ((1 - u) * a[axis] + u * b[axis]) + v * ((1 - u) * d[axis] + u * c[axis])).join(',');
}

function mark(display: Display, u: number, v: number, width: number, height: number) {
  return `${point(display, u, v)} ${point(display, u + width, v)} ${point(display, u + width, v + height)} ${point(display, u, v + height)}`;
}

export function StudyDisplays() {
  const prefix = useId().replace(/:/g, '');
  return <>
    <defs>
      {displays.map((display) => <clipPath key={display.name} id={`${prefix}-${display.name}-screen`}><polygon points={display.corners.map((p) => p.join(',')).join(' ')} /></clipPath>)}
      <radialGradient id={`${prefix}-desk-glow`}><stop offset="0" stopColor="var(--color-paper)" stopOpacity=".8" /><stop offset="1" stopColor="var(--color-paper)" stopOpacity="0" /></radialGradient>
    </defs>
    {displays.map((display, index) => <g key={display.name} className="scene-display" data-display={display.name} clipPath={`url(#${prefix}-${display.name}-screen)`}>
      <polygon className="scene-screen-light" points={display.corners.map((p) => p.join(',')).join(' ')} />
      <polygon className="scene-code-cursor" points={mark(display, ...display.cursor, .004, .025)} style={{ animationDelay: `${index * -.4}s` }} />
      <g className="scene-code-updates" style={{ animationDelay: `${index * -2.7}s` }}>
        {[.09, .065, .12, .08].map((length, line) => <polygon key={line} points={mark(display, display.code[0] + (line % 2) * .015, display.code[1] + line * .018, length, .003)} />)}
      </g>
    </g>)}
    <g className="scene-desk-light" fill={`url(#${prefix}-desk-glow)`}>
      <ellipse cx="660" cy="635" rx="205" ry="36" transform="rotate(14 660 635)" />
      <ellipse cx="1090" cy="760" rx="205" ry="36" transform="rotate(14 1090 760)" />
    </g>
  </>;
}
