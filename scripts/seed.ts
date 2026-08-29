/**
 * Populates the local database with one realistic stack so `pnpm dev` has
 * something to show immediately — no GitHub App, webhook, or OAuth setup
 * required. This is exactly the shape real webhook sync produces; it's a
 * trial fixture, not a substitute for connecting a real installation.
 */
import { prisma } from "../src/lib/prisma";

async function main() {
  const installation = await prisma.installation.upsert({
    where: { id: 1 },
    create: { id: 1, accountLogin: "acme", accountType: "Organization" },
    update: {},
  });

  const repository = await prisma.repository.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      installationId: installation.id,
      owner: "acme",
      name: "widgets",
      fullName: "acme/widgets",
      defaultBranch: "main",
    },
    update: {},
  });

  const stack = await prisma.stack.upsert({
    where: { repositoryId_signature: { repositoryId: repository.id, signature: "add-rate-limiter" } },
    create: { repositoryId: repository.id, signature: "add-rate-limiter" },
    update: {},
  });

  const prs = [
    {
      id: 101,
      number: 42,
      title: "Add token bucket rate limiter",
      authorLogin: "priya",
      headRef: "add-rate-limiter",
      baseRef: "main",
      ciStatus: "success",
      reviewStatus: "approved",
    },
    {
      id: 102,
      number: 43,
      title: "Wire rate limiter into the API gateway",
      authorLogin: "priya",
      headRef: "wire-rate-limiter",
      baseRef: "add-rate-limiter",
      ciStatus: "success",
      reviewStatus: "changes_requested",
    },
    {
      id: 103,
      number: 44,
      title: "Add rate-limit headers and docs",
      authorLogin: "priya",
      headRef: "rate-limit-docs",
      baseRef: "wire-rate-limiter",
      ciStatus: "pending",
      reviewStatus: "none",
      isDraft: true,
    },
  ];

  for (const pr of prs) {
    await prisma.pullRequest.upsert({
      where: { id: pr.id },
      create: {
        ...pr,
        repositoryId: repository.id,
        stackId: stack.id,
        state: "open",
        isDraft: pr.isDraft ?? false,
        url: `https://github.com/acme/widgets/pull/${pr.number}`,
      },
      update: { stackId: stack.id },
    });
  }

  const existingComments = await prisma.stackComment.count({ where: { stackId: stack.id } });
  if (existingComments === 0) {
    // createMany({ skipDuplicates }) isn't supported on SQLite, and these rows
    // have no natural unique key anyway — guard idempotency with the count above.
    await prisma.stackComment.createMany({
      data: [
        {
          stackId: stack.id,
          authorLogin: "jordan",
          body: "Nice split — can we get a benchmark comparing before/after gateway latency across all three PRs before merging the bottom one?",
        },
        {
          stackId: stack.id,
          authorLogin: "priya",
          body: "Added a benchmark to #43's description. p99 latency delta is +0.4ms, well within budget.",
        },
      ],
    });
  }

  console.log(`Seeded stack ${stack.id} (${repository.fullName}) with ${prs.length} PRs.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
