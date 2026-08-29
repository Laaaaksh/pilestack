import { PrismaClient } from "@prisma/client";

// Next.js dev-mode module reloading would otherwise spawn a new PrismaClient
// (and a new SQLite connection) on every hot reload; stash the instance on
// `globalThis` so it survives across reloads in development.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
