import { useId } from "react";
import { useComputedColorScheme } from "@mantine/core";
import {
  WALLS, WALL_LABELS, toLayout,
  type RoomLayout, type RoomOpening, type RoomSpec, type RoomWindow, type Wall,
} from "../utils/room";

/**
 * Isometric cut-away of a store room, drawn as plain SVG in stud units.
 *
 * The camera is fixed above the front-right corner, so the two far walls show
 * their inside face (solid) and the two near walls are drawn as a cut-away
 * outline. The layout is rotated in quarter turns before drawing so the
 * entrance always lands on a far wall and stays readable; wall labels keep
 * showing the real wall names.
 */

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

interface Pt {
  x: number;
  y: number;
}

/** x runs right-and-down the screen, z left-and-down, y straight up. */
function project(x: number, y: number, z: number): Pt {
  return { x: (x - z) * COS30, y: (x + z) * SIN30 - y };
}

const r = (n: number) => Math.round(n * 1000) / 1000;
const points = (pts: Pt[]) => pts.map((p) => `${r(p.x)},${r(p.y)}`).join(" ");

/** Round a stud value for display: 40, 12.5 — never 12.500000000000002. */
export const studs = (n: number) => `${Math.round(n * 10) / 10}`;

// --- Orientation -----------------------------------------------------------

/**
 * Turn the room in 90° steps until the entrance wall is the back wall. Because
 * wall names run clockwise and every offset is measured from its own wall's
 * first corner, a turn only relabels walls and (on odd turns) swaps the
 * footprint — no offset has to be recomputed.
 */
function orient(room: RoomLayout): { view: RoomLayout; nameOf: Record<Wall, Wall> } {
  const turns = WALLS.indexOf(room.entrance.wall);
  const swap = turns % 2 === 1;
  const toView = (w: Wall): Wall => WALLS[(WALLS.indexOf(w) - turns + WALLS.length) % WALLS.length];

  const nameOf = {} as Record<Wall, Wall>;
  for (const wall of WALLS) nameOf[toView(wall)] = wall;

  return {
    view: {
      ...room,
      width: swap ? room.depth : room.width,
      depth: swap ? room.width : room.depth,
      entrance: { ...room.entrance, wall: toView(room.entrance.wall) },
      windows: room.windows.map((w) => ({ ...w, wall: toView(w.wall) })),
    },
    nameOf,
  };
}

// --- Wall geometry ---------------------------------------------------------

interface WallGeom {
  ax: number;
  az: number;
  dx: number; // unit direction from the wall's first corner toward its last
  dz: number;
  nx: number; // outward normal
  nz: number;
  len: number;
  far: boolean; // far walls face the camera and stay solid
}

function wallGeom(wall: Wall, width: number, depth: number): WallGeom {
  switch (wall) {
    case "back":
      return { ax: 0, az: 0, dx: 1, dz: 0, nx: 0, nz: -1, len: width, far: true };
    case "right":
      return { ax: width, az: 0, dx: 0, dz: 1, nx: 1, nz: 0, len: depth, far: false };
    case "front":
      return { ax: width, az: depth, dx: -1, dz: 0, nx: 0, nz: 1, len: width, far: false };
    case "left":
      return { ax: 0, az: depth, dx: 0, dz: -1, nx: -1, nz: 0, len: depth, far: true };
  }
}

/** A point `t` studs along the wall, `y` studs up, `out` studs outward from the room. */
function wallPoint(g: WallGeom, t: number, y: number, out = 0): Pt {
  return project(g.ax + g.dx * t + g.nx * out, y, g.az + g.dz * t + g.nz * out);
}

const faceQuad = (g: WallGeom, height: number, out: number): Pt[] => [
  wallPoint(g, 0, 0, out),
  wallPoint(g, g.len, 0, out),
  wallPoint(g, g.len, height, out),
  wallPoint(g, 0, height, out),
];

const topQuad = (g: WallGeom, height: number, thickness: number): Pt[] => [
  wallPoint(g, 0, height, 0),
  wallPoint(g, g.len, height, 0),
  wallPoint(g, g.len, height, thickness),
  wallPoint(g, 0, height, thickness),
];

const openingQuad = (g: WallGeom, o: RoomWindow, out: number): Pt[] => [
  wallPoint(g, o.offset, o.sill, out),
  wallPoint(g, o.offset + o.width, o.sill, out),
  wallPoint(g, o.offset + o.width, o.sill + o.height, out),
  wallPoint(g, o.offset, o.sill + o.height, out),
];

// --- Palette ---------------------------------------------------------------

interface Palette {
  floor: string;
  floorEdge: string;
  wallBack: string;
  wallLeft: string;
  wallTop: string;
  cutaway: string;
  recess: string;
  grid: string;
  line: string;
  frame: string;
  text: string;
  faint: string;
  accent: string;
}

const PALETTES: Record<"light" | "dark", Palette> = {
  light: {
    floor: "#f3f1f7",
    floorEdge: "#cec7dc",
    wallBack: "#dad4e6",
    wallLeft: "#c0b8d3",
    wallTop: "#fbfafd",
    cutaway: "#8d84a3",
    recess: "#b6aecb",
    grid: "#d9d3e6",
    line: "#7c7490",
    frame: "#3a3448",
    text: "#272233",
    faint: "#665e7a",
    accent: "#8832c8",
  },
  dark: {
    floor: "#312c3d",
    floorEdge: "#221e2c",
    wallBack: "#3e3850",
    wallLeft: "#2f2a3d",
    wallTop: "#4c445f",
    cutaway: "#7d749a",
    recess: "#191622",
    grid: "#453e57",
    line: "#8e86a6",
    frame: "#d2cae0",
    text: "#efeaf7",
    faint: "#aaa2bd",
    accent: "#c186ec",
  },
};

// --- Dimension lines -------------------------------------------------------

/** Text rotated to sit along a projected edge, always kept upright. */
function edgeAngle(from: Pt, to: Pt): number {
  let deg = (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  return deg;
}

interface DimensionProps {
  from: Pt;
  to: Pt;
  label: string;
  away: Pt; // the diagram centre — ticks and text are pushed away from it
  fs: number;
  palette: Palette;
}

/** A drafting-style dimension line: a rule with end ticks and a label beside it. */
function Dimension({ from, to, label, away, fs, palette }: DimensionProps) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  let px = -dy / len;
  let py = dx / len;
  if ((mid.x - away.x) * px + (mid.y - away.y) * py < 0) {
    px = -px;
    py = -py;
  }
  const tick = fs * 0.4;
  const gap = fs * 0.78;
  const at = { x: mid.x + px * gap, y: mid.y + py * gap };

  return (
    <g stroke={palette.line} strokeWidth={fs * 0.05} strokeLinecap="round" fill="none">
      <line x1={r(from.x)} y1={r(from.y)} x2={r(to.x)} y2={r(to.y)} />
      <line
        x1={r(from.x - px * tick)} y1={r(from.y - py * tick)}
        x2={r(from.x + px * tick)} y2={r(from.y + py * tick)}
      />
      <line
        x1={r(to.x - px * tick)} y1={r(to.y - py * tick)}
        x2={r(to.x + px * tick)} y2={r(to.y + py * tick)}
      />
      <text
        x={r(at.x)}
        y={r(at.y)}
        fill={palette.text}
        stroke="none"
        fontSize={r(fs)}
        fontWeight={700}
        textAnchor="middle"
        dominantBaseline="central"
        transform={`rotate(${r(edgeAngle(from, to))} ${r(at.x)} ${r(at.y)})`}
      >
        {label}
      </text>
    </g>
  );
}

// --- Diagram ---------------------------------------------------------------

export function describeRoom(room: RoomSpec): string {
  const layout = toLayout(room);
  const count = room.windows.length;
  return `${studs(room.width)} × ${studs(room.depth)} × ${studs(layout.height)} studs, ${studs(
    layout.entrance.width,
  )} × ${studs(layout.entrance.height)} doorway on the front wall, ${
    count === 0 ? "no windows" : `${count} window${count === 1 ? "" : "s"}`
  }`;
}

export interface RoomDiagramProps {
  room: RoomSpec;
  /** Rendered height in pixels; the drawing scales to fit. */
  height?: number;
}

export function RoomDiagram({ room, height = 320 }: RoomDiagramProps) {
  const scheme = useComputedColorScheme("light");
  const palette = PALETTES[scheme];
  const uid = useId().replace(/:/g, "");
  const { view, nameOf } = orient(toLayout(room));

  const W = Math.max(1, view.width);
  const D = Math.max(1, view.depth);
  const H = Math.max(1, view.height);
  const T = Math.max(0.35, Math.min(W, D) * 0.02); // wall thickness
  const F = Math.max(0.5, Math.min(W, D) * 0.035); // floor slab thickness

  // Two passes: size the shell first, then derive text and label spacing from it
  // so a 6-stud kiosk and a 200-stud unit both come out legible.
  const shell: Pt[] = [];
  for (const x of [-T, W + T]) {
    for (const z of [-T, D + T]) {
      for (const y of [-F, H]) shell.push(project(x, y, z));
    }
  }
  const shellMinX = Math.min(...shell.map((p) => p.x));
  const shellMaxX = Math.max(...shell.map((p) => p.x));
  const shellMinY = Math.min(...shell.map((p) => p.y));
  const shellMaxY = Math.max(...shell.map((p) => p.y));
  const fs = Math.max(shellMaxX - shellMinX, shellMaxY - shellMinY) * 0.030;
  const gap = fs * 2.4;
  const centre = { x: (shellMinX + shellMaxX) / 2, y: (shellMinY + shellMaxY) / 2 };

  const entrance: RoomWindow = { ...view.entrance, sill: 0 };
  const openingsFor = (wall: Wall) => [
    ...(entrance.wall === wall ? [{ opening: entrance, isEntrance: true }] : []),
    ...view.windows.filter((w) => w.wall === wall).map((opening) => ({ opening, isEntrance: false })),
  ];

  // --- Floor slab: a base plate the walls sit on, extruded downward. ---
  const fx0 = -T;
  const fx1 = W + T;
  const fz0 = -T;
  const fz1 = D + T;
  const floorTop = [project(fx0, 0, fz0), project(fx1, 0, fz0), project(fx1, 0, fz1), project(fx0, 0, fz1)];
  const floorFront = [project(fx1, 0, fz1), project(fx0, 0, fz1), project(fx0, -F, fz1), project(fx1, -F, fz1)];
  const floorRight = [project(fx1, 0, fz0), project(fx1, 0, fz1), project(fx1, -F, fz1), project(fx1, -F, fz0)];

  // --- Floor grid, purely to make the scale readable. ---
  const step = [0.5, 1, 2, 5, 10, 20, 25, 50, 100].find((s) => s >= Math.max(W, D) / 9) ?? 100;
  const grid: [Pt, Pt][] = [];
  for (let x = step; x < W - 1e-6; x += step) grid.push([project(x, 0, 0), project(x, 0, D)]);
  for (let z = step; z < D - 1e-6; z += step) grid.push([project(0, 0, z), project(W, 0, z)]);

  const renderWall = (wall: Wall) => {
    const g = wallGeom(wall, W, D);
    const cut = !g.far; // near walls are cut away so the room stays visible
    const facePlane = cut ? T : 0;
    const backPlane = cut ? 0 : T;
    const openings = openingsFor(wall);
    const maskId = `${uid}-${wall}`;
    const fill = cut ? palette.cutaway : wall === "back" ? palette.wallBack : palette.wallLeft;

    return (
      <g key={wall}>
        {/* Seen through each opening: the reveal on the far side of the wall. */}
        {!cut && openings.map(({ opening }, i) => (
          <polygon key={`recess-${i}`} points={points(openingQuad(g, opening, backPlane))} fill={palette.recess} />
        ))}
        {/* Openings are punched only through solid walls. A cut-away wall is
            already see-through, so a hole there would just expose the page
            background instead of reading as a window. The mask region is pinned
            to the viewBox: the percentage defaults would clip geometry that
            falls outside the wall's own bounding box. */}
        {!cut && (
          <mask
            id={maskId}
            maskUnits="userSpaceOnUse"
            x={r(minX)} y={r(minY)} width={r(maxX - minX)} height={r(maxY - minY)}
          >
            <polygon points={points(faceQuad(g, H, facePlane))} fill="#fff" />
            {openings.map(({ opening }, i) => (
              <polygon key={i} points={points(openingQuad(g, opening, facePlane))} fill="#000" />
            ))}
          </mask>
        )}
        <polygon
          points={points(faceQuad(g, H, facePlane))}
          fill={fill}
          fillOpacity={cut ? 0.2 : 1}
          mask={cut ? undefined : `url(#${maskId})`}
        />
        <polygon points={points(topQuad(g, H, T))} fill={palette.wallTop} fillOpacity={cut ? 0.35 : 1} />
        <polygon
          points={points(faceQuad(g, H, facePlane))}
          fill="none"
          stroke={palette.line}
          strokeOpacity={cut ? 0.65 : 0.3}
          strokeWidth={fs * 0.05}
          strokeDasharray={cut ? `${r(fs * 0.5)} ${r(fs * 0.35)}` : undefined}
        />
        {openings.map(({ opening, isEntrance }, i) => {
          const midT = opening.offset + opening.width / 2;
          const top = wallPoint(g, midT, opening.sill + opening.height, facePlane);
          const bottom = wallPoint(g, midT, opening.sill, facePlane);
          const centreOf = wallPoint(g, midT, opening.sill + opening.height / 2, facePlane);
          // Openings are sized in studs while the type is sized to the drawing, so
          // shrink the label to fit its own frame — the doorway in particular is a
          // fixed 8.4 studs and would otherwise spill out of a large unit.
          const label = `${studs(opening.width)} × ${studs(opening.height)}`;
          const labelFs = Math.min(
            fs * 0.72,
            (opening.width * COS30 * 0.92) / (label.length * 0.58),
            opening.height * 0.62,
          );
          return (
            <g key={`frame-${i}`}>
              {/* On a see-through wall the opening gets a tinted pane, so it reads
                  as a window rather than a rectangle floating over the floor. */}
              {cut && (
                <polygon
                  points={points(openingQuad(g, opening, facePlane))}
                  fill={palette.cutaway}
                  fillOpacity={0.28}
                />
              )}
              <polygon
                points={points(openingQuad(g, opening, facePlane))}
                fill="none"
                stroke={isEntrance ? palette.accent : palette.frame}
                strokeWidth={fs * (isEntrance ? 0.14 : 0.11)}
                strokeLinejoin="round"
              />
              {/* Centre mullion, so a window never reads as a plain hole. */}
              {!isEntrance && (
                <line
                  x1={r(bottom.x)} y1={r(bottom.y)} x2={r(top.x)} y2={r(top.y)}
                  stroke={palette.frame}
                  strokeWidth={fs * 0.09}
                />
              )}
              {labelFs > fs * 0.3 && (
                <text
                  x={r(centreOf.x)}
                  y={r(centreOf.y)}
                  fill={isEntrance ? palette.accent : palette.text}
                  fontSize={r(labelFs)}
                  fontWeight={isEntrance ? 800 : 600}
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {label}
                </text>
              )}
            </g>
          );
        })}
      </g>
    );
  };

  // --- Entrance: threshold strip, arrow into the room, and a label it points at. ---
  const eg = wallGeom(entrance.wall, W, D);
  const eMid = entrance.offset + entrance.width / 2;
  const eDepth = Math.min(2.5, Math.min(W, D) * 0.12);
  const threshold = [
    wallPoint(eg, entrance.offset, 0, 0),
    wallPoint(eg, entrance.offset + entrance.width, 0, 0),
    wallPoint(eg, entrance.offset + entrance.width, 0, -eDepth),
    wallPoint(eg, entrance.offset, 0, -eDepth),
  ];
  const arrowHalf = Math.min(entrance.width * 0.22, eDepth * 0.7);
  const arrow = [
    wallPoint(eg, eMid, 0, -eDepth * 2.6),
    wallPoint(eg, eMid - arrowHalf, 0, -eDepth * 1.3),
    wallPoint(eg, eMid + arrowHalf, 0, -eDepth * 1.3),
  ];
  const entranceLabelAt = wallPoint(eg, eMid, 0, -eDepth * 3.9);

  // --- One dimension per wall, plus the height off the back-right corner. ---
  // The two far walls are dimensioned at their top edge: a floor-level rule
  // behind a tall wall would be drawn over by the wall itself.
  const corner = gap * 0.55;
  const wallDims = [
    { wall: "back" as Wall, from: project(0, H, -gap), to: project(W, H, -gap), len: W },
    { wall: "right" as Wall, from: project(W + gap, 0, 0), to: project(W + gap, 0, D), len: D },
    { wall: "front" as Wall, from: project(W, 0, D + gap), to: project(0, 0, D + gap), len: W },
    { wall: "left" as Wall, from: project(-gap, H, D), to: project(-gap, H, 0), len: D },
  ];
  const heightDim = {
    from: project(W + corner, 0, -corner),
    to: project(W + corner, H, -corner),
  };

  // --- Final viewBox: everything drawn, plus room for the labels. ---
  const bounds: Pt[] = [
    ...shell,
    ...wallDims.flatMap((d) => [d.from, d.to]),
    heightDim.from,
    heightDim.to,
  ];
  const pad = fs * 2.8;
  const minX = Math.min(...bounds.map((p) => p.x)) - pad;
  const maxX = Math.max(...bounds.map((p) => p.x)) + pad;
  const minY = Math.min(...bounds.map((p) => p.y)) - pad;
  const maxY = Math.max(...bounds.map((p) => p.y)) + pad;

  return (
    <svg
      viewBox={`${r(minX)} ${r(minY)} ${r(maxX - minX)} ${r(maxY - minY)}`}
      width="100%"
      style={{ height, display: "block", maxWidth: "100%" }}
      role="img"
      aria-label={`Room diagram: ${describeRoom(room)}`}
    >
      <polygon points={points(floorFront)} fill={palette.floorEdge} />
      <polygon points={points(floorRight)} fill={palette.floorEdge} />
      <polygon points={points(floorTop)} fill={palette.floor} />
      <g stroke={palette.grid} strokeWidth={fs * 0.04}>
        {grid.map(([a, b], i) => (
          <line key={i} x1={r(a.x)} y1={r(a.y)} x2={r(b.x)} y2={r(b.y)} />
        ))}
      </g>

      {(["left", "back"] as Wall[]).map(renderWall)}

      <polygon points={points(threshold)} fill={palette.accent} fillOpacity={0.16} />
      <polygon points={points(arrow)} fill={palette.accent} fillOpacity={0.9} />
      <text
        x={r(entranceLabelAt.x)}
        y={r(entranceLabelAt.y)}
        fill={palette.accent}
        fontSize={r(fs * 0.82)}
        fontWeight={800}
        textAnchor="middle"
        dominantBaseline="central"
      >
        Entrance
      </text>

      {(["right", "front"] as Wall[]).map(renderWall)}

      {wallDims.map((d) => (
        <Dimension
          key={d.wall}
          from={d.from}
          to={d.to}
          label={`${WALL_LABELS[nameOf[d.wall]]} · ${studs(d.len)}`}
          away={centre}
          fs={fs}
          palette={palette}
        />
      ))}
      <Dimension
        from={heightDim.from}
        to={heightDim.to}
        label={`Height · ${studs(H)}`}
        away={centre}
        fs={fs}
        palette={palette}
      />
    </svg>
  );
}

export type { RoomLayout, RoomOpening, RoomSpec, RoomWindow, Wall };
