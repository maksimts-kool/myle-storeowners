import type { ApplicationStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import type { RouteDeps } from "../deps.js";
import { isEffectiveAdmin } from "../auth/plugin.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";

interface CandidateDto {
  id: string;
  displayName: string;
  robloxName: string | null;
  isCurrentUser: boolean;
  voteCount?: number;
}

interface MyApplicationDto {
  id: string;
  storeCode: string;
  storeName: string;
  status: ApplicationStatus;
  createdAt: string;
}

function candidateDto(application: {
  id: string;
  applicantDisplayName: string;
  applicantRobloxName: string | null;
  applicantDiscordId: string;
  votes: { id: string }[];
}, includeVoteCount: boolean, currentDiscordId: string): CandidateDto {
  return {
    id: application.id,
    displayName: application.applicantDisplayName,
    robloxName: application.applicantRobloxName,
    isCurrentUser: application.applicantDiscordId === currentDiscordId,
    ...(includeVoteCount ? { voteCount: application.votes.length } : {}),
  };
}

function myApplicationDto(application: {
  id: string;
  storeCode: string;
  status: ApplicationStatus;
  createdAt: Date;
  store: { displayName: string };
}): MyApplicationDto {
  return {
    id: application.id,
    storeCode: application.storeCode,
    storeName: application.store.displayName,
    status: application.status,
    createdAt: application.createdAt.toISOString(),
  };
}

/** Member-facing election applications and immutable per-store votes. */
export function registerApplicationRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db, notifier, robloxIdentity } = deps;

  app.get("/api/applications/elections", { preHandler: app.authenticate }, async (request) => {
    const isAdmin = isEffectiveAdmin(app, request);
    const [stores, mine, votes] = await Promise.all([
      db.store.findMany({
        where: { status: "ELECTION" },
        include: {
          applications: {
            where: { status: "APPLIED" },
            include: { votes: { select: { id: true } } },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ floor: "asc" }, { code: "asc" }],
      }),
      db.storeApplication.findUnique({
        where: { applicantDiscordId: request.user.sub },
        include: { store: { select: { displayName: true } } },
      }),
      db.electionVote.findMany({
        where: { voterDiscordId: request.user.sub },
        select: { storeCode: true, applicationId: true },
      }),
    ]);
    const votesByStore = new Map(votes.map((vote) => [vote.storeCode, vote.applicationId]));

    return {
      elections: stores.map((store) => ({
        code: store.code,
        displayName: store.displayName,
        floor: store.floor,
        candidates: store.applications.map((application) => candidateDto(application, isAdmin, request.user.sub)),
        myVoteApplicationId: votesByStore.get(store.code) ?? null,
      })),
      myApplication: mine ? myApplicationDto(mine) : null,
      canApply: mine === null,
    };
  });

  // A member can submit exactly one application across the election stores.
  app.post<{ Params: { code: string } }>(
    "/api/applications/elections/:code/apply",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const target = await db.store.findUnique({ where: { code: request.params.code }, select: { code: true } });
      if (!target) throw notFound("store_not_found");

      const isAdmin = isEffectiveAdmin(app, request);
      const member = isAdmin ? null : await robloxIdentity.verifiedMemberForDiscord(request.user.sub);
      if (!isAdmin && !member) throw forbidden("not_verified");

      try {
        const result = await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${target.code} FOR UPDATE`;
          const store = await tx.store.findUnique({ where: { code: target.code } });
          if (!store) throw notFound("store_not_found");
          if (store.status !== "ELECTION") throw badRequest("election_closed", "Applications are not open for this store");
          if (store.ownerDiscordId) throw badRequest("store_already_assigned", "This store already has an owner");
          const existing = await tx.storeApplication.findUnique({ where: { applicantDiscordId: request.user.sub } });
          if (existing) {
            throw conflict("application_already_used", "You have already used your one election application and can still vote");
          }
          // A candidate may not retain a vote in the election they are entering.
          await tx.electionVote.deleteMany({
            where: { storeCode: store.code, voterDiscordId: request.user.sub },
          });
          const application = await tx.storeApplication.create({
            data: {
              storeCode: store.code,
              applicantDiscordId: request.user.sub,
              applicantDisplayName: member?.discordName ?? request.user.globalName ?? request.user.username,
              applicantRobloxName: member?.robloxUsername ?? null,
            },
          });
          return { store, application };
        });
        await notifier.applicationApplied(result.store, result.application);
        return reply.code(201).send({ application: myApplicationDto({ ...result.application, store: { displayName: result.store.displayName } }) });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          throw conflict("application_already_used", "You have already used your one election application and can still vote");
        }
        throw error;
      }
    },
  );

  // Cancelling blocks further applications while this application record exists.
  app.delete("/api/applications/mine", { preHandler: app.authenticate }, async (request) => {
    await db.$transaction(async (tx) => {
      const initial = await tx.storeApplication.findUnique({ where: { applicantDiscordId: request.user.sub } });
      if (!initial) throw notFound("application_not_found");
      await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${initial.storeCode} FOR UPDATE`;
      const application = await tx.storeApplication.findUnique({ where: { id: initial.id } });
      if (!application) throw notFound("application_not_found");
      if (application.status !== "APPLIED") {
        throw badRequest("application_not_cancellable", "Only an active application can be cancelled");
      }
      await tx.storeApplication.update({
        where: { id: application.id },
        data: { status: "CANCELLED", resolvedAt: new Date() },
      });
    });
    return { ok: true };
  });

  // A vote is bound to a store as well as its candidate. Applicants cannot
  // influence the election for the store they applied to, including themselves.
  app.post<{ Params: { id: string } }>(
    "/api/applications/:id/vote",
    { preHandler: app.authenticate },
    async (request, reply) => {
      const isAdmin = isEffectiveAdmin(app, request);
      const member = isAdmin ? null : await robloxIdentity.verifiedMemberForDiscord(request.user.sub);
      if (!isAdmin && !member) throw forbidden("not_verified");

      try {
        const result = await db.$transaction(async (tx) => {
          const initial = await tx.storeApplication.findUnique({ where: { id: request.params.id } });
          if (!initial) throw notFound("application_not_found");
          await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${initial.storeCode} FOR UPDATE`;
          const candidate = await tx.storeApplication.findUnique({
            where: { id: initial.id },
            include: { store: true },
          });
          if (!candidate) throw notFound("application_not_found");
          if (candidate.status !== "APPLIED" || candidate.store.status !== "ELECTION") {
            throw badRequest("candidate_not_active", "This candidate is no longer in an active election");
          }
          if (candidate.applicantDiscordId === request.user.sub) {
            throw forbidden("cannot_vote_for_self", "You cannot vote for your own application");
          }
          const myApplication = await tx.storeApplication.findUnique({
            where: { applicantDiscordId: request.user.sub },
            select: { storeCode: true, status: true },
          });
          if (myApplication?.status === "APPLIED" && myApplication.storeCode === candidate.storeCode) {
            throw forbidden("cannot_vote_in_own_election", "You cannot vote in the election for the store you applied to");
          }
          await tx.electionVote.create({
            data: {
              storeCode: candidate.storeCode,
              applicationId: candidate.id,
              voterDiscordId: request.user.sub,
            },
          });
          return candidate;
        });
        return reply.code(201).send({ ok: true, storeCode: result.storeCode, applicationId: result.id });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          throw conflict("vote_already_cast", "You have already voted in this store election");
        }
        throw error;
      }
    },
  );

  // A voter may withdraw their one vote, then choose another active candidate.
  app.delete<{ Params: { code: string } }>(
    "/api/applications/elections/:code/vote",
    { preHandler: app.authenticate },
    async (request) => {
      const isAdmin = isEffectiveAdmin(app, request);
      const member = isAdmin ? null : await robloxIdentity.verifiedMemberForDiscord(request.user.sub);
      if (!isAdmin && !member) throw forbidden("not_verified");

      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${request.params.code} FOR UPDATE`;
        const store = await tx.store.findUnique({ where: { code: request.params.code }, select: { status: true } });
        if (!store) throw notFound("store_not_found");
        if (store.status !== "ELECTION") throw badRequest("election_closed", "Voting is not open for this store");
        const deleted = await tx.electionVote.deleteMany({
          where: { storeCode: request.params.code, voterDiscordId: request.user.sub },
        });
        if (deleted.count === 0) throw notFound("vote_not_found");
      });
      return { ok: true };
    },
  );
}

/** Game-owner dashboard data and application resolution actions. */
export function registerAdminApplicationRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db, notifier } = deps;
  const admin = { preHandler: app.requireEffectiveAdmin };

  app.get("/api/admin/applications", admin, async () => {
    const applications = await db.storeApplication.findMany({
      include: {
        store: { select: { code: true, displayName: true, status: true } },
        _count: { select: { votes: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    return {
      applications: applications.map((application) => ({
        id: application.id,
        storeCode: application.store.code,
        storeName: application.store.displayName,
        storeStatus: application.store.status,
        applicantDiscordId: application.applicantDiscordId,
        applicantDisplayName: application.applicantDisplayName,
        applicantRobloxName: application.applicantRobloxName,
        status: application.status,
        voteCount: application._count.votes,
        createdAt: application.createdAt.toISOString(),
      })),
    };
  });

  app.post<{ Params: { id: string } }>("/api/admin/applications/:id/select", admin, async (request) => {
    const result = await db.$transaction(async (tx) => {
      const initial = await tx.storeApplication.findUnique({ where: { id: request.params.id } });
      if (!initial) throw notFound("application_not_found");
      await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${initial.storeCode} FOR UPDATE`;
      const application = await tx.storeApplication.findUnique({ where: { id: initial.id }, include: { store: true } });
      if (!application) throw notFound("application_not_found");
      if (application.status !== "APPLIED" || application.store.status !== "ELECTION") {
        throw badRequest("application_not_active", "Only an active application in an active election can be selected");
      }

      const now = new Date();
      const notSelected = await tx.storeApplication.findMany({
        where: { storeCode: application.storeCode, status: "APPLIED", id: { not: application.id } },
      });
      const selected = await tx.storeApplication.update({
        where: { id: application.id },
        data: { status: "SELECTED", resolvedAt: now, resolvedByDiscordId: request.user.sub },
      });
      await tx.storeApplication.updateMany({
        where: { storeCode: application.storeCode, status: "APPLIED", id: { not: application.id } },
        data: { status: "NOT_SELECTED", resolvedAt: now, resolvedByDiscordId: request.user.sub },
      });
      const store = await tx.store.update({
        where: { code: application.storeCode },
        data: {
          status: "OPEN",
          ownerDiscordId: selected.applicantDiscordId,
          ownerDisplayName: selected.applicantRobloxName ?? selected.applicantDisplayName,
        },
      });
      return { store, selected, notSelected };
    });
    await notifier.applicationSelected(result.store, result.selected);
    for (const application of result.notSelected) await notifier.applicationNotSelected(result.store, application);
    return { ok: true };
  });

  const markNotSelected = async (request: { params: { id: string }; user: { sub: string } }) => {
    const result = await db.$transaction(async (tx) => {
      const initial = await tx.storeApplication.findUnique({ where: { id: request.params.id } });
      if (!initial) throw notFound("application_not_found");
      await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${initial.storeCode} FOR UPDATE`;
      const application = await tx.storeApplication.findUnique({ where: { id: initial.id }, include: { store: true } });
      if (!application) throw notFound("application_not_found");
      if (application.status !== "APPLIED" || application.store.status !== "ELECTION") {
        throw badRequest("application_not_active", "Only an active application in an active election can be marked not selected");
      }
      const updated = await tx.storeApplication.update({
        where: { id: application.id },
        data: { status: "NOT_SELECTED", resolvedAt: new Date(), resolvedByDiscordId: request.user.sub },
      });
      return { store: application.store, application: updated };
    });
    await notifier.applicationNotSelected(result.store, result.application);
    return { ok: true };
  };

  app.post<{ Params: { id: string } }>("/api/admin/applications/:id/not-selected", admin, markNotSelected);

  // Remove deletes the visible application and every vote attached to it. Once
  // deleted, the user has no application record and may apply again.
  app.post<{ Params: { id: string } }>("/api/admin/applications/:id/remove", admin, async (request) => {
    const result = await db.$transaction(async (tx) => {
      const initial = await tx.storeApplication.findUnique({ where: { id: request.params.id } });
      if (!initial) throw notFound("application_not_found");
      await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${initial.storeCode} FOR UPDATE`;
      const application = await tx.storeApplication.findUnique({ where: { id: initial.id }, include: { store: true } });
      if (!application) throw notFound("application_not_found");
      if (application.status === "SELECTED") {
        throw badRequest("application_not_removable", "The selected store owner cannot be removed as an application");
      }
      await tx.storeApplication.delete({ where: { id: application.id } });
      return { store: application.store, application };
    });
    await notifier.applicationRemoved(result.store, result.application);
    return { ok: true };
  });
}
