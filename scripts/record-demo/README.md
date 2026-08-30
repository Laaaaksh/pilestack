# Demo recorder

Records the README's demo GIF/MP4 from a real, running Pilestack instance —
no mockups, no staged screenshots. Dev-only tooling: this package is never
installed or built as part of the product.

## What it needs

- A dedicated, disposable **private** GitHub repo with a real stacked PR
  chain (this project uses `Laaaaksh/pilestack-demo-sandbox`, three PRs:
  `add-rate-limiter` → `wire-rate-limiter` → `rate-limit-docs`, each based on
  the one below it, plus a follow-up commit pushed to the bottom branch after
  the stack was opened so a restack has real work to do).
- A GitHub OAuth App and GitHub App installed on that repo — see
  [README.md#install](../../README.md#install). The GitHub App needs its
  `pull_request` webhook permission (`Pull requests: Read & write`,
  `Contents: Read & write`) since `seed-demo.mts` reads real PR data through
  it and `record.mjs` triggers a real restack (real rebase, real
  `--force-with-lease` push) against that repo.
- The root `.env` filled in for that OAuth App / GitHub App (see
  `.env.example`).
- ffmpeg on `PATH`.

## One-time setup

```bash
cd scripts/record-demo
npm install
npx playwright install chromium
```

## Running it

From the repo root, with a fresh `.env` pointed at the sandbox app/repo:

```bash
pnpm db:deploy && pnpm db:generate
pnpm dev &                              # boot the real app
cd scripts/record-demo
npm run seed                            # pulls the real PR stack into the local DB
npm run login                           # interactive, one time: sign in + approve OAuth in a real browser
npm run record                          # drives the real UI, saves output/demo-raw.webm
npm run convert                         # ffmpeg -> ../../docs/assets/demo.mp4 + demo.gif
```

`make demo` from the repo root runs the boot/seed/record/convert steps in
one command — `npm run login` still has to happen once, interactively,
before that, since it can't be automated (see below).

## Why `login` is separate from `record`

Pilestack has no dev-mode auth bypass — every real screen sits behind actual
GitHub OAuth sign-in, on purpose (stack visibility follows the viewer's real
GitHub repo permissions). `login.mjs` opens a real, visible browser once so a
human can sign in and approve the OAuth consent screen themselves, then saves
the resulting session to `.auth/storageState.json` (gitignored — it's a live
session token). `record.mjs` loads that saved session into a fresh browser
context before recording starts, so the sign-in flow, the OAuth consent
screen, and the account's identity never appear in the video. Re-run `login`
whenever the saved session expires.

## Re-running

`seed-demo.mts` is idempotent against the same sandbox repo — safe to re-run.
`record.mjs` is deterministic given the same seeded stack: same pacing, same
screens, same outcome. Re-running the whole loop after the sandbox repo's
branches have drifted further (e.g. after a real restack force-pushed them)
will still produce a coherent recording, since every step re-reads real
GitHub/DB state rather than replaying fixed data.
