import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { getStackDetail } from "@/lib/data";
import { hasRepoAccess } from "@/lib/authz";
import { getInstallationOctokit, getInstallationToken } from "@/lib/github-app";
import { planRestack, executeRestack } from "@/lib/restack";
import { prisma } from "@/lib/prisma";

async function loadAuthorizedStack(stackId: string) {
  const session = await auth();
  if (!session?.githubAccessToken || !session.githubLogin) {
    return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) } as const;
  }

  const stack = await getStackDetail(stackId);
  if (!stack) {
    return { error: NextResponse.json({ error: "not found" }, { status: 404 }) } as const;
  }

  const allowed = await hasRepoAccess(
    session.githubAccessToken,
    stack.repository.owner,
    stack.repository.name,
  );
  if (!allowed) {
    return { error: NextResponse.json({ error: "not found" }, { status: 404 }) } as const;
  }

  return { session, stack } as const;
}

/** Preview: what a restack would do, without touching git or GitHub. */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/stacks/[stackId]/restack">,
) {
  const { stackId } = await ctx.params;
  const result = await loadAuthorizedStack(stackId);
  if ("error" in result) return result.error;
  const { stack } = result;

  if (stack.pullRequests.length === 0) {
    return NextResponse.json({ error: "no open PRs in this stack" }, { status: 400 });
  }

  const plan = planRestack(
    stack.id,
    stack.pullRequests.map((pr) => ({ number: pr.number, headRef: pr.headRef, baseRef: pr.baseRef })),
    stack.repository.defaultBranch,
  );
  return NextResponse.json({ plan });
}

const confirmSchema = z.object({ confirm: z.literal(true) });

/** Executes a restack: real `git rebase` + `--force-with-lease` push, then updates any changed PR bases. */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/stacks/[stackId]/restack">,
) {
  const { stackId } = await ctx.params;
  const result = await loadAuthorizedStack(stackId);
  if ("error" in result) return result.error;
  const { session, stack } = result;

  const parsed = confirmSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "restack requires an explicit { confirm: true } body" },
      { status: 400 },
    );
  }

  const plan = planRestack(
    stack.id,
    stack.pullRequests.map((pr) => ({ number: pr.number, headRef: pr.headRef, baseRef: pr.baseRef })),
    stack.repository.defaultBranch,
  );
  if (plan.branches.length === 0) {
    return NextResponse.json({ error: "no open PRs in this stack" }, { status: 400 });
  }

  const run = await prisma.restackRun.create({
    data: {
      stackId: stack.id,
      triggeredByLogin: session.githubLogin!,
      status: "running",
      planJson: JSON.stringify(plan),
    },
  });

  try {
    const token = await getInstallationToken(stack.repository.installationId);
    const cloneUrl = `https://x-access-token:${token}@github.com/${stack.repository.owner}/${stack.repository.name}.git`;

    const execResult = await executeRestack({ cloneUrl, plan });

    if (execResult.status === "succeeded") {
      const octokit = await getInstallationOctokit(stack.repository.installationId);
      for (const step of plan.branches) {
        if (!step.baseChanged) continue;
        await octokit.request("PATCH /repos/{owner}/{repo}/pulls/{pull_number}", {
          owner: stack.repository.owner,
          repo: stack.repository.name,
          pull_number: step.prNumber,
          base: step.newBase,
        });
      }
    }

    await prisma.restackRun.update({
      where: { id: run.id },
      data: {
        status: execResult.status,
        errorMessage: execResult.errorMessage,
        completedAt: new Date(),
      },
    });

    return NextResponse.json({ result: execResult });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await prisma.restackRun.update({
      where: { id: run.id },
      data: { status: "failed", errorMessage, completedAt: new Date() },
    });
    return NextResponse.json({ error: "restack failed", errorMessage }, { status: 500 });
  }
}
