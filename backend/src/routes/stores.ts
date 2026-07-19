import path from "node:path";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RouteDeps } from "../deps.js";
import { isEffectiveAdmin, isEffectiveStoreOwner } from "../auth/plugin.js";
import { badRequest, forbidden, notFound } from "../lib/errors.js";
import { streamDownload } from "../lib/download.js";
import {
  assertAllowedExtension,
  saveMultipartFile,
  versionFilePath,
} from "../services/file-storage.js";
import {
  currentPublishedVersion,
  loadStore,
  loadStoresForUser,
  nextVersionNumber,
  toStoreDetail,
  toStoreSummary,
  toTemplateDto,
  type StoreWithFiles,
} from "../services/store-service.js";

async function requireViewableStore(
  app: FastifyInstance,
  deps: RouteDeps,
  request: FastifyRequest,
  code: string,
): Promise<{ store: StoreWithFiles; isAdmin: boolean; isOwner: boolean }> {
  const store = await loadStore(deps.db, code);
  if (!store) throw notFound("store_not_found");
  const isAdmin = isEffectiveAdmin(app, request);
  const isOwner = isEffectiveStoreOwner(app, request, store);
  return { store, isAdmin, isOwner };
}

async function requireStoreManager(
  app: FastifyInstance,
  deps: RouteDeps,
  request: FastifyRequest,
  code: string,
): Promise<{ store: StoreWithFiles; isAdmin: boolean; isOwner: boolean }> {
  const access = await requireViewableStore(app, deps, request, code);
  if (!access.isAdmin && !access.isOwner) throw forbidden("not_your_store");
  return access;
}

export function registerStoreRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db, config, notifier } = deps;

  app.get("/api/stores", { preHandler: app.authenticate }, async (request) => {
    const isAdmin = isEffectiveAdmin(app, request);
    const stores = await loadStoresForUser(db, request.user, isAdmin);
    return {
      stores: stores.map((store) => toStoreSummary(
        store,
        request.user,
        isAdmin,
        isEffectiveStoreOwner(app, request, store),
      )),
    };
  });

  app.get<{ Params: { code: string } }>(
    "/api/stores/:code",
    { preHandler: app.authenticate },
    async (request) => {
      const { store, isAdmin, isOwner } = await requireViewableStore(app, deps, request, request.params.code);
      const detail = toStoreDetail(store, request.user, isAdmin, isOwner);
      // Only a store owner or game owner can access rebuilding templates.
      if (detail.canViewRestrictedFiles && detail.templates.length === 0) {
        const globals = await db.templateFile.findMany({ where: { storeCode: null }, orderBy: { createdAt: "desc" } });
        detail.templates = globals.map(toTemplateDto);
      }
      return { store: detail };
    },
  );

  // Owner (or admin) uploads a new store file for review.
  app.post<{ Params: { code: string } }>(
    "/api/stores/:code/versions",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { store } = await requireStoreManager(app, deps, request, request.params.code);
      if (store.status !== "OPEN") throw badRequest("store_not_open", "Only open stores can accept uploads");

      const upload = await request.file();
      if (!upload) throw badRequest("no_file", "A file is required");
      const ext = assertAllowedExtension(upload.filename);
      const noteField = upload.fields?.note;
      const note =
        noteField && !Array.isArray(noteField) && noteField.type === "field"
          ? String(noteField.value).slice(0, 1000)
          : null;

      const versionNumber = await nextVersionNumber(db, store);
      // Pre-create the row so the file is named by its stable id, then fill in size/checksum.
      const created = await db.storeVersion.create({
        data: {
          storeCode: store.code,
          versionNumber,
          fileName: upload.filename,
          filePath: "",
          fileSize: 0n,
          uploadedByDiscordId: request.user.sub,
          ...(note ? { note } : {}),
        },
      });

      try {
        const dest = versionFilePath(config, store.code, created.id, ext);
        const saved = await saveMultipartFile(config, upload, dest);
        const version = await db.storeVersion.update({
          where: { id: created.id },
          data: { filePath: saved.filePath, fileSize: BigInt(saved.fileSize), checksum: saved.checksum },
        });
        // Notifications are best-effort and must not fail the upload.
        await notifier.submissionReceived(store, version);
        await notifier.reviewNeeded(store, version);
        return reply.code(201).send({ version: { id: version.id, versionNumber: version.versionNumber, status: version.status } });
      } catch (error) {
        await db.storeVersion.delete({ where: { id: created.id } }).catch(() => undefined);
        throw error;
      }
    },
  );

  // Download a specific submitted version.
  app.get<{ Params: { code: string; id: string } }>(
    "/api/stores/:code/versions/:id/download",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { store } = await requireStoreManager(app, deps, request, request.params.code);
      const version = store.versions.find((v) => v.id === request.params.id);
      if (!version || !version.filePath) throw notFound("version_not_found");
      return streamDownload(reply, version.filePath, version.fileName);
    },
  );

  // Download the current live (published) file.
  app.get<{ Params: { code: string } }>(
    "/api/stores/:code/current/download",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { store } = await requireStoreManager(app, deps, request, request.params.code);
      const current = currentPublishedVersion(store);
      if (!current || !current.filePath) throw notFound("no_current_file");
      return streamDownload(reply, current.filePath, current.fileName);
    },
  );

  // Download a template for rebuilding (store-specific, else global fallback).
  app.get<{ Params: { code: string }; Querystring: { id?: string } }>(
    "/api/stores/:code/template/download",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const { store } = await requireStoreManager(app, deps, request, request.params.code);
      let template = null as Awaited<ReturnType<typeof db.templateFile.findUnique>> | null;
      if (request.query.id) {
        const found = await db.templateFile.findUnique({ where: { id: request.query.id } });
        // A template is downloadable if it belongs to this store or is global.
        if (found && (found.storeCode === null || found.storeCode === store.code)) template = found;
      } else {
        template =
          store.templates[0] ??
          (await db.templateFile.findFirst({ where: { storeCode: null }, orderBy: { createdAt: "desc" } }));
      }
      if (!template) throw notFound("no_template");
      return streamDownload(reply, template.filePath, template.fileName || `template${path.extname(template.filePath)}`);
    },
  );
}
