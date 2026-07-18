import type { Config } from "../config.js";
import { badRequest } from "../lib/errors.js";

const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordUser {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
}

/** Build the Discord authorize URL for the OAuth2 code flow (identify scope). */
export function buildAuthorizeUrl(config: Config, state: string): string {
  const params = new URLSearchParams({
    client_id: config.DISCORD_CLIENT_ID,
    redirect_uri: config.DISCORD_OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: "identify",
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

/** Exchange an authorization code for an access token. */
export async function exchangeCode(config: Config, code: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: config.DISCORD_CLIENT_ID,
    client_secret: config.DISCORD_CLIENT_SECRET,
    grant_type: "authorization_code",
    code,
    redirect_uri: config.DISCORD_OAUTH_REDIRECT_URI,
  });
  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw badRequest("oauth_exchange_failed", `Discord token exchange failed with status ${response.status}`);
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw badRequest("oauth_exchange_failed", "Discord token response had no access token");
  return json.access_token;
}

/** Fetch the authenticated user's Discord profile. */
export async function fetchDiscordUser(accessToken: string): Promise<DiscordUser> {
  const response = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw badRequest("oauth_profile_failed", `Discord profile request failed with status ${response.status}`);
  }
  const json = (await response.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };
  return {
    id: json.id,
    username: json.username,
    globalName: json.global_name ?? null,
    avatar: json.avatar ?? null,
  };
}
