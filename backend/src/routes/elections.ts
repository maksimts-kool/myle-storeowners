import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { Election, ElectionStatus, ElectionStore, Store } from "@prisma/client";
import type { RouteDeps } from "../deps.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import {
  advanceElections,
  assignStoreWinner,
  cancelElection,
  closeElection,
  electionPhase,
  electionResults,
  nextDeadline,
  type StoreResult,
} from "../services/election-service.js";

/** A round that still holds stores hostage; a store may only be in one of these. */
const LIVE_STATUSES: ElectionStatus[] = ["DRAFT", "SCHEDULED", "RUNNING", "TALLYING"];

const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Use a valid date and time");

const windowSchema = z.object({
  applicationsOpenAt: isoDate,
  applicationsCloseAt: isoDate,
  votingOpensAt: isoDate,
  votingClosesAt: isoDate,
});

const createSchema = windowSchema.extend({
  title: z.string().trim().min(1).max(120),
  note: z.string().trim().max(1000).optional(),
  storeCodes: z.array(z.string().trim().min(1)).min(1, "Pick at least one store"),
  publish: z.boolean().optional(),
});

const updateSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  note: z.string().trim().max(1000).nullable().optional(),
  applicationsOpenAt: isoDate.optional(),
  applicationsCloseAt: isoDate.optional(),
  votingOpensAt: isoDate.optional(),
  votingClosesAt: isoDate.optional(),
  storeCodes: z.array(z.string().trim().min(1)).min(1).optional(),
});

interface Windows {
  applicationsOpenAt: Date;
  applicationsCloseAt: Date;
  votingOpensAt: Date;
  votingClosesAt: Date;
}

/**
 * The windows may overlap (voting while applications are still open) but they
 * may never run backwards, and voting cannot end before it starts.
 */
function assertValidWindows(w: Windows): void {
  if (w.applicationsCloseAt <= w.applicationsOpenAt) {
    throw badRequest("invalid_window", "Applications must close after they open");
  }
  if (w.votingClosesAt <= w.votingOpensAt) {
    throw badRequest("invalid_window", "Voting must close after it opens");
  }
  if (w.votingOpensAt < w.applicationsOpenAt) {
    throw badRequest("invalid_window", "Voting cannot open before applications do");
  }
  if (w.votingClosesAt < w.applicationsCloseAt) {
    throw badRequest("invalid_window", "Voting cannot close before applications do");
  }
}

/** Stores must exist, be unowned, and not already be booked by another round. */
async function assertStoresAvailable(deps: RouteDeps, codes: string[], exceptElectionId?: string): Promise<void> {
  const unique = [...new Set(codes)];
  const stores = await deps.db.store.findMany({ where: { code: { in: unique } } });
  const missing = unique.filter((code) => !stores.some((store) => store.code === code));
  if (missing.length > 0) throw badRequest("store_not_found", `Unknown store: ${missing.join(", ")}`);
  const owned = stores.filter((store) => store.ownerDiscordId);
  if (owned.length > 0) {
    throw badRequest("store_has_owner", `A store with an owner cannot be contested: ${owned.map((s) => s.code).join(", ")}`);
  }
  const booked = await deps.db.electionStore.findMany({
    where: {
      storeCode: { in: unique },
      election: { status: { in: LIVE_STATUSES } },
      ...(exceptElectionId ? { electionId: { not: exceptElectionId } } : {}),
    },
    include: { election: { select: { title: true } } },
  });
  if (booked.length > 0) {
    throw conflict("store_in_election", `Already in “${booked[0]!.election.title}”: ${booked.map((s) => s.storeCode).join(", ")}`);
  }
}

type ElectionRow = Election & {
  stores: (ElectionStore & { store: Pick<Store, "code" | "displayName" | "floor" | "status"> })[];
  _count: { applications: number; votes: number };
};

function electionDto(election: ElectionRow, results: StoreResult[] | null) {
  const now = new Date();
  const deadline = nextDeadline(election, now);
  return {
    id: election.id,
    title: election.title,
    status: election.status,
    phase: electionPhase(election, now),
    note: election.note,
    applicationsOpenAt: election.applicationsOpenAt.toISOString(),
    applicationsCloseAt: election.applicationsCloseAt.toISOString(),
    votingOpensAt: election.votingOpensAt.toISOString(),
    votingClosesAt: election.votingClosesAt.toISOString(),
    nextDeadline: deadline ? deadline.toISOString() : null,
    createdAt: election.createdAt.toISOString(),
    closedAt: election.closedAt ? election.closedAt.toISOString() : null,
    applicationCount: election._count.applications,
    voteCount: election._count.votes,
    stores: election.stores.map((row) => ({
      code: row.storeCode,
      displayName: row.store.displayName,
      floor: row.store.floor,
      winnerApplicationId: row.winnerApplicationId,
    })),
    results,
  };
}

const electionInclude = {
  stores: { include: { store: { select: { code: true, displayName: true, floor: true, status: true } } }, orderBy: { storeCode: "asc" } },
  _count: { select: { applications: true, votes: true } },
} as const;

/** Game-owner election scheduling: create a round, run it, confirm its result. */
export function registerAdminElectionRoutes(app: FastifyInstance, deps: RouteDeps): void {
  const { db, notifier } = deps;
  const admin = { preHandler: app.requireEffectiveAdmin };

  app.get("/api/admin/elections", admin, async () => {
    await advanceElections(db, app.log);
    const elections = await db.election.findMany({ include: electionInclude, orderBy: { createdAt: "desc" } });
    return {
      elections: await Promise.all(
        elections.map(async (election) =>
          electionDto(election as ElectionRow, await electionResults(db, election.id)),
        ),
      ),
    };
  });

  app.post("/api/admin/elections", admin, async (request, reply) => {
    const input = createSchema.parse(request.body);
    const windows: Windows = {
      applicationsOpenAt: new Date(input.applicationsOpenAt),
      applicationsCloseAt: new Date(input.applicationsCloseAt),
      votingOpensAt: new Date(input.votingOpensAt),
      votingClosesAt: new Date(input.votingClosesAt),
    };
    assertValidWindows(windows);
    await assertStoresAvailable(deps, input.storeCodes);

    const created = await db.election.create({
      data: {
        title: input.title,
        note: input.note ?? null,
        status: input.publish ? "SCHEDULED" : "DRAFT",
        createdByDiscordId: request.user.sub,
        ...windows,
        stores: { create: [...new Set(input.storeCodes)].map((storeCode) => ({ storeCode })) },
      },
      include: electionInclude,
    });
    if (input.publish) await advanceElections(db, app.log); // opens at once if the window already started
    const fresh = await db.election.findUniqueOrThrow({ where: { id: created.id }, include: electionInclude });
    return reply.code(201).send({ election: electionDto(fresh as ElectionRow, await electionResults(db, fresh.id)) });
  });

  // Dates stay editable while a round runs (to extend or cut short); the store
  // list is frozen once applications can arrive.
  app.patch<{ Params: { id: string } }>("/api/admin/elections/:id", admin, async (request) => {
    const input = updateSchema.parse(request.body);
    const election = await db.election.findUnique({ where: { id: request.params.id } });
    if (!election) throw notFound("election_not_found");
    if (election.status === "CLOSED" || election.status === "CANCELLED") {
      throw badRequest("election_finished", "A finished election can no longer be edited");
    }
    const windows: Windows = {
      applicationsOpenAt: new Date(input.applicationsOpenAt ?? election.applicationsOpenAt),
      applicationsCloseAt: new Date(input.applicationsCloseAt ?? election.applicationsCloseAt),
      votingOpensAt: new Date(input.votingOpensAt ?? election.votingOpensAt),
      votingClosesAt: new Date(input.votingClosesAt ?? election.votingClosesAt),
    };
    assertValidWindows(windows);
    if (input.storeCodes) {
      if (election.status !== "DRAFT" && election.status !== "SCHEDULED") {
        throw badRequest("stores_locked", "The store list cannot change once the election has started");
      }
      await assertStoresAvailable(deps, input.storeCodes, election.id);
    }

    await db.$transaction(async (tx) => {
      await tx.election.update({
        where: { id: election.id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
          ...windows,
        },
      });
      if (input.storeCodes) {
        await tx.electionStore.deleteMany({ where: { electionId: election.id } });
        await tx.electionStore.createMany({
          data: [...new Set(input.storeCodes)].map((storeCode) => ({ electionId: election.id, storeCode })),
        });
      }
    });
    await advanceElections(db, app.log);
    const fresh = await db.election.findUniqueOrThrow({ where: { id: election.id }, include: electionInclude });
    return { election: electionDto(fresh as ElectionRow, await electionResults(db, fresh.id)) };
  });

  // Publishing makes the round visible to members; the scheduler opens it.
  app.post<{ Params: { id: string } }>("/api/admin/elections/:id/publish", admin, async (request) => {
    const election = await db.election.findUnique({ where: { id: request.params.id }, include: { stores: true } });
    if (!election) throw notFound("election_not_found");
    if (election.status !== "DRAFT") throw badRequest("election_not_draft", "Only a draft election can be published");
    if (election.stores.length === 0) throw badRequest("election_has_no_stores", "Add at least one store first");
    await assertStoresAvailable(deps, election.stores.map((row) => row.storeCode), election.id);
    await db.election.update({ where: { id: election.id }, data: { status: "SCHEDULED" } });
    await advanceElections(db, app.log);
    const fresh = await db.election.findUniqueOrThrow({ where: { id: election.id }, include: electionInclude });
    return { election: electionDto(fresh as ElectionRow, await electionResults(db, fresh.id)) };
  });

  // Confirm one store's winner. Usually the leader, but a game owner can pick
  // any candidate — that is the point of the confirmation step.
  app.post<{ Params: { id: string; code: string }; Body: { applicationId?: string } }>(
    "/api/admin/elections/:id/stores/:code/winner",
    admin,
    async (request) => {
      const applicationId = z.string().min(1).parse(request.body?.applicationId);
      const row = await db.electionStore.findUnique({
        where: { electionId_storeCode: { electionId: request.params.id, storeCode: request.params.code } },
      });
      if (!row) throw notFound("election_store_not_found");
      const application = await db.storeApplication.findUnique({ where: { id: applicationId } });
      if (!application || application.electionId !== request.params.id || application.storeCode !== request.params.code) {
        throw badRequest("application_not_in_store", "That candidate is not standing for this store");
      }
      const result = await assignStoreWinner(db, applicationId, request.user.sub);
      await notifier.applicationSelected(result.store, result.selected);
      for (const other of result.notSelected) await notifier.applicationNotSelected(result.store, other);
      return { ok: true };
    },
  );

  // Closing finalises the round: stores without a confirmed winner go back to
  // the status they had before the election.
  app.post<{ Params: { id: string } }>("/api/admin/elections/:id/close", admin, async (request) => {
    const election = await db.election.findUnique({ where: { id: request.params.id } });
    if (!election) throw notFound("election_not_found");
    if (election.status === "CLOSED" || election.status === "CANCELLED") {
      throw badRequest("election_finished", "This election is already finished");
    }
    if (election.status === "DRAFT") throw badRequest("election_not_started", "Delete the draft instead");
    await closeElection(db, election.id, request.user.sub);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/admin/elections/:id/cancel", admin, async (request) => {
    const election = await db.election.findUnique({ where: { id: request.params.id } });
    if (!election) throw notFound("election_not_found");
    if (election.status === "CLOSED" || election.status === "CANCELLED") {
      throw badRequest("election_finished", "This election is already finished");
    }
    await cancelElection(db, election.id, request.user.sub);
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>("/api/admin/elections/:id", admin, async (request) => {
    const election = await db.election.findUnique({ where: { id: request.params.id } });
    if (!election) throw notFound("election_not_found");
    if (election.status !== "DRAFT") {
      throw badRequest("election_not_draft", "Only a draft can be deleted; cancel a published election instead");
    }
    await db.election.delete({ where: { id: election.id } });
    return { ok: true };
  });

  // Stores a new round could contest: no owner, not already booked elsewhere.
  app.get("/api/admin/elections/available-stores", admin, async () => {
    const stores = await db.store.findMany({
      where: { ownerDiscordId: null, elections: { none: { election: { status: { in: LIVE_STATUSES } } } } },
      select: { code: true, displayName: true, floor: true, status: true },
      orderBy: [{ floor: "asc" }, { code: "asc" }],
    });
    return { stores };
  });
}
