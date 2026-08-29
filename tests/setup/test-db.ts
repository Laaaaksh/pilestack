import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Points DATABASE_URL at a throwaway SQLite file and applies migrations
 * before any test imports `@/lib/prisma`, so tests exercise the same schema
 * (and the same Prisma client) production runs against — no mocking.
 */
export function useTestDatabase() {
  const dir = mkdtempSync(path.join(tmpdir(), "pilestack-test-db-"));
  const dbPath = path.join(dir, "test.db");
  process.env.DATABASE_URL = `file:${dbPath}`;

  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    cwd: path.resolve(__dirname, "../.."),
    env: process.env,
    stdio: "pipe",
  });

  return {
    dir,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
