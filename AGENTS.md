<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project overview

Pilestack is a self-hosted GitHub App + Next.js web app: it infers stacked
PRs from base/head branch relationships (no dependency on any stacking CLI's
own metadata), gives a team a shared stack-review UI, and can rebase +
force-push a whole stack on request. See README.md for the product pitch and
CONTRIBUTING.md for the dev workflow.

## Architecture

- `src/lib/stacks.ts` — pure stack-inference algorithm (PRs → ordered
  groups). No I/O; this is the core business logic, keep it that way.
- `src/lib/sync.ts` — webhook payload → Prisma writes. Defines its own
  narrow payload interfaces instead of using Octokit's generated per-action
  union types, which don't narrow cleanly through optional chaining — see
  the comment at the top of that file before reaching for
  `@octokit/webhooks-types`/`openapi-webhooks-types` again.
- `src/lib/restack.ts` — the actual `git rebase` + `--force-with-lease`
  engine, via `simple-git` against a real clone (not the GitHub API). Tested
  against real local git repos in `tests/restack.test.ts`, not mocked.
- `src/lib/github-app.ts` — `@octokit/app`'s `App` class directly (JWT +
  installation tokens + webhook verification), not the `probot` package —
  keeps the whole thing one Next.js process for self-hosting. See the
  comment there for why.
- `src/app/api/webhooks/github/route.ts` — verifies signatures with
  `@octokit/webhooks-methods` directly (Web Request API), not Probot's
  Node-http middleware.
- Auth: NextAuth v5 (`src/lib/auth.ts`) for sign-in; `src/lib/authz.ts`'s
  `hasRepoAccess` is the actual authorization boundary — it asks GitHub
  itself whether the signed-in user can see a repo, not a separate Pilestack
  role.

## Conventions

- Prisma is pinned to 6.19.3 (both `prisma` and `@prisma/client`) —
  Prisma 7 moved the datasource `url` out of schema.prisma into a
  `prisma.config.ts` + driver-adapter model; don't bump past 6.x without
  migrating that config shape deliberately.
- `prisma` (the CLI) is a regular `dependencies` entry, not a
  devDependency — the Docker image's production-only install needs it at
  startup for `prisma migrate deploy` (see `docker-entrypoint.sh`).
- SQLite by default (`DATABASE_URL="file:./data/pilestack.db"`); the schema
  targets `binaryTargets = ["native", "debian-openssl-3.0.x"]` for the
  Dockerfile's `node:20-slim` base.
- After changing a route's params/dynamic segments, run
  `pnpm exec next typegen` before `tsc --noEmit` — `RouteContext`/`PageProps`
  types are generated, not hand-written (`pnpm typecheck` already does this).
- Tests that touch the database point `DATABASE_URL` at a fresh temp SQLite
  file and dynamically `import()` `@/lib/prisma` *after* that (see
  `tests/setup/test-db.ts`) — that module builds its client from the env var
  at import time, so a static top-level import would race the env var.
- Local dev/install docs use a plain `.env`, not `.env.local`: the Prisma CLI
  and `tsx` (via `pnpm seed`, which passes `--env-file=.env` explicitly) only
  auto-load `.env`, while Next.js loads both. Keep README/CONTRIBUTING and
  `docker-compose.yml`'s `env_file` on `.env` so all three tools agree.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
