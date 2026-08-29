import { simpleGit } from "simple-git";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * "Restack": rebase every open PR in a stack onto its correct current base
 * and force-push the result, so the stack reflects reality again after a
 * lower PR merged or picked up new commits — without reimplementing a
 * conflict-resolution engine. This module leans on real `git rebase` and
 * `git push --force-with-lease`; Pilestack only decides *what* each branch's
 * new base should be (`planRestack`) and drives the sequence (`executeRestack`).
 */

export interface StackPrLike {
  number: number;
  headRef: string;
  baseRef: string;
}

export interface RestackBranchPlan {
  prNumber: number;
  branch: string;
  currentBase: string;
  newBase: string;
  baseChanged: boolean;
}

export interface RestackPlan {
  stackId: string;
  branches: RestackBranchPlan[];
}

/**
 * Pure planning step — no git, no network. `prs` must already be ordered
 * bottom-to-top (as `inferStacks` / the DB's stack join produce), and must
 * contain only currently-open PRs: a merged bottom PR has already dropped out
 * of that list, which is exactly what tells this function the new bottom
 * should target `defaultBranch` instead of the merged branch's name.
 */
export function planRestack(
  stackId: string,
  prs: StackPrLike[],
  defaultBranch: string,
): RestackPlan {
  const branches: RestackBranchPlan[] = prs.map((pr, i) => {
    const newBase = i === 0 ? defaultBranch : prs[i - 1].headRef;
    return {
      prNumber: pr.number,
      branch: pr.headRef,
      currentBase: pr.baseRef,
      newBase,
      baseChanged: newBase !== pr.baseRef,
    };
  });
  return { stackId, branches };
}

export type RestackStatus = "succeeded" | "conflict" | "failed";

export interface RestackResult {
  status: RestackStatus;
  /** The branch that failed to rebase or push; unset when status is "succeeded". */
  failedBranch?: string;
  errorMessage?: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface ExecuteRestackOptions {
  /** An authenticated clone URL, e.g. https://x-access-token:<token>@github.com/owner/repo.git */
  cloneUrl: string;
  plan: RestackPlan;
  /**
   * Defaults to a fresh temp directory that is cloned into and removed when
   * the run finishes. Pass an existing clone (a directory that already has
   * a `.git`) to reuse it instead of cloning again — production can reuse the
   * clone a restack preview already made; tests use it to pin exactly which
   * `origin/*` state force-with-lease should compare against.
   */
  workDir?: string;
}

/**
 * Executes a restack plan bottom-to-top in one clone, fetched once up front.
 * Every branch's push is protected by `--force-with-lease` against that one
 * snapshot, so if someone pushes to a not-yet-processed branch while this
 * run is in progress, that branch's push is rejected instead of clobbering
 * them — the scenario the "trust bar is high" risk in the project spec
 * calls out explicitly.
 *
 * Stops at the first branch that fails to rebase cleanly (aborting that
 * rebase before stopping, so it's never left mid-rebase) or fails to push,
 * and reports exactly which branch failed. Branches below it in the plan
 * were already force-pushed and are not rolled back — that matches how
 * every stacked-diff tool (git-spice, Graphite, Sapling) behaves, because
 * each branch is an independently valid ref: a partial restack leaves real,
 * correct history on the branches it reached, not a corrupt intermediate
 * state.
 */
export async function executeRestack(opts: ExecuteRestackOptions): Promise<RestackResult> {
  const workDir = opts.workDir ?? (await mkdtemp(path.join(tmpdir(), "pilestack-restack-")));
  const shouldCleanup = !opts.workDir;
  const reuseExisting = existsSync(path.join(workDir, ".git"));

  try {
    const git = simpleGit(workDir);
    if (!reuseExisting) {
      await simpleGit().clone(opts.cloneUrl, workDir);
      // A fresh, isolated clone has no identity configured; `git rebase`
      // rewrites the committer on every replayed commit even without
      // conflicts, so this is required, not optional.
      await git.addConfig("user.name", "Pilestack");
      await git.addConfig("user.email", "pilestack@localhost");
    }

    for (const step of opts.plan.branches) {
      await git.checkout(["-B", step.branch, `origin/${step.branch}`]);

      try {
        await git.rebase([step.newBase]);
      } catch (err) {
        await git.raw(["rebase", "--abort"]).catch(() => {});
        return { status: "conflict", failedBranch: step.branch, errorMessage: errorMessage(err) };
      }

      try {
        await git.push(["origin", `${step.branch}:${step.branch}`, "--force-with-lease"]);
      } catch (err) {
        return { status: "failed", failedBranch: step.branch, errorMessage: errorMessage(err) };
      }
    }

    return { status: "succeeded" };
  } finally {
    if (shouldCleanup) {
      await rm(workDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
