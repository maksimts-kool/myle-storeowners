import type { Config } from "./config.js";
import type { prisma as database } from "./db.js";
import type { Notifier } from "./services/notifier.js";
import type { RobloxIdentityService } from "./services/roblox-identity.js";

/** Shared dependencies injected into each route module. */
export interface RouteDeps {
  config: Config;
  db: typeof database;
  notifier: Notifier;
  robloxIdentity: RobloxIdentityService;
}
