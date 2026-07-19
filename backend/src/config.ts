import { z } from "zod";

const csv = z
  .string()
  .default("")
  .transform((value) => value.split(",").map((v) => v.trim()).filter(Boolean));

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1),

  // Discord OAuth2 (reuses your existing Discord application).
  DISCORD_CLIENT_ID: z.string().min(1),
  DISCORD_CLIENT_SECRET: z.string().min(1),
  DISCORD_OAUTH_REDIRECT_URI: z.string().url(),

  // Comma-separated Discord user IDs that get game-owner (admin) access.
  ADMIN_DISCORD_IDS: csv,

  // Signing secret for the session cookie (JWT). Use a long random value.
  SESSION_SECRET: z.string().min(16),

  // Public base URL of the site (used to redirect the browser after OAuth).
  PUBLIC_BASE_URL: z.string().url(),

  // Where to reach the bot's internal portal endpoints, and their shared secret.
  // Leave BOT_NOTIFY_URL empty to disable DMs and verified-owner lookup.
  BOT_NOTIFY_URL: z.string().default(""),
  BOT_NOTIFY_SECRET: z.string().default(""),

  // Filesystem location for uploaded store files and templates.
  STORE_FILES_DIR: z.string().default("/data/store-files"),
  MAX_UPLOAD_BYTES: positiveInt(250 * 1024 * 1024),

  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  // "all" trusts any upstream — safe only when the API is reachable solely
  // through a trusted reverse proxy (the Caddy service in this deployment).
  TRUST_PROXY: z.enum(["false", "loopback", "all"]).default("loopback"),
  COOKIE_SECURE: z.enum(["auto", "true", "false"]).default("auto"),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.parse(env);
  if (parsed.BOT_NOTIFY_URL && !parsed.BOT_NOTIFY_SECRET) {
    throw new Error("BOT_NOTIFY_SECRET is required when BOT_NOTIFY_URL is set");
  }
  return parsed;
}

/** Whether the session cookie should carry the Secure attribute. */
export function cookieIsSecure(config: Config): boolean {
  if (config.COOKIE_SECURE === "true") return true;
  if (config.COOKIE_SECURE === "false") return false;
  return config.PUBLIC_BASE_URL.startsWith("https://");
}

/**
 * The browser-visible path where the portal is mounted. This can differ from
 * the path received by the API when a reverse proxy strips a path prefix.
 */
export function publicBasePath(config: Config): string {
  const pathname = new URL(config.PUBLIC_BASE_URL).pathname;
  return pathname === "/" ? "/" : pathname.replace(/\/+$/, "");
}

/** Cookie path for the browser-visible OAuth login and callback routes. */
export function authCookiePath(config: Config): string {
  const basePath = publicBasePath(config);
  return basePath === "/" ? "/api/auth" : `${basePath}/api/auth`;
}

/** Role-preview debugging is intentionally available only from a local portal. */
export function localDebugModeEnabled(config: Config): boolean {
  const hostname = new URL(config.PUBLIC_BASE_URL).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "[::1]";
}
