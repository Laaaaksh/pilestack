import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { useTestDatabase } from "./setup/test-db";
import type {
  CheckSuitePayload,
  InstallationPayload,
  InstallationRepositoriesPayload,
  PullRequestPayload,
  PullRequestReviewPayload,
} from "@/lib/sync";

// DATABASE_URL must be pointed at a fresh, migrated SQLite file *before*
// `@/lib/prisma` is first imported (it builds its client from the env var at
// module-load time) — so both modules are loaded dynamically inside
// beforeAll, after useTestDatabase() has set the env var.
let sync: typeof import("@/lib/sync");
let prisma: typeof import("@/lib/prisma").prisma;
let cleanupDb: () => void;

beforeAll(async () => {
  const db = useTestDatabase();
  cleanupDb = db.cleanup;
  sync = await import("@/lib/sync");
  ({ prisma } = await import("@/lib/prisma"));
});

afterAll(async () => {
  await prisma.$disconnect();
  cleanupDb();
});

const INSTALLATION_ID = 42;
const REPO = { id: 100, name: "widgets", full_name: "acme/widgets", owner: { login: "acme" } };

function pullRequestPayload(overrides: {
  action: string;
  id: number;
  number: number;
  headRef: string;
  baseRef: string;
  state?: "open" | "closed";
  merged?: boolean;
}): PullRequestPayload {
  return {
    action: overrides.action,
    installation: { id: INSTALLATION_ID },
    repository: REPO,
    pull_request: {
      id: overrides.id,
      number: overrides.number,
      title: `PR #${overrides.number}`,
      state: overrides.state ?? "open",
      merged: overrides.merged ?? false,
      draft: false,
      html_url: `https://github.com/acme/widgets/pull/${overrides.number}`,
      user: { login: "octocat" },
      head: { ref: overrides.headRef },
      base: { ref: overrides.baseRef },
    },
  };
}

describe("syncInstallationEvent", () => {
  it("creates and later deletes (cascading) an installation", async () => {
    const created: InstallationPayload = {
      action: "created",
      installation: { id: 7, account: { login: "octo-org", type: "Organization" } },
    };
    await sync.syncInstallationEvent(created);

    const installation = await prisma.installation.findUnique({ where: { id: 7 } });
    expect(installation?.accountLogin).toBe("octo-org");
    expect(installation?.accountType).toBe("Organization");

    await sync.syncInstallationRepositoriesEvent({
      action: "added",
      installation: { id: 7 },
      repositories_added: [{ id: 999, name: "temp", full_name: "octo-org/temp" }],
    });
    expect(await prisma.repository.findUnique({ where: { id: 999 } })).not.toBeNull();

    const deleted: InstallationPayload = {
      action: "deleted",
      installation: { id: 7, account: { login: "octo-org", type: "Organization" } },
    };
    await sync.syncInstallationEvent(deleted);

    expect(await prisma.installation.findUnique({ where: { id: 7 } })).toBeNull();
    expect(await prisma.repository.findUnique({ where: { id: 999 } })).toBeNull();
  });
});

describe("syncInstallationRepositoriesEvent", () => {
  it("adds and removes repositories, deriving owner from full_name", async () => {
    const payload: InstallationRepositoriesPayload = {
      action: "added",
      installation: { id: INSTALLATION_ID },
      repositories_added: [{ id: 200, name: "gizmos", full_name: "acme/gizmos" }],
    };
    await sync.syncInstallationRepositoriesEvent(payload);

    const repo = await prisma.repository.findUnique({ where: { id: 200 } });
    expect(repo?.owner).toBe("acme");
    expect(repo?.fullName).toBe("acme/gizmos");

    await sync.syncInstallationRepositoriesEvent({
      action: "removed",
      installation: { id: INSTALLATION_ID },
      repositories_removed: [{ id: 200 }],
    });
    expect(await prisma.repository.findUnique({ where: { id: 200 } })).toBeNull();
  });
});

describe("syncPullRequestEvent + recomputeStacksForRepo", () => {
  it("builds a three-PR stack from opened events and links them to one Stack row", async () => {
    await sync.syncPullRequestEvent(
      pullRequestPayload({ action: "opened", id: 1, number: 1, headRef: "feat-a", baseRef: "main" }),
    );
    await sync.syncPullRequestEvent(
      pullRequestPayload({ action: "opened", id: 2, number: 2, headRef: "feat-b", baseRef: "feat-a" }),
    );
    await sync.syncPullRequestEvent(
      pullRequestPayload({ action: "opened", id: 3, number: 3, headRef: "feat-c", baseRef: "feat-b" }),
    );

    const prs = await prisma.pullRequest.findMany({
      where: { repositoryId: REPO.id },
      orderBy: { number: "asc" },
    });
    expect(prs).toHaveLength(3);
    const stackIds = new Set(prs.map((p) => p.stackId));
    expect(stackIds.size).toBe(1);
    expect([...stackIds][0]).not.toBeNull();

    const stack = await prisma.stack.findUnique({ where: { id: prs[0].stackId! } });
    expect(stack?.signature).toBe("feat-a");
  });

  it("detaches the remaining PR from its stack once the bottom PR merges", async () => {
    // The bottom PR (feat-a) merges: GitHub sends state="closed", merged=true,
    // and repoints feat-b's PR base at "main" (a real `synchronize`/`edited`
    // event, simplified here to one call for the test).
    await sync.syncPullRequestEvent(
      pullRequestPayload({
        action: "closed",
        id: 1,
        number: 1,
        headRef: "feat-a",
        baseRef: "main",
        state: "closed",
        merged: true,
      }),
    );
    await sync.syncPullRequestEvent(
      pullRequestPayload({ action: "edited", id: 2, number: 2, headRef: "feat-b", baseRef: "main" }),
    );
    await sync.syncPullRequestEvent(
      pullRequestPayload({ action: "edited", id: 3, number: 3, headRef: "feat-c", baseRef: "feat-b" }),
    );

    const mergedPr = await prisma.pullRequest.findUnique({ where: { id: 1 } });
    expect(mergedPr?.state).toBe("merged");

    // feat-b + feat-c still form a two-PR stack; the now-merged feat-a is
    // excluded because recompute only looks at open PRs.
    const openPrs = await prisma.pullRequest.findMany({
      where: { repositoryId: REPO.id, state: "open" },
      orderBy: { number: "asc" },
    });
    expect(openPrs.map((p) => p.number)).toEqual([2, 3]);
    expect(openPrs[0].stackId).not.toBeNull();
    expect(openPrs[0].stackId).toBe(openPrs[1].stackId);
  });
});

describe("syncPullRequestReviewEvent", () => {
  it("records the latest review's state and tolerates a PR row that doesn't exist yet", async () => {
    const approve: PullRequestReviewPayload = {
      action: "submitted",
      pull_request: { id: 2 },
      review: { state: "approved" },
    };
    await sync.syncPullRequestReviewEvent(approve);
    expect((await prisma.pullRequest.findUnique({ where: { id: 2 } }))?.reviewStatus).toBe(
      "approved",
    );

    const changesRequested: PullRequestReviewPayload = {
      action: "submitted",
      pull_request: { id: 2 },
      review: { state: "changes_requested" },
    };
    await sync.syncPullRequestReviewEvent(changesRequested);
    expect((await prisma.pullRequest.findUnique({ where: { id: 2 } }))?.reviewStatus).toBe(
      "changes_requested",
    );

    // No PR with id 999999 exists — updateMany should silently do nothing.
    await expect(
      sync.syncPullRequestReviewEvent({
        action: "submitted",
        pull_request: { id: 999999 },
        review: { state: "approved" },
      }),
    ).resolves.not.toThrow();
  });
});

describe("syncCheckSuiteEvent", () => {
  it("maps check suite conclusions onto every associated PR number", async () => {
    const payload: CheckSuitePayload = {
      action: "completed",
      repository: { id: REPO.id },
      check_suite: { status: "completed", conclusion: "success", pull_requests: [{ number: 3 }] },
    };
    await sync.syncCheckSuiteEvent(payload);
    const pr = await prisma.pullRequest.findFirst({ where: { repositoryId: REPO.id, number: 3 } });
    expect(pr?.ciStatus).toBe("success");

    await sync.syncCheckSuiteEvent({
      ...payload,
      check_suite: { status: "completed", conclusion: "failure", pull_requests: [{ number: 3 }] },
    });
    const prAfter = await prisma.pullRequest.findFirst({
      where: { repositoryId: REPO.id, number: 3 },
    });
    expect(prAfter?.ciStatus).toBe("failure");

    await sync.syncCheckSuiteEvent({
      ...payload,
      check_suite: { status: "in_progress", conclusion: null, pull_requests: [{ number: 3 }] },
    });
    const prPending = await prisma.pullRequest.findFirst({
      where: { repositoryId: REPO.id, number: 3 },
    });
    expect(prPending?.ciStatus).toBe("pending");
  });
});

describe("handleWebhookEvent", () => {
  it("dispatches known events and silently ignores unknown ones", async () => {
    await expect(
      sync.handleWebhookEvent("ping", { zen: "hello" }),
    ).resolves.toBeUndefined();

    await sync.handleWebhookEvent(
      "installation",
      {
        action: "created",
        installation: { id: 55, account: { login: "dispatched-org", type: "Organization" } },
      } satisfies InstallationPayload,
    );
    expect(
      (await prisma.installation.findUnique({ where: { id: 55 } }))?.accountLogin,
    ).toBe("dispatched-org");
  });
});
