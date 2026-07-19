import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { RouteDeps } from "../deps.js";

/** The user-facing notification preference flags (all default to on). */
export interface NotificationPrefs {
  submissionReceived: boolean;
  reviewNeeded: boolean;
  submissionApproved: boolean;
  submissionDeclined: boolean;
  submissionPublished: boolean;
  applicationApplied: boolean;
  applicationSelected: boolean;
  applicationNotSelected: boolean;
  applicationRemoved: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  submissionReceived: true,
  reviewNeeded: true,
  submissionApproved: true,
  submissionDeclined: true,
  submissionPublished: true,
  applicationApplied: true,
  applicationSelected: true,
  applicationNotSelected: true,
  applicationRemoved: true,
};

const prefsSchema = z
  .object({
    submissionReceived: z.boolean(),
    reviewNeeded: z.boolean(),
    submissionApproved: z.boolean(),
    submissionDeclined: z.boolean(),
    submissionPublished: z.boolean(),
    applicationApplied: z.boolean(),
    applicationSelected: z.boolean(),
    applicationNotSelected: z.boolean(),
    applicationRemoved: z.boolean(),
  })
  .partial();

export function registerSettingsRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db } = deps;

  // Current user's notification preferences (defaults when never saved).
  app.get("/api/settings/notifications", { preHandler: app.authenticate }, async (request) => {
    const pref = await db.notificationPreference.findUnique({ where: { discordId: request.user.sub } });
    const { discordId: _d, updatedAt: _u, ...flags } = pref ?? {};
    return { notifications: { ...DEFAULT_PREFS, ...flags } };
  });

  // Update (upsert) the current user's notification preferences.
  app.patch("/api/settings/notifications", { preHandler: app.authenticate }, async (request) => {
    const input = prefsSchema.parse(request.body);
    // Drop keys the client omitted so create fills them from defaults and update
    // only touches what changed (no explicit `undefined`, which strict TS rejects).
    const changes = Object.fromEntries(
      Object.entries(input).filter(([, v]) => v !== undefined),
    ) as Partial<NotificationPrefs>;
    const pref = await db.notificationPreference.upsert({
      where: { discordId: request.user.sub },
      create: { discordId: request.user.sub, ...DEFAULT_PREFS, ...changes },
      update: changes,
    });
    const { discordId: _d, updatedAt: _u, ...flags } = pref;
    return { notifications: flags };
  });
}
