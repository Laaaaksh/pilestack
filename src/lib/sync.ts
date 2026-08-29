import { prisma } from "./prisma";
import { inferStacks } from "./stacks";

/**
 * GitHub's generated webhook payload types are a giant per-action union that
 * doesn't narrow cleanly through optional chaining (some rare PR actions'
 * generated types omit fields — like `installation` — that every real
 * App-delivered webhook actually carries). Rather than fight that union,
 * these interfaces declare exactly the fields Pilestack reads, which is also
 * a more honest contract for anyone reading this file.
 */
interface WebhookAccount {
  login?: string;
  slug?: string;
  type?: string;
}

interface WebhookUser {
  login: string;
  avatar_url?: string;
}

interface WebhookRepositoryRef {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  default_branch?: string;
}

interface WebhookPullRequest {
  id: number;
  number: number;
  title: string;
  state: "open" | "closed";
  merged?: boolean;
  draft?: boolean;
  html_url: string;
  user: WebhookUser | null;
  head: { ref: string };
  base: { ref: string };
}

export interface PullRequestPayload {
  action: string;
  installation?: { id: number };
  repository: WebhookRepositoryRef;
  pull_request: WebhookPullRequest;
}

export interface PullRequestReviewPayload {
  action: string;
  pull_request: { id: number };
  review: { state: string };
}

export interface CheckSuitePayload {
  action: string;
  repository: { id: number };
  check_suite: {
    status: string;
    conclusion: string | null;
    pull_requests: { number: number }[];
  };
}

export interface InstallationPayload {
  action: string;
  installation: { id: number; account: WebhookAccount | null };
}

export interface InstallationRepositoriesPayload {
  action: string;
  installation: { id: number };
  repositories_added?: { id: number; name: string; full_name: string }[];
  repositories_removed?: { id: number }[];
}

/**
 * Webhook delivery order isn't guaranteed, so a `pull_request` event can
 * arrive before the `installation` event that would normally create this
 * row. Create a placeholder so the foreign key holds; `syncInstallationEvent`
 * fills in the real account details whenever that event does arrive.
 */
async function ensureInstallationExists(installationId: number) {
  await prisma.installation.upsert({
    where: { id: installationId },
    create: { id: installationId, accountLogin: "unknown", accountType: "unknown" },
    update: {},
  });
}

function accountLogin(account: WebhookAccount | null | undefined): string {
  return account?.login ?? account?.slug ?? "unknown";
}

export async function syncInstallationEvent(payload: InstallationPayload) {
  const installation = payload.installation;
  await prisma.installation.upsert({
    where: { id: installation.id },
    create: {
      id: installation.id,
      accountLogin: accountLogin(installation.account),
      accountType: installation.account?.type ?? "unknown",
    },
    update: {
      accountLogin: accountLogin(installation.account),
      accountType: installation.account?.type ?? "unknown",
    },
  });

  if (payload.action === "deleted") {
    // Cascades to repositories, PRs, stacks, comments, and restack runs —
    // there is nothing left to review once the app is uninstalled.
    await prisma.installation.delete({ where: { id: installation.id } }).catch(() => {});
  }
}

export async function syncInstallationRepositoriesEvent(
  payload: InstallationRepositoriesPayload,
) {
  const installationId = payload.installation.id;
  await ensureInstallationExists(installationId);

  for (const repo of payload.repositories_added ?? []) {
    const [owner] = repo.full_name.split("/");
    await prisma.repository.upsert({
      where: { id: repo.id },
      create: {
        id: repo.id,
        installationId,
        owner,
        name: repo.name,
        fullName: repo.full_name,
      },
      update: { installationId, owner, name: repo.name, fullName: repo.full_name },
    });
  }

  for (const repo of payload.repositories_removed ?? []) {
    await prisma.repository.delete({ where: { id: repo.id } }).catch(() => {});
  }
}

export async function syncPullRequestEvent(payload: PullRequestPayload) {
  const installationId = payload.installation?.id;
  if (!installationId) {
    throw new Error("pull_request webhook payload is missing installation.id");
  }
  await ensureInstallationExists(installationId);

  const repo = payload.repository;
  await prisma.repository.upsert({
    where: { id: repo.id },
    create: {
      id: repo.id,
      installationId,
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch ?? "main",
    },
    update: {
      owner: repo.owner.login,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch ?? "main",
    },
  });

  const pr = payload.pull_request;
  const state = pr.merged ? "merged" : pr.state === "closed" ? "closed" : "open";

  await prisma.pullRequest.upsert({
    where: { id: pr.id },
    create: {
      id: pr.id,
      repositoryId: repo.id,
      number: pr.number,
      title: pr.title,
      authorLogin: pr.user?.login ?? "unknown",
      authorAvatarUrl: pr.user?.avatar_url,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      state,
      isDraft: pr.draft ?? false,
      url: pr.html_url,
    },
    update: {
      title: pr.title,
      headRef: pr.head.ref,
      baseRef: pr.base.ref,
      state,
      isDraft: pr.draft ?? false,
      url: pr.html_url,
    },
  });

  await recomputeStacksForRepo(repo.id);
}

export async function syncPullRequestReviewEvent(payload: PullRequestReviewPayload) {
  const review = payload.review;
  const reviewStatus =
    review.state === "approved"
      ? "approved"
      : review.state === "changes_requested"
        ? "changes_requested"
        : review.state === "commented"
          ? "pending"
          : "none";

  // v1 stores the most recently submitted review's state, matching the
  // badge GitHub's own PR list shows — not a full per-reviewer aggregate.
  // updateMany rather than update: webhook delivery order isn't guaranteed,
  // so the PR row may not exist yet if this review event races the PR's own
  // `opened` event.
  await prisma.pullRequest.updateMany({
    where: { id: payload.pull_request.id },
    data: { reviewStatus },
  });
}

function ciStatusFromCheckSuite(status: string, conclusion: string | null): string {
  if (status !== "completed") return "pending";
  if (conclusion === "success" || conclusion === "neutral") return "success";
  if (conclusion === null) return "unknown";
  // failure, cancelled, timed_out, action_required, stale — all "needs attention".
  return "failure";
}

export async function syncCheckSuiteEvent(payload: CheckSuitePayload) {
  const suite = payload.check_suite;
  const ciStatus = ciStatusFromCheckSuite(suite.status, suite.conclusion);
  const numbers = (suite.pull_requests ?? []).map((pr) => pr.number);
  if (numbers.length === 0) return;

  await prisma.pullRequest.updateMany({
    where: { repositoryId: payload.repository.id, number: { in: numbers } },
    data: { ciStatus },
  });
}

/**
 * Re-derives every stack for a repository from its currently-open PRs.
 * Stacks are matched (not replaced) by signature, so comment history and
 * restack-run audit trails survive a restack that only moves base commits —
 * the head ref names, which the signature is built from, don't change.
 */
export async function recomputeStacksForRepo(repositoryId: number) {
  const openPrs = await prisma.pullRequest.findMany({
    where: { repositoryId, state: "open" },
  });
  const groups = inferStacks(
    openPrs.map((pr) => ({ id: pr.id, headRef: pr.headRef, baseRef: pr.baseRef })),
  );

  const stackedIds = new Set<number>();
  for (const group of groups) {
    const stack = await prisma.stack.upsert({
      where: { repositoryId_signature: { repositoryId, signature: group.signature } },
      create: { repositoryId, signature: group.signature },
      update: {},
    });
    for (const pr of group.prs) {
      stackedIds.add(pr.id);
      await prisma.pullRequest.update({ where: { id: pr.id }, data: { stackId: stack.id } });
    }
  }

  const detachedIds = openPrs
    .filter((pr) => pr.stackId && !stackedIds.has(pr.id))
    .map((pr) => pr.id);
  if (detachedIds.length > 0) {
    await prisma.pullRequest.updateMany({
      where: { id: { in: detachedIds } },
      data: { stackId: null },
    });
  }
}

export type SupportedWebhookEventName =
  | "installation"
  | "installation_repositories"
  | "pull_request"
  | "pull_request_review"
  | "check_suite";

/** Dispatches a verified webhook event to its sync handler. Unknown event names are ignored. */
export async function handleWebhookEvent(name: string, payload: unknown): Promise<void> {
  switch (name as SupportedWebhookEventName) {
    case "installation":
      return syncInstallationEvent(payload as InstallationPayload);
    case "installation_repositories":
      return syncInstallationRepositoriesEvent(payload as InstallationRepositoriesPayload);
    case "pull_request":
      return syncPullRequestEvent(payload as PullRequestPayload);
    case "pull_request_review":
      return syncPullRequestReviewEvent(payload as PullRequestReviewPayload);
    case "check_suite":
      return syncCheckSuiteEvent(payload as CheckSuitePayload);
    default:
      return;
  }
}
