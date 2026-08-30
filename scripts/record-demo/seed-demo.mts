// Populates the local database for the demo recording from a real,
// disposable GitHub repo (see README.md in this directory for what it
// contains and why) — driven through the product's own webhook-sync
// functions (src/lib/sync.ts), the exact code path a live GitHub webhook
// delivery would exercise. No hand-authored fixture rows: every repo, PR,
// title, branch name, and URL synced here is real GitHub data fetched live.
import { App } from "@octokit/app";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncInstallationEvent, syncPullRequestEvent } from "../../src/lib/sync";
import { prisma } from "../../src/lib/prisma";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Constructs the same @octokit/app client as src/lib/github-app.ts, from the
// same env vars — but built directly rather than imported from that file.
// github-app.ts sits under the app's CommonJS-scoped package.json, and
// requiring it from this ESM (.mts) script forces Node's CJS resolver onto
// @octokit/app's dependency tree, which includes an ESM-only package with no
// "require" condition (fails with ERR_PACKAGE_PATH_NOT_EXPORTED) — a
// dual-package hazard Next's bundler papers over but plain Node doesn't.
function buildGitHubApp(): App {
  const appId = process.env.GITHUB_APP_ID;
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!appId || !webhookSecret) {
    throw new Error("GITHUB_APP_ID and GITHUB_WEBHOOK_SECRET must be set — see .env.example.");
  }
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY
    ? process.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, "\n")
    : readFileSync(
        path.resolve(
          PROJECT_ROOT,
          process.env.GITHUB_APP_PRIVATE_KEY_PATH ??
            (() => {
              throw new Error("Set GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH.");
            })(),
        ),
        "utf8",
      );
  return new App({ appId, privateKey, webhooks: { secret: webhookSecret } });
}

const owner = process.env.DEMO_REPO_OWNER ?? "Laaaaksh";
const repo = process.env.DEMO_REPO_NAME ?? "pilestack-demo-sandbox";

// GitHub won't let this same account approve or request changes on its own
// PRs, so — unlike everything else this script seeds — these status badges
// can't be pulled from a genuinely different reviewer. Kept here as the one
// clearly-synthetic layer, matching the illustrative statuses the project's
// own `pnpm seed` fixture already uses.
const STATUS_BY_BRANCH: Record<string, { ciStatus: string; reviewStatus: string }> = {
  "add-rate-limiter": { ciStatus: "success", reviewStatus: "approved" },
  "wire-rate-limiter": { ciStatus: "success", reviewStatus: "changes_requested" },
  "rate-limit-docs": { ciStatus: "pending", reviewStatus: "none" },
};

async function main() {
  const app = buildGitHubApp();

  const { data: installation } = await app.octokit.request(
    "GET /repos/{owner}/{repo}/installation",
    { owner, repo },
  );

  await syncInstallationEvent({
    action: "created",
    installation: { id: installation.id, account: installation.account },
  });

  const octokit = await app.getInstallationOctokit(installation.id);
  const { data: pulls } = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    state: "open",
    sort: "created",
    direction: "asc",
  });

  if (pulls.length === 0) {
    throw new Error(
      `No open PRs on ${owner}/${repo} — did the sandbox repo's stacked PR chain get created? See README.md.`,
    );
  }

  for (const pr of pulls) {
    await syncPullRequestEvent({
      action: "opened",
      installation: { id: installation.id },
      repository: {
        id: pr.base.repo.id,
        name: pr.base.repo.name,
        full_name: pr.base.repo.full_name,
        owner: { login: pr.base.repo.owner.login },
        default_branch: pr.base.repo.default_branch,
      },
      pull_request: {
        id: pr.id,
        number: pr.number,
        title: pr.title,
        state: pr.state as "open" | "closed",
        merged: false,
        draft: pr.draft ?? false,
        html_url: pr.html_url,
        user: pr.user ? { login: pr.user.login, avatar_url: pr.user.avatar_url } : null,
        head: { ref: pr.head.ref },
        base: { ref: pr.base.ref },
      },
    });

    const status = STATUS_BY_BRANCH[pr.head.ref];
    if (status) {
      await prisma.pullRequest.update({ where: { id: pr.id }, data: status });
    }
  }

  const stack = await prisma.stack.findFirst({
    where: { repository: { fullName: `${owner}/${repo}` } },
    include: { pullRequests: true },
  });

  console.log(`Seeded stack ${stack?.id} (${owner}/${repo}) with ${stack?.pullRequests.length ?? 0} PRs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
