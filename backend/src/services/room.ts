import { z } from "zod";

/**
 * A store's room layout, in Roblox studs. Walls are named by walking the room
 * clockwise seen from above, so every opening's `offset` is measured from the
 * wall's first corner in that same direction:
 *
 *          back  (x: 0 -> width)
 *   left  +----------------+  right
 *   (z: depth -> 0)        |  (z: 0 -> depth)
 *         +----------------+
 *          front (x: width -> 0)
 *
 * Every unit is the same height and gets the same doorway, so only the
 * footprint and the windows are stored — see ROOM_HEIGHT and DOOR.
 */
export const WALLS = ["back", "right", "front", "left"] as const;
export type Wall = (typeof WALLS)[number];

/** Fixed for every unit; mirrored in frontend/src/utils/room.ts. */
export const ROOM_HEIGHT = 17;
export const DOOR = { wall: "front" as Wall, width: 8.4, height: 8.2 };

/** Studs, rounded to one decimal so the stored numbers stay tidy. */
const studs = (min: number, max: number) =>
  z.coerce.number().finite().min(min).max(max).transform((v) => Math.round(v * 10) / 10);

const windowSchema = z.object({
  wall: z.enum(WALLS),
  offset: studs(0, 500),
  width: studs(0.5, 500),
  height: studs(0.5, ROOM_HEIGHT),
  sill: studs(0, ROOM_HEIGHT),
});

export const MAX_WINDOWS = 12;

/** Furthest the doorway can sit from the corner before it runs off the wall. */
export function maxDoorOffset(width: number): number {
  return Math.max(0, Math.round((width - DOOR.width) * 10) / 10);
}

export const roomSchema = z
  .object({
    // The doorway has to fit across the front wall, so the unit is never narrower.
    width: studs(DOOR.width, 500),
    depth: studs(4, 500),
    doorOffset: studs(0, 500),
    windows: z.array(windowSchema).max(MAX_WINDOWS).default([]),
  })
  .superRefine((room, ctx) => {
    const doorStart = room.doorOffset;
    const doorEnd = doorStart + DOOR.width;

    if (doorEnd > room.width + 1e-6) {
      ctx.addIssue({
        code: "custom",
        path: ["doorOffset"],
        message: `Runs past the front wall — use 0–${maxDoorOffset(room.width)} studs`,
      });
    }

    room.windows.forEach((w, i) => {
      const along = w.wall === "back" || w.wall === "front" ? room.width : room.depth;
      if (w.offset + w.width > along + 1e-6) {
        ctx.addIssue({
          code: "custom",
          path: ["windows", i, "offset"],
          message: `Does not fit on the ${w.wall} wall (${along} studs long)`,
        });
      }
      if (w.sill + w.height > ROOM_HEIGHT + 1e-6) {
        ctx.addIssue({
          code: "custom",
          path: ["windows", i, "height"],
          message: `Taller than the ${ROOM_HEIGHT}-stud wall`,
        });
      }
      if (
        w.wall === DOOR.wall && w.sill < DOOR.height - 1e-6 &&
        w.offset < doorEnd - 1e-6 && w.offset + w.width > doorStart + 1e-6
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["windows", i, "offset"],
          message: `Overlaps the doorway (${doorStart}–${doorEnd} studs)`,
        });
      }
    });
  });

export type RoomSpec = z.infer<typeof roomSchema>;

/**
 * Read a stored room layout. Anything that no longer satisfies the schema (for
 * example a layout written before the height and doorway became fixed) is
 * treated as "no layout" rather than breaking the whole store response.
 */
export function parseRoom(value: unknown): RoomSpec | null {
  if (value === null || value === undefined) return null;
  const parsed = roomSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
