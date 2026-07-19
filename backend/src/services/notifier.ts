import type { FastifyBaseLogger } from "fastify";
import type { Store, StoreApplication, StoreVersion } from "@prisma/client";
import type { Config } from "../config.js";
import type { prisma as database } from "../db.js";

type Db = typeof database;

/** A single notification kind. Add new kinds here as the workflow grows. */
export type NotificationKind =
  | "submission_received"
  | "review_needed"
  | "submission_approved"
  | "submission_declined"
  | "submission_published"
  | "application_applied"
  | "application_selected"
  | "application_not_selected"
  | "application_removed";

/** Maps each kind to the per-user opt-out column on NotificationPreference. */
export const PREFERENCE_FIELD = {
  submission_received: "submissionReceived",
  review_needed: "reviewNeeded",
  submission_approved: "submissionApproved",
  submission_declined: "submissionDeclined",
  submission_published: "submissionPublished",
  application_applied: "applicationApplied",
  application_selected: "applicationSelected",
  application_not_selected: "applicationNotSelected",
  application_removed: "applicationRemoved",
} as const satisfies Record<NotificationKind, string>;

interface NotifyInput {
  discordId: string;
  kind: NotificationKind;
  title: string;
  message: string;
  /** Resolve this uploader's Roblox username in the bot before sending. */
  uploaderDiscordId?: string;
  storeCode?: string;
  color?: number;
  url?: string;
}

const COLORS = {
  received: 0x3b82f6, // blue
  review: 0xf59e0b, // amber
  approved: 0x22c55e, // green
  declined: 0xef4444, // red
  published: 0x8b5cf6, // violet
  application: 0x3b82f6, // blue
  selected: 0x22c55e, // green
  removed: 0xef4444, // red
} as const;

/**
 * Sends Discord DMs by calling the bot's authenticated `/internal/notify`
 * endpoint. The bot owns the persistent Discord gateway connection, so the
 * site never logs in a second client. Delivery failures are logged and never
 * block the store state change that triggered them.
 */
export class Notifier {
  constructor(
    private readonly db: Db,
    private readonly config: Config,
    private readonly log: FastifyBaseLogger,
  ) {}

  private get enabled(): boolean {
    return Boolean(this.config.BOT_NOTIFY_URL && this.config.BOT_NOTIFY_SECRET);
  }

  /** Whether the recipient still wants this kind of DM (defaults to yes). */
  private async wantsNotification(discordId: string, kind: NotificationKind): Promise<boolean> {
    try {
      const pref = await this.db.notificationPreference.findUnique({ where: { discordId } });
      return pref ? pref[PREFERENCE_FIELD[kind]] : true;
    } catch (error) {
      // Never let a preference lookup block a notification.
      this.log.error({ error }, "Failed to read notification preferences; sending anyway");
      return true;
    }
  }

  private async send(input: NotifyInput): Promise<void> {
    if (!(await this.wantsNotification(input.discordId, input.kind))) {
      return; // recipient opted out of this kind
    }
    if (!this.enabled) {
      this.log.warn({ kind: input.kind }, "Notifications disabled (BOT_NOTIFY_URL unset); skipping DM");
      await this.record(input, false, "notifications_disabled");
      return;
    }
    try {
      const response = await fetch(this.config.BOT_NOTIFY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.BOT_NOTIFY_SECRET}`,
        },
        body: JSON.stringify({
          discordId: input.discordId,
          title: input.title,
          message: input.message,
          ...(input.uploaderDiscordId ? { uploaderDiscordId: input.uploaderDiscordId } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
          ...(input.url ? { url: input.url } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const ok = response.ok;
      await this.record(input, ok, ok ? null : `bot_status_${response.status}`);
      if (!ok) this.log.warn({ kind: input.kind, status: response.status }, "Bot notify endpoint returned an error");
    } catch (error) {
      const detail = error instanceof Error ? error.name : "unknown_error";
      this.log.warn({ kind: input.kind, detail }, "Bot notify request failed");
      await this.record(input, false, detail);
    }
  }

  private async record(input: NotifyInput, success: boolean, detail: string | null): Promise<void> {
    try {
      await this.db.notificationLog.create({
        data: {
          discordId: input.discordId,
          kind: input.kind,
          success,
          ...(input.storeCode ? { storeCode: input.storeCode } : {}),
          ...(detail ? { detail } : {}),
        },
      });
    } catch (error) {
      this.log.error({ error }, "Failed to persist notification log entry");
    }
  }

  private storeLabel(store: Store): string {
    return store.displayName || `Store ${store.code}`;
  }

  /** Public store-file version identifier, e.g. A1.001.260718. */
  private versionLabel(store: Store, version: StoreVersion): string {
    const date = version.createdAt;
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${store.code}.${String(version.versionNumber).padStart(3, "0")}.${yy}${mm}${dd}`;
  }

  /** DM the uploader that their submission was received and is awaiting review. */
  async submissionReceived(store: Store, version: StoreVersion): Promise<void> {
    const versionLabel = this.versionLabel(store, version);
    await this.send({
      discordId: version.uploadedByDiscordId,
      kind: "submission_received",
      storeCode: store.code,
      color: COLORS.received,
      title: `📥 Upload received — ${versionLabel}`,
      message: `Your new file **${versionLabel}** for **${this.storeLabel(store)}** was received and is now waiting for review.`,
    });
  }

  /** DM every game owner that a new submission needs review. */
  async reviewNeeded(store: Store, version: StoreVersion): Promise<void> {
    const versionLabel = this.versionLabel(store, version);
    for (const adminId of this.config.ADMIN_DISCORD_IDS) {
      await this.send({
        discordId: adminId,
        kind: "review_needed",
        storeCode: store.code,
        color: COLORS.review,
        title: `🛎️ Review needed — ${versionLabel}`,
        message: `{{uploader}} uploaded **${versionLabel}** for **${this.storeLabel(store)}**. Download and review it on the portal.`,
        uploaderDiscordId: version.uploadedByDiscordId,
      });
    }
  }

  /** DM the uploader that their submission was approved. */
  async submissionApproved(store: Store, version: StoreVersion): Promise<void> {
    const versionLabel = this.versionLabel(store, version);
    await this.send({
      discordId: version.uploadedByDiscordId,
      kind: "submission_approved",
      storeCode: store.code,
      color: COLORS.approved,
      title: `✅ Approved — ${versionLabel}`,
      message: `**${versionLabel}** for **${this.storeLabel(store)}** was approved and is queued to be published to the game.`,
    });
  }

  /** DM the uploader that their submission was declined, with the reason. */
  async submissionDeclined(store: Store, version: StoreVersion, reason: string | null): Promise<void> {
    const versionLabel = this.versionLabel(store, version);
    const tail = reason ? `\n\nReason: ${reason}` : "";
    await this.send({
      discordId: version.uploadedByDiscordId,
      kind: "submission_declined",
      storeCode: store.code,
      color: COLORS.declined,
      title: `❌ Declined — ${versionLabel}`,
      message: `**${versionLabel}** for **${this.storeLabel(store)}** was declined.${tail}`,
    });
  }

  /** DM the uploader that their submission is now live in the game. */
  async submissionPublished(store: Store, version: StoreVersion): Promise<void> {
    const versionLabel = this.versionLabel(store, version);
    await this.send({
      discordId: version.uploadedByDiscordId,
      kind: "submission_published",
      storeCode: store.code,
      color: COLORS.published,
      title: `🚀 Published — ${versionLabel}`,
      message: `**${versionLabel}** for **${this.storeLabel(store)}** is now live in the game. 🎉`,
    });
  }

  /** Confirm that a member's one-time election application was recorded. */
  async applicationApplied(store: Store, application: StoreApplication): Promise<void> {
    await this.send({
      discordId: application.applicantDiscordId,
      kind: "application_applied",
      storeCode: store.code,
      color: COLORS.application,
      title: `🗳️ Application received — ${store.code}`,
      message: `Your application to manage **${this.storeLabel(store)}** was received. You can vote in every store election while applications are open.`,
    });
  }

  /** Tell the winning candidate that the store is now assigned to them. */
  async applicationSelected(store: Store, application: StoreApplication): Promise<void> {
    await this.send({
      discordId: application.applicantDiscordId,
      kind: "application_selected",
      storeCode: store.code,
      color: COLORS.selected,
      title: `✅ Selected — ${store.code}`,
      message: `You were selected to manage **${this.storeLabel(store)}**. The store is now assigned to you in the portal.`,
    });
  }

  /** Tell a candidate they were not selected for this store. */
  async applicationNotSelected(store: Store, application: StoreApplication): Promise<void> {
    await this.send({
      discordId: application.applicantDiscordId,
      kind: "application_not_selected",
      storeCode: store.code,
      color: COLORS.removed,
      title: `Not selected — ${store.code}`,
      message: `You were not selected to manage **${this.storeLabel(store)}**. You can still vote in store elections.`,
    });
  }

  /** Tell a candidate that a game owner removed their application. */
  async applicationRemoved(store: Store, application: StoreApplication): Promise<void> {
    await this.send({
      discordId: application.applicantDiscordId,
      kind: "application_removed",
      storeCode: store.code,
      color: COLORS.removed,
      title: `Removed from election — ${store.code}`,
      message: `Your application for **${this.storeLabel(store)}** was removed from the election. You can still vote in store elections.`,
    });
  }
}
