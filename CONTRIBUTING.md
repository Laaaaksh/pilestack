# Contributing to Pilestack

Thank you for your interest in contributing. Pilestack is a self-hosted
stacked-PR review UI for GitHub, open source under the MIT license.

## Getting started

```bash
git clone https://github.com/<your-username>/pilestack.git   # your fork, see below
cd pilestack
pnpm install
cp .env.example .env   # SQLite by default — no other setup needed to run tests
pnpm db:migrate
pnpm test
```

To run the app itself against seeded sample data (no GitHub App required):

```bash
pnpm seed
pnpm dev
```

## Requirements

- Node.js 20.9+
- pnpm 9+
- A GitHub App and OAuth App, only if you're exercising the real webhook and
  sign-in flows end to end — see [README.md#install](README.md#install). Not
  needed for `pnpm test` or browsing seeded data with `pnpm dev`.

## Contribution workflow

The `master` branch is protected: every change lands through a pull request,
required status checks must pass, and protection is enforced for everyone —
including the maintainer. There are no direct pushes to `master`.

1. Fork the repo on GitHub, then clone your fork (command above).
2. Create a descriptively named feature branch from `master`.
3. Make your changes as small, focused commits, each leaving the tree
   buildable.
4. Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` — all three must pass.
5. If your change is user-facing (a feature, fix, or behavior change), add
   one bullet under the `Unreleased` heading in [CHANGELOG.md](CHANGELOG.md).
6. Push the branch to your fork.
7. Open a pull request against `master` here.

A PR can merge only when every required check passes (`Test`, `Lint`, and
`Typecheck`) and all conversation threads are resolved.

### What the test suite actually covers

`pnpm test` runs entirely offline — no live GitHub App or network access
needed:

- `tests/stacks.test.ts` — the pure stack-inference algorithm (grouping PRs
  into stacks from their base/head refs), including branching stacks and
  cycle-safety.
- `tests/sync.test.ts` and `tests/webhook-route.test.ts` — webhook payload
  handling end to end, including real HMAC signature verification, against a
  throwaway migrated SQLite database.
- `tests/restack.test.ts` — the restack engine against **real local git
  repositories** (not mocked): a full rebase-and-push chain, a rebase
  conflict that must abort without pushing, and a `--force-with-lease`
  rejection when a concurrent push happened without Pilestack's knowledge.
  If you touch `src/lib/restack.ts`, run this file specifically and make sure
  the force-with-lease test still fails safely — that's the property this
  project is riskiest on.
- `tests/github-app.test.ts` — the GitHub App / installation-auth wiring
  (`src/lib/github-app.ts`): a real RS256 app JWT signed with a generated
  test key, exchanged for an installation token against GitHub's API with
  `nock` intercepting the HTTP layer (not the Octokit client) — including
  the negative case where GitHub returns an error.

## Releases

Releases are cut by pushing a tag; GitHub Actions does the rest
(`.github/workflows/release.yml`):

1. Make sure every user-facing change since the last release has a bullet
   under `Unreleased` in [CHANGELOG.md](CHANGELOG.md) (step 5 above).
2. Give the release its own changelog section: insert `## [x.y.z] -
   YYYY-MM-DD` above the (now empty) `## [Unreleased]` heading, following the
   format of the existing sections, and update the compare links at the
   bottom of the file.
3. Land those changelog edits on `master` through a pull request, then tag and
   push:

   ```bash
   git tag vx.y.z && git push origin vx.y.z
   ```

The workflow extracts the tagged version's CHANGELOG section as the GitHub
release notes and publishes a container image to the GitHub Container
Registry (`ghcr.io/laaaaksh/pilestack`).

## Code style

- TypeScript everywhere, strict mode. No `any` without a comment explaining
  why it's unavoidable.
- Prisma is the only place SQL is written; don't hand-write queries
  elsewhere.
- Route Handlers stay thin: validate input with `zod`, delegate the actual
  work to `src/lib/*`, so that logic is testable without an HTTP server.
- Prefer a small, precise local `interface` for the exact fields you read
  from a GitHub webhook or API payload over fighting Octokit's generated
  per-action union types (`src/lib/sync.ts` explains why).
- No telemetry, analytics, or phone-home of any kind — this project exists
  partly because the tool it replaces doesn't make that promise.

## Reporting issues

Please open a GitHub issue before starting large changes or proposing new
features, so scope and approach can be settled before code is written. Bug
reports should include:

- Pilestack version / commit
- How you're running it (Docker, from source) and which database
- Steps to reproduce
- What you expected vs. what happened

For security issues, see [SECURITY.md](SECURITY.md) instead of opening a
public issue.
