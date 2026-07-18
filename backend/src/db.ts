import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma 7's client no longer loads .env itself, so read it here before pulling
// DATABASE_URL. Production and CI supply it through the ambient environment.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile();
  } catch {
    // No .env file present — rely on the ambient environment.
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter });
