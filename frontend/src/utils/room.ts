/**
 * Room layout shared by the diagram and the admin editor. Mirrors the backend
 * schema in `backend/src/services/room.ts` — walls are named by walking the room
 * clockwise from above, and every opening's `offset` runs from that wall's first
 * corner in the same direction.
 *
 * Every mall unit is the same height and gets the same doorway, so only the
 * footprint and the windows are stored; the rest is derived from the constants
 * below.
 */

export const WALLS = ["back", "right", "front", "left"] as const;
export type Wall = (typeof WALLS)[number];

export const WALL_LABELS: Record<Wall, string> = {
  back: "Back",
  right: "Right",
  front: "Front",
  left: "Left",
};

/** Fixed for every unit. */
export const ROOM_HEIGHT = 17;
export const DOOR = { wall: "front" as Wall, width: 8.4, height: 8.2 };

export interface RoomOpening {
  wall: Wall;
  offset: number;
  width: number;
  height: number;
}

export interface RoomWindow extends RoomOpening {
  sill: number;
}

/** What an admin edits and what gets stored. */
export interface RoomSpec {
  width: number;
  depth: number;
  /**
   * Studs from the front wall's first corner to the near edge of the doorway.
   * The diagram turns the front wall to face the camera, so this runs
   * left-to-right across the wall you see.
   */
  doorOffset: number;
  windows: RoomWindow[];
}

/** What the diagram draws: the spec plus the fixed height and doorway. */
export interface RoomLayout extends RoomSpec {
  height: number;
  entrance: RoomOpening;
}

export const MAX_WINDOWS = 12;

export const LIMITS = {
  // The doorway has to fit across the front wall, so the unit is never narrower.
  width: { min: DOOR.width, max: 500 },
  depth: { min: 4, max: 500 },
} as const;

/** How long a given wall is, in studs. */
export function wallLength(wall: Wall, room: Pick<RoomSpec, "width" | "depth">): number {
  return wall === "back" || wall === "front" ? room.width : room.depth;
}

/** A square is simply a unit whose width and depth match. */
export function isSquare(room: Pick<RoomSpec, "width" | "depth">): boolean {
  return room.width === room.depth;
}

export function shapeLabel(room: Pick<RoomSpec, "width" | "depth">): string {
  return isSquare(room) ? "Square" : "Rectangle";
}

/** Furthest the doorway can sit from the corner before it runs off the wall. */
export function maxDoorOffset(width: number): number {
  return Math.max(0, Math.round((width - DOOR.width) * 10) / 10);
}

/** Default door position: centred on the front wall. */
export function centredDoorOffset(width: number): number {
  return Math.max(0, Math.round(((width - DOOR.width) / 2) * 10) / 10);
}

/** Fill in the fixed height and doorway to get a drawable layout. */
export function toLayout(room: RoomSpec): RoomLayout {
  return {
    ...room,
    height: ROOM_HEIGHT,
    entrance: {
      wall: DOOR.wall,
      offset: room.doorOffset,
      width: DOOR.width,
      height: DOOR.height,
    },
  };
}

export function defaultRoom(): RoomSpec {
  return { width: 40, depth: 30, doorOffset: centredDoorOffset(40), windows: [] };
}

export function defaultWindow(room: RoomSpec): RoomWindow {
  // The back wall faces the doorway and is always clear of it.
  const wall: Wall = "back";
  const width = Math.min(8, Math.max(1, wallLength(wall, room) - 2));
  const height = 6;
  return {
    wall,
    offset: Math.max(0, Math.round(((wallLength(wall, room) - width) / 2) * 10) / 10),
    width,
    height,
    sill: 5,
  };
}

export function floorArea(room: Pick<RoomSpec, "width" | "depth">): number {
  return Math.round(room.width * room.depth);
}

export interface RoomErrors {
  width?: string;
  depth?: string;
  doorOffset?: string;
  windows: Record<number, { offset?: string; width?: string; height?: string; sill?: string }>;
}

const bad = (n: number) => !Number.isFinite(n);

/**
 * Field-level validation, kept in step with the backend so a layout that looks
 * valid in the editor is never rejected on save.
 */
export function validateRoom(room: RoomSpec): { errors: RoomErrors; valid: boolean } {
  const errors: RoomErrors = { windows: {} };

  for (const key of ["width", "depth"] as const) {
    const value = room[key];
    const { min, max } = LIMITS[key];
    if (bad(value) || value < min || value > max) errors[key] = `Use ${min}–${max} studs`;
  }

  const roomOk = !errors.width && !errors.depth;
  if (bad(room.doorOffset) || room.doorOffset < 0) {
    errors.doorOffset = "Cannot be negative";
  } else if (roomOk && room.doorOffset > maxDoorOffset(room.width) + 1e-6) {
    errors.doorOffset = `Runs past the wall — use 0–${maxDoorOffset(room.width)}`;
  }

  const door = { start: room.doorOffset, end: room.doorOffset + DOOR.width };
  const doorOk = !errors.doorOffset;

  room.windows.forEach((w, i) => {
    const out: { offset?: string; width?: string; height?: string; sill?: string } = {};
    const along = wallLength(w.wall, room);
    if (bad(w.width) || w.width < 0.5) out.width = "At least 0.5";
    if (bad(w.height) || w.height < 0.5) out.height = "At least 0.5";
    if (bad(w.offset) || w.offset < 0) out.offset = "Cannot be negative";
    if (bad(w.sill) || w.sill < 0) out.sill = "Cannot be negative";
    if (roomOk && !out.offset && !out.width && w.offset + w.width > along + 1e-6) {
      out.offset = `Runs past the ${w.wall} wall (${along} studs)`;
    }
    if (!out.height && !out.sill && w.sill + w.height > ROOM_HEIGHT + 1e-6) {
      out.height = `Taller than the ${ROOM_HEIGHT}-stud wall`;
    }
    // The doorway is fixed, so a front-wall window has to sit clear of it.
    if (
      roomOk && doorOk && w.wall === DOOR.wall && !out.offset && !out.width && !out.sill &&
      w.sill < DOOR.height - 1e-6 && w.offset < door.end - 1e-6 && w.offset + w.width > door.start + 1e-6
    ) {
      out.offset = `Overlaps the doorway (${studsLabel(door.start)}–${studsLabel(door.end)})`;
    }
    if (Object.keys(out).length > 0) errors.windows[i] = out;
  });

  const valid =
    !errors.width && !errors.depth && !errors.doorOffset && Object.keys(errors.windows).length === 0;
  return { errors, valid };
}

const studsLabel = (n: number) => `${Math.round(n * 10) / 10}`;
