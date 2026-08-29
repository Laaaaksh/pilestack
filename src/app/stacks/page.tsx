import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listAccessibleStacks } from "@/lib/data";
import { CiBadge, ReviewBadge } from "@/components/Badges";

export default async function StacksPage() {
  const session = await auth();
  if (!session?.githubAccessToken) redirect("/");

  const stacks = await listAccessibleStacks(session.githubAccessToken);

  return (
    <div>
      <h1 className="text-xl font-semibold">Stacks</h1>
      <p className="mt-1 text-sm text-muted">
        Every open, multi-PR stack Pilestack has inferred from your repositories&apos; PR base
        branches. A lone PR based directly on trunk isn&apos;t a stack and won&apos;t show up here.
      </p>

      {stacks.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-border p-8 text-center text-sm text-muted">
          No active stacks yet. Open a PR whose base branch is another open PR&apos;s branch —
          that&apos;s all Pilestack needs to pick up a stack.
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {stacks.map((stack) => (
            <li key={stack.id}>
              <Link
                href={`/stacks/${stack.id}`}
                className="block rounded-md border border-border p-4 hover:border-accent"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-sm text-muted">
                    {stack.repository.fullName}
                  </span>
                  <span className="text-xs text-muted">
                    {stack.pullRequests.length} PR{stack.pullRequests.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-2 space-y-1">
                  {stack.pullRequests.map((pr) => (
                    <div key={pr.id} className="flex items-center justify-between gap-4 text-sm">
                      <span className="truncate">
                        #{pr.number} {pr.title}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <ReviewBadge status={pr.reviewStatus} />
                        <CiBadge status={pr.ciStatus} />
                      </span>
                    </div>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
