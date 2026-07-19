import { PrismaClient, StoreStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Initial mall layout. A* stores are on floor 1, B* stores are on floor 2.
// A4 is currently closed. Seeding is idempotent and only creates a store when
// its code does not already exist, so admin deletions are never undone.
const INITIAL_STORES: Array<{ code: string; floor: number; status: StoreStatus }> = [
  { code: "A1", floor: 1, status: "OPEN" },
  { code: "A2", floor: 1, status: "OPEN" },
  { code: "A3", floor: 1, status: "OPEN" },
  { code: "A4", floor: 1, status: "CLOSED" },
  { code: "A5", floor: 1, status: "OPEN" },
  { code: "B1", floor: 2, status: "OPEN" },
  { code: "B2", floor: 2, status: "OPEN" },
  { code: "B3", floor: 2, status: "OPEN" },
  { code: "B4", floor: 2, status: "ELECTION" },
  { code: "B5", floor: 2, status: "ELECTION" },
  { code: "B6", floor: 2, status: "ELECTION" },
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  try {
    let created = 0;
    for (const store of INITIAL_STORES) {
      const existing = await prisma.store.findUnique({ where: { code: store.code } });
      if (existing) continue;
      await prisma.store.create({
        data: {
          code: store.code,
          floor: store.floor,
          status: store.status,
          displayName: `Store ${store.code}`,
        },
      });
      created += 1;
    }
    console.log(`Seed complete: ${created} store(s) created, ${INITIAL_STORES.length - created} already present.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error("Seed failed", error);
  process.exit(1);
});
