import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getStackDetail } from "@/lib/data";
import { hasRepoAccess } from "@/lib/authz";
import { CiBadge, DraftBadge, ReviewBadge } from "@/components/Badges";
import { RestackButton } from "@/components/RestackButton";
import { CommentThread } from "@/components/CommentThread";

export default async function StackDetailPage({
  params,
}: PageProps<"/stacks/[stackId]">) {
  const { stackId } = await params;
  const session = await auth();
  if (!session?.githubAccessToken) redirect("/");

  const stack = await getStackDetail(stackId);
  if (!stack) notFound();

  const allowed = await hasRepoAccess(
    session.githubAccessToken,
    stack.repository.owner,
    stack.repository.name,
  );
  if (!allowed) notFound();

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <Link href="/stacks" className="text-sm text-muted hover:text-foreground">
            ← Stacks
          </Link>
          <h1 className="mt-1 font-mono text-lg">{stack.repository.fullName}</h1>
        </div>
        <RestackButton stackId={stack.id} />
      </div>

      <ol className="mt-6 space-y-2">
        {stack.pullRequests.map((pr, i) => (
          <li key={pr.id} className="relative">
            {i > 0 && <div className="absolute -top-2 left-4 h-2 border-l border-border" />}
            <a
              href={pr.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-4 rounded-md border border-border p-4 hover:border-accent"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="truncate font-medium">
                    #{pr.number} {pr.title}
                  </span>
                  {pr.isDraft && <DraftBadge />}
                </div>
                <div className="mt-1 font-mono text-xs text-muted">
                  {pr.headRef} → {pr.baseRef} · @{pr.authorLogin}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <ReviewBadge status={pr.reviewStatus} />
                <CiBadge status={pr.ciStatus} />
              </div>
            </a>
          </li>
        ))}
      </ol>

      <div className="mt-8">
        <CommentThread
          stackId={stack.id}
          comments={stack.comments.map((c) => ({
            id: c.id,
            authorLogin: c.authorLogin,
            authorAvatarUrl: c.authorAvatarUrl,
            body: c.body,
            createdAt: c.createdAt.toISOString(),
          }))}
        />
      </div>

      {stack.restackRuns.length > 0 && (
        <div className="mt-6 text-xs text-muted">
          <div className="font-medium text-foreground">Recent restacks</div>
          <ul className="mt-1 space-y-0.5">
            {stack.restackRuns.map((run) => (
              <li key={run.id}>
                {run.status} · by {run.triggeredByLogin} ·{" "}
                {new Date(run.createdAt).toLocaleString()}
                {run.errorMessage && ` — ${run.errorMessage}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
