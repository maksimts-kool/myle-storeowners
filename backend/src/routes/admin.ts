import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import type { Store, StoreVersion } from "@prisma/client";
import type { RouteDeps } from "../deps.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import {
  assertAllowedExtension,
  deleteFile,
  deleteStoreDirectory,
  saveMultipartFile,
  templateFilePath,
} from "../services/file-storage.js";
import { roomSchema } from "../services/room.js";
import { floorForCode, loadStore, toStoreDetail, toTemplateDto } from "../services/store-service.js";

const discordId = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .refine((v) => v === null || /^\d{5,25}$/.test(v), "Invalid Discord ID");

const creationDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid creation date").refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Use a valid creation date");

function storeIdentifier(code: string, version: number, date: string): string {
  const yymmdd = `${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}`;
  return `${code}.${String(version).padStart(3, "0")}.${yymmdd}`;
}

/** Keep a store's original identifier date while its live version changes. */
function storeIdentifierForPublishedVersion(store: Store, versionNumber: number): string {
  const existingDate = store.storeIdentifier?.match(/^[^.]+\.\d{1,3}\.(\d{6})$/)?.[1];
  if (existingDate) return `${store.code}.${String(versionNumber).padStart(3, "0")}.${existingDate}`;
  const date = store.createdAt;
  const fallbackDate = `${String(date.getFullYear()).slice(-2)}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  return `${store.code}.${String(versionNumber).padStart(3, "0")}.${fallbackDate}`;
}

// `null` clears a stored room layout; omitting the field leaves it untouched.
const roomInput = roomSchema.nullable();

/** Prisma needs DbNull (not null) to clear a nullable Json column. */
function roomValue(room: z.infer<typeof roomInput>): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return room === null ? Prisma.DbNull : (room as Prisma.InputJsonValue);
}

// Floor and display name are derived automatically (from the code). The initial
// identifier is generated from the store code, version and creation date.
const createStoreSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,16}$/, "Code must be 1-16 letters, digits, - or _"),
  floor: z.coerce.number().int().min(1).max(10).optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  ownerDiscordId: discordId.optional(),
  initialVersion: z.coerce.number().int().min(1).max(999, "Version must be between 1 and 999"),
  creationDate,
  room: roomInput.optional(),
});

const updateStoreSchema = z.object({
  floor: z.coerce.number().int().min(1).max(10).optional(),
  displayName: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["OPEN", "CLOSED"]).optional(),
  ownerDiscordId: discordId.optional(),
  initialVersion: z.coerce.number().int().min(1).max(999, "Version must be between 1 and 999").optional(),
  creationDate: creationDate.optional(),
  room: roomInput.optional(),
}).superRefine((input, context) => {
  if ((input.initialVersion === undefined) !== (input.creationDate === undefined)) {
    context.addIssue({
      code: "custom",
      message: "Version and creation date must be provided together",
      path: [input.initialVersion === undefined ? "initialVersion" : "creationDate"],
    });
  }
});

const reviewSchema = z.object({ reviewNote: z.string().trim().max(1000).optional() });

async function loadVersionInStore(deps: RouteDeps, code: string, id: string): Promise<{ store: Store; version: StoreVersion }> {
  const version = await deps.db.storeVersion.findFirst({ where: { id, storeCode: code }, include: { store: true } });
  if (!version) throw notFound("version_not_found");
  const { store, ...rest } = version;
  return { store, version: rest as StoreVersion };
}

export function registerAdminRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db, config, notifier, robloxIdentity } = deps;
  const admin = { preHandler: app.requireAdmin };

  // The portal never accepts a typed Discord ID. It receives the bot's list of
  // Bloxlink-verified members that are still in the configured Discord server.
  app.get("/api/admin/verified-members", admin, async () => ({
    members: await robloxIdentity.verifiedMembers(),
  }));

  // In-flight submission queue: everything not yet live and not declined, so an
  // approved build stays visible until it is actually published to the game.
  app.get("/api/admin/pending", admin, async () => {
    const pending = await db.storeVersion.findMany({
      where: { status: { in: ["PENDING", "APPROVED"] } },
      include: { store: true },
      orderBy: { createdAt: "asc" },
    });
    return {
      pending: pending.map((v) => ({
        id: v.id,
        storeCode: v.storeCode,
        storeName: v.store.displayName,
        versionNumber: v.versionNumber,
        status: v.status,
        fileName: v.fileName,
        fileSize: Number(v.fileSize),
        note: v.note,
        uploadedByDiscordId: v.uploadedByDiscordId,
        createdAt: v.createdAt.toISOString(),
      })),
    };
  });

  // Create a new store.
  app.post("/api/admin/stores", admin, async (request, reply) => {
    const input = createStoreSchema.parse(request.body);
    const existing = await db.store.findUnique({ where: { code: input.code } });
    if (existing) throw conflict("store_exists", `Store ${input.code} already exists`);
    const owner = input.ownerDiscordId
      ? await robloxIdentity.verifiedMemberForDiscord(input.ownerDiscordId)
      : null;
    if (input.ownerDiscordId && !owner) throw badRequest("owner_not_verified", "Select a verified member from the list");
    await db.store.create({
      data: {
        code: input.code,
        floor: input.floor ?? floorForCode(input.code),
        displayName: input.displayName ?? `Store ${input.code}`,
        status: input.status ?? "OPEN",
        ownerDiscordId: input.ownerDiscordId ?? null,
        ownerDisplayName: owner?.robloxUsername ?? owner?.discordName ?? null,
        storeIdentifier: storeIdentifier(input.code, input.initialVersion, input.creationDate),
        startingVersion: input.initialVersion,
        room: roomValue(input.room ?? null),
      },
    });
    const store = await loadStore(db, input.code);
    return reply.code(201).send({ store: toStoreDetail(store!, request.user, true) });
  });

  // Edit a store (any field).
  app.patch<{ Params: { code: string } }>("/api/admin/stores/:code", admin, async (request) => {
    const input = updateStoreSchema.parse(request.body);
    const store = await db.store.findUnique({ where: { code: request.params.code } });
    if (!store) throw notFound("store_not_found");
    const isCreatingIdentifier = input.initialVersion !== undefined;
    if (isCreatingIdentifier && store.storeIdentifier) {
      throw badRequest("store_identifier_exists", "This store already has an identifier");
    }
    if (isCreatingIdentifier) {
      const existingVersion = await db.storeVersion.findFirst({ where: { storeCode: store.code }, select: { id: true } });
      if (existingVersion) {
        throw badRequest("store_identifier_locked", "Set the store identifier before the first file is uploaded");
      }
    }
    const owner = input.ownerDiscordId && input.ownerDiscordId !== null
      ? await robloxIdentity.verifiedMemberForDiscord(input.ownerDiscordId)
      : null;
    if (input.ownerDiscordId && !owner) throw badRequest("owner_not_verified", "Select a verified member from the list");
    const ownerDisplayName = input.ownerDiscordId === undefined
      ? undefined
      : input.ownerDiscordId === null
        ? null
        : owner!.robloxUsername ?? owner!.discordName;
    await db.store.update({
      where: { code: store.code },
      data: {
        ...(input.floor !== undefined ? { floor: input.floor } : {}),
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.ownerDiscordId !== undefined ? { ownerDiscordId: input.ownerDiscordId } : {}),
        ...(ownerDisplayName !== undefined ? { ownerDisplayName } : {}),
        ...(input.room !== undefined ? { room: roomValue(input.room) } : {}),
        ...(isCreatingIdentifier
          ? {
              storeIdentifier: storeIdentifier(store.code, input.initialVersion!, input.creationDate!),
              startingVersion: input.initialVersion!,
            }
          : {}),
      },
    });
    const updated = await loadStore(db, store.code);
    return { store: toStoreDetail(updated!, request.user, true) };
  });

  // Delete a store, its rows (cascade), and its files on disk.
  app.delete<{ Params: { code: string } }>("/api/admin/stores/:code", admin, async (request) => {
    const store = await db.store.findUnique({ where: { code: request.params.code } });
    if (!store) throw notFound("store_not_found");
    await db.store.delete({ where: { code: store.code } });
    await deleteStoreDirectory(config, store.code);
    return { ok: true };
  });

  // Review actions.
  const applyReview = async (
    request: FastifyRequest<{ Params: { code: string; id: string } }>,
    status: StoreVersion["status"],
  ): Promise<{ store: Store; version: StoreVersion }> => {
    const parsed = reviewSchema.parse(request.body ?? {});
    const { store, version } = await loadVersionInStore(deps, request.params.code, request.params.id);
    if (version.status === "PUBLISHED") {
      throw badRequest("live_version_locked", "Publish a replacement before changing the live file");
    }
    const updated = await db.storeVersion.update({
      where: { id: version.id },
      data: {
        status,
        reviewedByDiscordId: request.user.sub,
        ...(parsed.reviewNote !== undefined ? { reviewNote: parsed.reviewNote } : {}),
      },
    });
    return { store, version: updated };
  };

  app.post<{ Params: { code: string; id: string } }>("/api/admin/stores/:code/versions/:id/approve", admin, async (request) => {
    const { store, version } = await applyReview(request, "APPROVED");
    await notifier.submissionApproved(store, version);
    return { version: { id: version.id, status: version.status } };
  });

  app.post<{ Params: { code: string; id: string } }>("/api/admin/stores/:code/versions/:id/decline", admin, async (request) => {
    const { store, version } = await applyReview(request, "DECLINED");
    await notifier.submissionDeclined(store, version, version.reviewNote);
    return { version: { id: version.id, status: version.status } };
  });

  app.post<{ Params: { code: string; id: string } }>("/api/admin/stores/:code/versions/:id/publish", admin, async (request) => {
    const parsed = reviewSchema.parse(request.body ?? {});
    const { store, version } = await loadVersionInStore(deps, request.params.code, request.params.id);
    const published = await db.$transaction(async (tx) => {
      // Serialise publications for a store. This lock ensures two concurrent
      // publish requests cannot leave two versions marked as live.
      await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${store.code} FOR UPDATE`;
      const currentStore = await tx.store.findUniqueOrThrow({ where: { code: store.code } });
      await tx.storeVersion.updateMany({
        where: { storeCode: store.code, status: "PUBLISHED", id: { not: version.id } },
        data: { status: "SUPERSEDED" },
      });
      const updated = await tx.storeVersion.update({
        where: { id: version.id },
        data: {
          status: "PUBLISHED",
          reviewedByDiscordId: request.user.sub,
          ...(parsed.reviewNote !== undefined ? { reviewNote: parsed.reviewNote } : {}),
        },
      });
      await tx.store.update({
        where: { code: store.code },
        data: {
          storeIdentifier: storeIdentifierForPublishedVersion(currentStore, updated.versionNumber),
          startingVersion: Math.max(currentStore.startingVersion, updated.versionNumber),
        },
      });
      return updated;
    });
    await notifier.submissionPublished(store, published);
    return { version: { id: published.id, status: published.status } };
  });

  // Remove a historical upload and its stored file. The current live file is
  // protected: publish a replacement first so the store never loses its live build.
  app.delete<{ Params: { code: string; id: string } }>("/api/admin/stores/:code/versions/:id", admin, async (request) => {
    const { version } = await loadVersionInStore(deps, request.params.code, request.params.id);
    if (version.status === "PUBLISHED") {
      throw badRequest("live_version_cannot_be_deleted", "Publish a replacement before removing the live file");
    }
    await db.storeVersion.delete({ where: { id: version.id } });
    if (version.filePath) await deleteFile(version.filePath);
    return { ok: true };
  });

  // Upload a template (store-specific).
  app.post<{ Params: { code: string } }>("/api/admin/stores/:code/template", admin, async (request, reply) => {
    const store = await db.store.findUnique({ where: { code: request.params.code } });
    if (!store) throw notFound("store_not_found");
    return uploadTemplate(deps, request, reply, store.code);
  });

  // Upload a global template (applies to any store without its own).
  app.post("/api/admin/templates", admin, async (request, reply) => {
    return uploadTemplate(deps, request, reply, null);
  });

  // Delete a template.
  app.delete<{ Params: { id: string } }>("/api/admin/templates/:id", admin, async (request) => {
    const template = await db.templateFile.findUnique({ where: { id: request.params.id } });
    if (!template) throw notFound("template_not_found");
    await db.templateFile.delete({ where: { id: template.id } });
    await deleteFile(template.filePath);
    return { ok: true };
  });
}

async function uploadTemplate(
  deps: RouteDeps,
  request: FastifyRequest,
  reply: import("fastify").FastifyReply,
  storeCode: string | null,
) {
  const upload = await request.file();
  if (!upload) throw badRequest("no_file", "A file is required");
  const ext = assertAllowedExtension(upload.filename);
  const created = await deps.db.templateFile.create({
    data: { storeCode, fileName: upload.filename, filePath: "", fileSize: 0n, uploadedByDiscordId: request.user.sub },
  });
  try {
    const dest = templateFilePath(deps.config, storeCode, created.id, ext);
    const saved = await saveMultipartFile(deps.config, upload, dest);
    const template = await deps.db.templateFile.update({
      where: { id: created.id },
      data: { filePath: saved.filePath, fileSize: BigInt(saved.fileSize) },
    });
    return reply.code(201).send({ template: toTemplateDto(template) });
  } catch (error) {
    await deps.db.templateFile.delete({ where: { id: created.id } }).catch(() => undefined);
    throw error;
  }
}
