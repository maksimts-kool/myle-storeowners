import type { FastifyBaseLogger } from "fastify";
import type { Election, ElectionStore, Store, StoreApplication, StoreStatus } from "@prisma/client";
import type { prisma as database } from "../db.js";
import { badRequest, notFound } from "../lib/errors.js";

type Db = typeof database;

/**
 * What members can do right now. Derived from the windows rather than stored,
 * so a clock change or a restart can never leave the gate out of step with the
 * dates a game owner picked.
 */
export type ElectionPhase =
  | "draft" // not published yet
  | "upcoming" // published, applications have not opened
  | "applications" // accepting applications (and voting, if the windows overlap)
  | "review" // applications closed, voting not open yet
  | "voting" // accepting votes only
  | "tallying" // voting closed, waiting for a game owner to confirm results
  | "closed"
  | "cancelled";

export interface ElectionWithStores extends Election {
  stores: (ElectionStore & { store: Store })[];
}

export function electionPhase(election: Election, now: Date = new Date()): ElectionPhase {
  if (election.status === "DRAFT") return "draft";
  if (election.status === "CANCELLED") return "cancelled";
  if (election.status === "CLOSED") return "closed";
  if (election.status === "TALLYING") return "tallying";
  if (now < election.applicationsOpenAt) return "upcoming";
  if (now >= election.votingClosesAt) return "tallying";
  if (now < election.applicationsCloseAt) return "applications";
  if (now < election.votingOpensAt) return "review";
  return "voting";
}

export function applicationsOpen(election: Election, now: Date = new Date()): boolean {
  return election.status === "RUNNING" && now >= election.applicationsOpenAt && now < election.applicationsCloseAt;
}

export function votingOpen(election: Election, now: Date = new Date()): boolean {
  return election.status === "RUNNING" && now >= election.votingOpensAt && now < election.votingClosesAt;
}

/** The next boundary members should see a countdown to, if there is one. */
export function nextDeadline(election: Election, now: Date = new Date()): Date | null {
  const phase = electionPhase(election, now);
  if (phase === "upcoming") return election.applicationsOpenAt;
  if (phase === "applications") return election.applicationsCloseAt;
  if (phase === "review") return election.votingOpensAt;
  if (phase === "voting") return election.votingClosesAt;
  return null;
}

/**
 * Puts every contested store into the election status, remembering what to
 * restore later. A store that gained an owner between scheduling and opening
 * drops out of the round instead of being taken away from its new owner.
 */
async function openElectionStores(db: Db, electionId: string): Promise<void> {
  const rows = await db.electionStore.findMany({ where: { electionId }, include: { store: true } });
  for (const row of rows) {
    if (row.store.ownerDiscordId) {
      await db.electionStore.delete({ where: { electionId_storeCode: { electionId, storeCode: row.storeCode } } });
      continue;
    }
    if (row.store.status === "ELECTION") continue; // already open, e.g. a retried tick
    await db.electionStore.update({
      where: { electionId_storeCode: { electionId, storeCode: row.storeCode } },
      data: { previousStatus: row.store.status },
    });
    await db.store.update({ where: { code: row.storeCode }, data: { status: "ELECTION" } });
  }
}

/** Returns stores that did not get a winner to whatever status they had before. */
async function restoreElectionStores(db: Db, electionId: string): Promise<void> {
  const rows = await db.electionStore.findMany({ where: { electionId }, include: { store: true } });
  for (const row of rows) {
    if (row.winnerApplicationId) continue; // the assignment already set OPEN + owner
    if (row.store.status !== "ELECTION") continue;
    await db.store.update({ where: { code: row.storeCode }, data: { status: row.previousStatus } });
  }
}

/**
 * Moves rounds across their scheduled boundaries. Safe to call as often as you
 * like: every transition is driven by the stored status plus the current time,
 * so a server that was down through several boundaries catches up in one pass.
 */
export async function advanceElections(db: Db, log?: FastifyBaseLogger): Promise<void> {
  const now = new Date();
  const due = await db.election.findMany({ where: { status: { in: ["SCHEDULED", "RUNNING"] } } });
  for (const election of due) {
    try {
      if (election.status === "SCHEDULED" && now >= election.applicationsOpenAt) {
        await openElectionStores(db, election.id);
        await db.election.update({ where: { id: election.id }, data: { status: "RUNNING" } });
        log?.info({ operation: "election_started", electionId: election.id }, "Election opened for applications");
      }
      if (now >= election.votingClosesAt) {
        const moved = await db.election.updateMany({
          where: { id: election.id, status: { in: ["SCHEDULED", "RUNNING"] } },
          data: { status: "TALLYING" },
        });
        if (moved.count > 0) {
          log?.info({ operation: "election_tallying", electionId: election.id }, "Election voting closed; results ready");
        }
      }
    } catch (error) {
      log?.error({ operation: "election_advance", electionId: election.id, error }, "Could not advance election");
    }
  }
}

/** Runs advanceElections on a timer for the lifetime of the process. */
export function startElectionScheduler(db: Db, log: FastifyBaseLogger, intervalMs = 30_000): () => void {
  let running = false;
  const tick = async (): Promise<void> => {
    if (running) return;
    running = true;
    try {
      await advanceElections(db, log);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

export interface CandidateResult {
  applicationId: string;
  discordId: string;
  displayName: string;
  robloxName: string | null;
  voteCount: number;
}

export interface StoreResult {
  storeCode: string;
  storeName: string;
  totalVotes: number;
  candidates: CandidateResult[];
  /** Null when there are no candidates, or when the top two are level. */
  leaderApplicationId: string | null;
  tied: boolean;
  winnerApplicationId: string | null;
}

/** Per-store standings, highest first, with ties surfaced rather than broken. */
export async function electionResults(db: Db, electionId: string): Promise<StoreResult[]> {
  const stores = await db.electionStore.findMany({
    where: { electionId },
    include: { store: { select: { code: true, displayName: true } } },
    orderBy: { storeCode: "asc" },
  });
  const applications = await db.storeApplication.findMany({
    where: { electionId, status: { in: ["APPLIED", "SELECTED"] } },
    include: { _count: { select: { votes: true } } },
    orderBy: { createdAt: "asc" },
  });

  return stores.map((row) => {
    const candidates: CandidateResult[] = applications
      .filter((application) => application.storeCode === row.storeCode)
      .map((application) => ({
        applicationId: application.id,
        discordId: application.applicantDiscordId,
        displayName: application.applicantDisplayName,
        robloxName: application.applicantRobloxName,
        voteCount: application._count.votes,
      }))
      // Highest vote count wins; the earliest application is listed first on a tie.
      .sort((a, b) => b.voteCount - a.voteCount);
    const tied = candidates.length > 1 && candidates[0]!.voteCount === candidates[1]!.voteCount;
    return {
      storeCode: row.storeCode,
      storeName: row.store.displayName,
      totalVotes: candidates.reduce((sum, candidate) => sum + candidate.voteCount, 0),
      candidates,
      leaderApplicationId: candidates.length > 0 && !tied ? candidates[0]!.applicationId : null,
      tied,
      winnerApplicationId: row.winnerApplicationId,
    };
  });
}

export interface AssignmentResult {
  store: Store;
  selected: StoreApplication;
  notSelected: StoreApplication[];
}

/**
 * Hands a store to one candidate: the store opens under its new owner, every
 * other candidate for that store is marked not selected, and the result is
 * recorded on the round so it survives closing.
 */
export async function assignStoreWinner(db: Db, applicationId: string, adminDiscordId: string): Promise<AssignmentResult> {
  return db.$transaction(async (tx) => {
    const initial = await tx.storeApplication.findUnique({ where: { id: applicationId } });
    if (!initial) throw notFound("application_not_found");
    await tx.$queryRaw`SELECT "code" FROM "Store" WHERE "code" = ${initial.storeCode} FOR UPDATE`;
    const application = await tx.storeApplication.findUnique({
      where: { id: initial.id },
      include: { store: true, election: true },
    });
    if (!application) throw notFound("application_not_found");
    if (application.status !== "APPLIED") {
      throw badRequest("application_not_active", "Only an active application can be selected");
    }
    if (application.election && !["RUNNING", "TALLYING"].includes(application.election.status)) {
      throw badRequest("election_not_active", "This election is not accepting a result right now");
    }
    if (application.store.ownerDiscordId) {
      throw badRequest("store_already_assigned", "This store already has an owner");
    }

    const now = new Date();
    const notSelected = await tx.storeApplication.findMany({
      where: { storeCode: application.storeCode, electionId: application.electionId, status: "APPLIED", id: { not: application.id } },
    });
    const selected = await tx.storeApplication.update({
      where: { id: application.id },
      data: { status: "SELECTED", resolvedAt: now, resolvedByDiscordId: adminDiscordId },
    });
    await tx.storeApplication.updateMany({
      where: { storeCode: application.storeCode, electionId: application.electionId, status: "APPLIED", id: { not: application.id } },
      data: { status: "NOT_SELECTED", resolvedAt: now, resolvedByDiscordId: adminDiscordId },
    });
    if (application.electionId) {
      await tx.electionStore.updateMany({
        where: { electionId: application.electionId, storeCode: application.storeCode },
        data: { winnerApplicationId: selected.id },
      });
    }
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
}

/** Ends a round: unassigned stores go back to their previous status. */
export async function closeElection(db: Db, electionId: string, closedByDiscordId: string): Promise<void> {
  await restoreElectionStores(db, electionId);
  await db.storeApplication.updateMany({
    where: { electionId, status: "APPLIED" },
    data: { status: "NOT_SELECTED", resolvedAt: new Date(), resolvedByDiscordId: closedByDiscordId },
  });
  await db.election.update({
    where: { id: electionId },
    data: { status: "CLOSED", closedAt: new Date(), closedByDiscordId },
  });
}

/** Calls a round off: votes are voided and every store goes back as it was. */
export async function cancelElection(db: Db, electionId: string, cancelledByDiscordId: string): Promise<void> {
  await restoreElectionStores(db, electionId);
  await db.electionVote.deleteMany({ where: { electionId } });
  await db.storeApplication.updateMany({
    where: { electionId, status: "APPLIED" },
    data: { status: "CANCELLED", resolvedAt: new Date(), resolvedByDiscordId: cancelledByDiscordId },
  });
  await db.election.update({
    where: { id: electionId },
    data: { status: "CANCELLED", closedAt: new Date(), closedByDiscordId: cancelledByDiscordId },
  });
}

/**
 * Adopts pre-scheduling data. Stores left in the ELECTION status by the old
 * manual flow — along with their applications and votes — become one open-ended
 * round so nobody's application or vote is lost on deploy.
 */
export async function adoptLegacyElection(db: Db, log?: FastifyBaseLogger): Promise<void> {
  const orphanStores = await db.store.findMany({
    where: { status: "ELECTION", elections: { none: {} } },
    select: { code: true },
  });
  if (orphanStores.length === 0) return;

  const now = new Date();
  const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  const election = await db.election.create({
    data: {
      title: "Ongoing election",
      status: "RUNNING",
      applicationsOpenAt: now,
      applicationsCloseAt: oneYear,
      votingOpensAt: now,
      votingClosesAt: oneYear,
      createdByDiscordId: "system",
      note: "Carried over from the manual election flow. Set the dates you want, or close it and schedule a new round.",
      stores: {
        create: orphanStores.map((store) => ({ storeCode: store.code, previousStatus: "OPEN" as StoreStatus })),
      },
    },
  });
  const codes = orphanStores.map((store) => store.code);
  await db.storeApplication.updateMany({
    where: { electionId: null, storeCode: { in: codes } },
    data: { electionId: election.id },
  });
  await db.electionVote.updateMany({
    where: { electionId: null, storeCode: { in: codes } },
    data: { electionId: election.id },
  });
  log?.info({ operation: "election_adopted", electionId: election.id, stores: codes.length }, "Adopted legacy election stores");
}
