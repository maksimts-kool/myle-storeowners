import type { FastifyBaseLogger } from "fastify";
import type { Config } from "../config.js";

export interface VerifiedMember {
  discordId: string;
  discordName: string;
  robloxUsername: string | null;
}

/** Resolves a Discord user to their Roblox username through the bot's Bloxlink service. */
export class RobloxIdentityService {
  constructor(
    private readonly config: Config,
    private readonly log: FastifyBaseLogger,
  ) {}

  private endpointFor(path: string): string | null {
    if (!this.config.BOT_NOTIFY_URL || !this.config.BOT_NOTIFY_SECRET) return null;
    const url = new URL(this.config.BOT_NOTIFY_URL);
    if (!url.pathname.endsWith("/internal/notify")) return null;
    url.pathname = url.pathname.replace(/\/internal\/notify$/, path);
    return url.toString();
  }

  async usernameForDiscord(discordId: string): Promise<string | null> {
    const endpoint = this.endpointFor("/internal/roblox-username/");
    if (!endpoint) return null;
    try {
      const response = await fetch(`${endpoint}${encodeURIComponent(discordId)}`, {
        headers: { Authorization: `Bearer ${this.config.BOT_NOTIFY_SECRET}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) {
        this.log.warn({ status: response.status }, "Bot Roblox username lookup failed");
        return null;
      }
      const body = await response.json() as { username?: unknown };
      return typeof body.username === "string" && body.username.trim() ? body.username : null;
    } catch (error) {
      this.log.warn({ error }, "Bot Roblox username lookup failed");
      return null;
    }
  }

  /** Members with a Bloxlink mapping who still belong to the bot's Discord server. */
  async verifiedMembers(): Promise<VerifiedMember[]> {
    const endpoint = this.endpointFor("/internal/verified-members");
    if (!endpoint) return [];
    try {
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${this.config.BOT_NOTIFY_SECRET}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        this.log.warn({ status: response.status }, "Bot verified-member lookup failed");
        return [];
      }
      const body = await response.json() as { members?: unknown };
      if (!Array.isArray(body.members)) return [];
      return body.members.flatMap((member): VerifiedMember[] => {
        if (!member || typeof member !== "object") return [];
        const candidate = member as Record<string, unknown>;
        if (
          typeof candidate.discordId !== "string" || !/^\d{5,25}$/.test(candidate.discordId)
          || typeof candidate.discordName !== "string" || !candidate.discordName.trim()
          || (candidate.robloxUsername !== null && (typeof candidate.robloxUsername !== "string" || !candidate.robloxUsername.trim()))
        ) return [];
        return [{
          discordId: candidate.discordId,
          discordName: candidate.discordName,
          robloxUsername: typeof candidate.robloxUsername === "string" ? candidate.robloxUsername : null,
        }];
      });
    } catch (error) {
      this.log.warn({ error }, "Bot verified-member lookup failed");
      return [];
    }
  }

  async verifiedMemberForDiscord(discordId: string): Promise<VerifiedMember | null> {
    const members = await this.verifiedMembers();
    return members.find((member) => member.discordId === discordId) ?? null;
  }
}
