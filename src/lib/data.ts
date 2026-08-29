import { prisma } from "./prisma";
import { inferStacks } from "./stacks";
import { hasRepoAccess } from "./authz";

/** Active stacks (at least one open PR), newest activity first, filtered to what this user can see on GitHub. */
export async function listAccessibleStacks(userAccessToken: string) {
  const stacks = await prisma.stack.findMany({
    where: { pullRequests: { some: { state: "open" } } },
    include: {
      repository: true,
      pullRequests: { where: { state: "open" } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const accessByRepo = new Map<number, Promise<boolean>>();
  const visible = await Promise.all(
    stacks.map(async (stack) => {
      if (!accessByRepo.has(stack.repositoryId)) {
        accessByRepo.set(
          stack.repositoryId,
          hasRepoAccess(userAccessToken, stack.repository.owner, stack.repository.name),
        );
      }
      const allowed = await accessByRepo.get(stack.repositoryId)!;
      return allowed ? stack : null;
    }),
  );

  return visible
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .map((stack) => ({ ...stack, pullRequests: orderStackPrs(stack.pullRequests) }));
}

function orderStackPrs<T extends { id: number; headRef: string; baseRef: string }>(
  prs: T[],
): T[] {
  if (prs.length < 2) return prs;
  const [group] = inferStacks(prs);
  if (!group) return prs;
  return group.prs;
}

export async function getStackDetail(stackId: string) {
  const stack = await prisma.stack.findUnique({
    where: { id: stackId },
    include: {
      repository: true,
      pullRequests: { where: { state: "open" } },
      comments: { orderBy: { createdAt: "asc" } },
      restackRuns: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });
  if (!stack) return null;
  return { ...stack, pullRequests: orderStackPrs(stack.pullRequests) };
}

export async function canAccessStack(
  stackId: string,
  userAccessToken: string,
): Promise<{ allowed: boolean; repository?: { owner: string; name: string } }> {
  const stack = await prisma.stack.findUnique({
    where: { id: stackId },
    select: { repository: { select: { owner: true, name: true } } },
  });
  if (!stack) return { allowed: false };
  const allowed = await hasRepoAccess(userAccessToken, stack.repository.owner, stack.repository.name);
  return { allowed, repository: stack.repository };
}
