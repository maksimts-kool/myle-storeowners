import "@fastify/jwt";
import type { preHandlerHookHandler } from "fastify";

/** The signed session payload stored in the httpOnly cookie. */
export interface SessionUser {
  /** Discord user ID (the JWT subject). */
  sub: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
  /** Admin-only, browser-session role preview. Never persisted in the database. */
  debugRole?: "GAME_OWNER" | "STORE_OWNER" | "MEMBER";
  /** Store an admin is impersonating when debugRole is STORE_OWNER. */
  debugStoreCode?: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: SessionUser;
    user: SessionUser;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    /** preHandler that verifies the session cookie; 401 when absent/invalid. */
    authenticate: preHandlerHookHandler;
    /** preHandler that requires an authenticated game-owner (admin); 403 otherwise. */
    requireAdmin: preHandlerHookHandler;
    /** Like requireAdmin, but honours a lower debug-role preview. */
    requireEffectiveAdmin: preHandlerHookHandler;
    /** Returns true when the Discord user ID is configured as a game owner. */
    isAdmin(discordId: string): boolean;
    /** Whether role-preview debugging is enabled for this local portal instance. */
    localDebugModeEnabled: boolean;
  }
}
