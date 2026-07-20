import type { ApplicationStatus } from "@prisma/client";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { RouteDeps } from "../deps.js";
import { isEffectiveAdmin } from "../auth/plugin.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import {
  advanceElections,
  applicationsOpen,
  assignStoreWinner,
  electionPhase,
  nextDeadline,
  votingOpen,
} from "../services/election-service.js";

interface CandidateDto {
  id: string;
  displayName: string;
  robloxName: string | null;
  isCurrentUser: boolean;
  voteCount: number;
}

interface MyApplicationDto {
  id: string;
  electionId: string | null;
  storeCode: string;
  storeName: string;
  status: ApplicationStatus;
  createdAt: string;
}

// Vote counts are public throughout the round.
function candidateDto(application: {
  id: string;
  applicantDisplayName: string;
  applicantRobloxName: string | null;
  applicantDiscordId: string;
  votes: { id: string }[];
}, currentDiscordId: string): CandidateDto {
  return {
    id: application.id,
    displayName: application.applicantDisplayName,
    robloxName: application.applicantRobloxName,
    isCurrentUser: application.applicantDiscordId === currentDiscordId,
    voteCount: application.votes.length,
  };
}

function myApplicationDto(application: {
  id: string;
  electionId: string | null;
  storeCode: string;
  status: ApplicationStatus;
  createdAt: Date;
  store: { displayName: string };
}): MyApplicationDto {
  return {
    id: application.id,
    electionId: application.electionId,
    storeCode: application.storeCode,
    storeName: application.store.displayName,
    status: application.status,
    createdAt: application.createdAt.toISOString(),
  };
}
/**
 * Member-facing election applications and votes. Every action is gated by the
 * round's own windows, so nothing here depends on an admin flipping a status.
 */
export function registerApplicationRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db, notifier, robloxIdentity } = deps;

  /** The single running round a store is contested in, if any. */
  async function runningElectionForStore(storeCode: string) {
    const row = await db.electionStore.findFirst({
      where: { storeCode, election: { status: "RUNNING" } },
      include: { election: true },
    });
    return row?.election ?? null;
  }

  /** Members must be Bloxlink-verified; admins act without a linked account. */
  async function assertParticipant(request: FastifyRequest): Promise<void> {
    if (isEffectiveAdmin(app, request)) return;
    const member = await robloxIdentity.verifiedMemberForDiscord(request.user.sub);
    if (!member) throw forbidden("not_verified");
  }

  app.get("/api/applications/elections", { preHandler: app.authenticate }, async (request) => {
    await advanceElections(db, app.log);
    const now = new Date();
    const [elections, myApplications, votes] = await Promise.all([
      db.election.findMany({
        where: { status: { in: ["SCHEDULED", "RUNNING", "TALLYING"] } },
        include: {
          stores: {
            include: {
              store: {
                select: {
                  code: true,
                  displayName: true,
                  floor: true,
                  applications: {
                    where: { status: { in: ["APPLIED", "SELECTED"] } },
                    include: { votes: { select: { id: true } } },
                    orderBy: { createdAt: "asc" },
                  },
                },
              },
            },
            orderBy: { storeCode: "asc" },
          },
        },
        orderBy: { applicationsOpenAt: "asc" },
      }),
      db.storeApplication.findMany({
        where: { applicantDiscordId: request.user.sub },
        include: { store: { select: { displayName: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.electionVote.findMany({
        where: { voterDiscordId: request.user.sub },
        select: { storeCode: true, electionId: true, applicationId: true },
      }),
    ]);

    const voteKey = (electionId: string | null, storeCode: string) => `${electionId ?? ""}:${storeCode}`;
    const votesByStore = new Map(votes.map((vote) => [voteKey(vote.electionId, vote.storeCode), vote.applicationId]));

    return {
      elections: elections.map((election) => {
        const mine = myApplications.find((application) => application.electionId === election.id) ?? null;
        const canApplyHere = applicationsOpen(election, now) && mine === null;
        const deadline = nextDeadline(election, now);
        return {
          id: election.id,
          title: election.title,
          note: election.note,
          status: election.status,
          phase: electionPhase(election, now),
          applicationsOpenAt: election.applicationsOpenAt.toISOString(),
          applicationsCloseAt: election.applicationsCloseAt.toISOString(),
          votingOpensAt: election.votingOpensAt.toISOString(),
          votingClosesAt: election.votingClosesAt.toISOString(),
          nextDeadline: deadline ? deadline.toISOString() : null,
          canApply: canApplyHere,
          canVote: votingOpen(election, now),
          myApplication: mine ? myApplicationDto(mine) : null,
          stores: election.stores.map((row) => ({
            code: row.storeCode,
            displayName: row.store.displayName,
            floor: row.store.floor,
            winnerApplicationId: row.winnerApplicationId,
            candidates: row.store.applications
              .filter((application) => application.electionId === election.id)
              .map((application) => candidateDto(application, request.user.sub)),
            myVoteApplicationId: votesByStore.get(voteKey(election.id, row.storeCode)) ?? null,
          })),
        };
      }),
    };
  });

  // One application per member per round, for one store.
  app.post<{ Params: { code: string } }>(
    "/api/applications/elections/:code/apply",
    { preHandler: app.authenticate },
    async (request, reply) => {
      await assertParticipant(request);
      const election = await runningElectionForStore(request.params.code);
      if (!election) throw badRequest("election_closed", "This store is not in a running election");
      if (!applicationsOpen(election)) throw badRequest("applications_closed", "Applications for this election are closed");

      try {
        const result = await db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${request.params.code} FOR UPDATE`;
          const store = await tx.store.findUnique({ where: { code: request.params.code } });
          if (!store) throw notFound("store_not_found");
          if (store.ownerDiscordId) throw badRequest("store_already_assigned", "This store already has an owner");
          const existing = await tx.storeApplication.findFirst({
            where: { electionId: election.id, applicantDiscordId: request.user.sub },
          });
          if (existing) {
            throw conflict("application_already_used", "You have already applied in this election");
          }
          // A candidate may not retain a vote in the election they are entering.
          await tx.electionVote.deleteMany({
            where: { electionId: election.id, storeCode: store.code, voterDiscordId: request.user.sub },
          });
          const member = await robloxIdentity.verifiedMemberForDiscord(request.user.sub);
          const application = await tx.storeApplication.create({
            data: {
              storeCode: store.code,
              electionId: election.id,
              applicantDiscordId: request.user.sub,
              applicantDisplayName: member?.discordName ?? request.user.globalName ?? request.user.username,
              applicantRobloxName: member?.robloxUsername ?? null,
            },
          });
          return { store, application };
        });
        await notifier.applicationApplied(result.store, result.application);
        return reply.code(201).send({
          application: myApplicationDto({ ...result.application, store: { displayName: result.store.displayName } }),
        });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          throw conflict("application_already_used", "You have already applied in this election");
        }
        throw error;
      }
    },
  );

  // Withdrawing frees the member to apply for another store while applications
  // are still open.
  app.delete<{ Params: { id: string } }>("/api/applications/mine/:id", { preHandler: app.authenticate }, async (request) => {
    await db.$transaction(async (tx) => {
      const application = await tx.storeApplication.findUnique({
        where: { id: request.params.id },
        include: { election: true },
      });
      if (!application || application.applicantDiscordId !== request.user.sub) throw notFound("application_not_found");
      if (application.status !== "APPLIED") {
        throw badRequest("application_not_cancellable", "Only an active application can be withdrawn");
      }
      if (application.election && !applicationsOpen(application.election)) {
        throw badRequest("applications_closed", "Applications for this election have closed");
      }
      // Deleted rather than kept as CANCELLED so the member can apply again in
      // this round; the vote rows attached to it go with it.
      await tx.storeApplication.delete({ where: { id: application.id } });
    });
    return { ok: true };
  });

  // One vote per store per round, changeable while voting is open.
  app.post<{ Params: { id: string } }>(
    "/api/applications/:id/vote",
    { preHandler: app.authenticate },
    async (request, reply) => {
      await assertParticipant(request);
      try {
        const result = await db.$transaction(async (tx) => {
          const initial = await tx.storeApplication.findUnique({ where: { id: request.params.id } });
          if (!initial) throw notFound("application_not_found");
          await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${initial.storeCode} FOR UPDATE`;
          const candidate = await tx.storeApplication.findUnique({
            where: { id: initial.id },
            include: { store: true, election: true },
          });
          if (!candidate) throw notFound("application_not_found");
          if (candidate.status !== "APPLIED") {
            throw badRequest("candidate_not_active", "This candidate is no longer standing");
          }
          if (!candidate.election || !votingOpen(candidate.election)) {
            throw badRequest("voting_closed", "Voting is not open for this election");
          }
          if (candidate.applicantDiscordId === request.user.sub) {
            throw forbidden("cannot_vote_for_self", "You cannot vote for your own application");
          }
          const myApplication = await tx.storeApplication.findFirst({
            where: { electionId: candidate.electionId, applicantDiscordId: request.user.sub, status: "APPLIED" },
            select: { storeCode: true },
          });
          if (myApplication?.storeCode === candidate.storeCode) {
            throw forbidden("cannot_vote_in_own_election", "You cannot vote for the store you applied to");
          }
          await tx.electionVote.create({
            data: {
              storeCode: candidate.storeCode,
              electionId: candidate.electionId,
              applicationId: candidate.id,
              voterDiscordId: request.user.sub,
            },
          });
          return candidate;
        });
        return reply.code(201).send({ ok: true, storeCode: result.storeCode, applicationId: result.id });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") {
          throw conflict("vote_already_cast", "You have already voted for this store");
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: { code: string } }>(
    "/api/applications/elections/:code/vote",
    { preHandler: app.authenticate },
    async (request) => {
      await assertParticipant(request);
      const election = await runningElectionForStore(request.params.code);
      if (!election || !votingOpen(election)) throw badRequest("voting_closed", "Voting is not open for this store");
      const deleted = await db.electionVote.deleteMany({
        where: { electionId: election.id, storeCode: request.params.code, voterDiscordId: request.user.sub },
      });
      if (deleted.count === 0) throw notFound("vote_not_found");
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
        election: { select: { id: true, title: true, status: true } },
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
        electionId: application.election?.id ?? null,
        electionTitle: application.election?.title ?? null,
        electionStatus: application.election?.status ?? null,
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
    const result = await assignStoreWinner(db, request.params.id, request.user.sub);
    await notifier.applicationSelected(result.store, result.selected);
    for (const application of result.notSelected) await notifier.applicationNotSelected(result.store, application);
    return { ok: true };
  });

  const markNotSelected = async (request: { params: { id: string }; user: { sub: string } }) => {
    const result = await db.$transaction(async (tx) => {
      const initial = await tx.storeApplication.findUnique({ where: { id: request.params.id } });
      if (!initial) throw notFound("application_not_found");
      await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${initial.storeCode} FOR UPDATE`;
      const application = await tx.storeApplication.findUnique({
        where: { id: initial.id },
        include: { store: true, election: true },
      });
      if (!application) throw notFound("application_not_found");
      if (application.status !== "APPLIED") {
        throw badRequest("application_not_active", "Only an active application can be marked not selected");
      }
      if (application.election && !["RUNNING", "TALLYING"].includes(application.election.status)) {
        throw badRequest("election_not_active", "This election is no longer running");
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
