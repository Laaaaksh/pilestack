import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeRestack, planRestack } from "@/lib/restack";

function sh(cwd: string, ...args: string[]) {
  execFileSync("git", args, { cwd, stdio: "pipe" });
}

function log(cwd: string, ref: string): string {
  return execFileSync("git", ["log", "-1", "--format=%H", ref], { cwd }).toString().trim();
}

/** Builds a bare "remote" repo with main -> feat-a -> feat-b, each one real commit. */
function buildStackFixture(root: string) {
  const bare = path.join(root, "origin.git");
  sh(root, "init", "--bare", "-q", bare);

  const seed = path.join(root, "seed");
  sh(root, "clone", "-q", bare, seed);
  sh(seed, "config", "user.name", "Fixture");
  sh(seed, "config", "user.email", "fixture@localhost");

  writeFileSync(path.join(seed, "main.txt"), "main\n");
  sh(seed, "add", "main.txt");
  sh(seed, "commit", "-q", "-m", "main commit");
  sh(seed, "branch", "-M", "main");
  sh(seed, "push", "-q", "-u", "origin", "main");

  sh(seed, "checkout", "-q", "-b", "feat-a");
  writeFileSync(path.join(seed, "a.txt"), "a\n");
  sh(seed, "add", "a.txt");
  sh(seed, "commit", "-q", "-m", "feat-a commit");
  sh(seed, "push", "-q", "-u", "origin", "feat-a");

  sh(seed, "checkout", "-q", "-b", "feat-b");
  writeFileSync(path.join(seed, "b.txt"), "b\n");
  sh(seed, "add", "b.txt");
  sh(seed, "commit", "-q", "-m", "feat-b commit");
  sh(seed, "push", "-q", "-u", "origin", "feat-b");

  return { bare, seed };
}

describe("planRestack", () => {
  it("targets defaultBranch for the bottom PR and the branch below for the rest", () => {
    const plan = planRestack(
      "stack1",
      [
        { number: 1, headRef: "feat-a", baseRef: "main" },
        { number: 2, headRef: "feat-b", baseRef: "feat-a" },
      ],
      "main",
    );

    expect(plan.branches).toEqual([
      { prNumber: 1, branch: "feat-a", currentBase: "main", newBase: "main", baseChanged: false },
      {
        prNumber: 2,
        branch: "feat-b",
        currentBase: "feat-a",
        newBase: "feat-a",
        baseChanged: false,
      },
    ]);
  });

  it("flags a base change when the bottom PR's recorded base branch has merged away", () => {
    // The DB still shows baseRef "feat-a" because no synchronize/edited event
    // has landed yet, but feat-a no longer has an open PR — it's now the
    // bottom of the (remaining) stack, so it should retarget defaultBranch.
    const plan = planRestack(
      "stack1",
      [{ number: 2, headRef: "feat-b", baseRef: "feat-a" }],
      "main",
    );

    expect(plan.branches[0]).toEqual({
      prNumber: 2,
      branch: "feat-b",
      currentBase: "feat-a",
      newBase: "main",
      baseChanged: true,
    });
  });
});

describe("executeRestack", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), "pilestack-restack-test-"));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("rebases the whole stack onto a trunk that advanced, and pushes every branch", async () => {
    const { bare, seed } = buildStackFixture(root);

    // Simulate main advancing past where feat-a branched (e.g. an unrelated
    // PR merged) — feat-a's rebase has real work to do.
    writeFileSync(path.join(seed, "main2.txt"), "main2\n");
    sh(seed, "checkout", "-q", "main");
    sh(seed, "add", "main2.txt");
    sh(seed, "commit", "-q", "-m", "second main commit");
    sh(seed, "push", "-q", "origin", "main");
    const newMainTip = log(seed, "main");

    const plan = planRestack(
      "stack1",
      [
        { number: 1, headRef: "feat-a", baseRef: "main" },
        { number: 2, headRef: "feat-b", baseRef: "feat-a" },
      ],
      "main",
    );

    const result = await executeRestack({ cloneUrl: bare, plan });
    expect(result).toEqual({ status: "succeeded" });

    // Re-clone fresh to verify what actually landed on the remote.
    const verify = path.join(root, "verify");
    sh(root, "clone", "-q", bare, verify);
    const mergeBaseA = execFileSync("git", ["merge-base", "origin/main", "origin/feat-a"], { cwd: verify })
      .toString()
      .trim();
    expect(mergeBaseA).toBe(newMainTip); // feat-a now sits on top of main's new tip

    const mergeBaseB = execFileSync("git", ["merge-base", "origin/feat-a", "origin/feat-b"], { cwd: verify })
      .toString()
      .trim();
    expect(mergeBaseB).toBe(log(verify, "origin/feat-a")); // feat-b rebased onto the new feat-a
  });

  it("aborts on conflict, reports the failing branch, and pushes nothing for it or anything above it", async () => {
    const { bare, seed } = buildStackFixture(root);

    // Make main and feat-a conflict: both edit a.txt's first line differently.
    writeFileSync(path.join(seed, "a.txt"), "a\n");
    sh(seed, "checkout", "-q", "feat-a");
    writeFileSync(path.join(seed, "a.txt"), "from feat-a\n");
    sh(seed, "commit", "-q", "-am", "feat-a edits a.txt");
    sh(seed, "push", "-q", "origin", "feat-a");
    const feetABeforeRestack = log(seed, "feat-a");

    sh(seed, "checkout", "-q", "main");
    writeFileSync(path.join(seed, "a.txt"), "from main\n");
    sh(seed, "add", "a.txt");
    sh(seed, "commit", "-q", "-m", "main edits a.txt too");
    sh(seed, "push", "-q", "origin", "main");

    const plan = planRestack(
      "stack1",
      [
        { number: 1, headRef: "feat-a", baseRef: "main" },
        { number: 2, headRef: "feat-b", baseRef: "feat-a" },
      ],
      "main",
    );

    const result = await executeRestack({ cloneUrl: bare, plan });
    expect(result.status).toBe("conflict");
    expect(result.failedBranch).toBe("feat-a");

    const verify = path.join(root, "verify");
    sh(root, "clone", "-q", bare, verify);
    expect(log(verify, "origin/feat-a")).toBe(feetABeforeRestack); // untouched — never pushed
  });

  it("force-with-lease refuses to clobber a concurrent push it doesn't know about", async () => {
    const { bare } = buildStackFixture(root);

    // Pilestack "already cloned" for a preview a moment ago.
    const pilestackClone = path.join(root, "pilestack-clone");
    sh(root, "clone", "-q", bare, pilestackClone);

    // A human pushes directly to feat-b in the meantime, unrelated to Pilestack.
    const attacker = path.join(root, "concurrent-push");
    sh(root, "clone", "-q", bare, attacker);
    sh(attacker, "checkout", "-q", "feat-b");
    writeFileSync(path.join(attacker, "b.txt"), "concurrent edit\n");
    sh(attacker, "config", "user.name", "Someone Else");
    sh(attacker, "config", "user.email", "someone@localhost");
    sh(attacker, "commit", "-q", "-am", "a concurrent, legitimate push");
    sh(attacker, "push", "-q", "origin", "feat-b");
    const concurrentTip = log(attacker, "feat-b");

    const plan = planRestack(
      "stack1",
      [
        { number: 1, headRef: "feat-a", baseRef: "main" },
        { number: 2, headRef: "feat-b", baseRef: "feat-a" },
      ],
      "main",
    );

    // Reuses pilestackClone as-is (no fetch), so its view of origin/feat-b
    // predates the concurrent push above.
    const result = await executeRestack({ cloneUrl: bare, plan, workDir: pilestackClone });
    expect(result.status).toBe("failed");
    expect(result.failedBranch).toBe("feat-b");

    const verify = path.join(root, "verify");
    sh(root, "clone", "-q", bare, verify);
    expect(log(verify, "origin/feat-b")).toBe(concurrentTip); // the concurrent commit survived
  });

  it("reuses an existing clone directory instead of cloning again", async () => {
    const { bare } = buildStackFixture(root);
    const preClone = path.join(root, "pre-clone");
    sh(root, "clone", "-q", bare, preClone);
    expect(existsSync(path.join(preClone, ".git"))).toBe(true);

    const plan = planRestack("stack1", [{ number: 1, headRef: "feat-a", baseRef: "main" }], "main");
    const result = await executeRestack({ cloneUrl: bare, plan, workDir: preClone });
    expect(result.status).toBe("succeeded");
    // Directory persists — executeRestack must not have deleted a caller-owned workDir.
    expect(existsSync(path.join(preClone, ".git"))).toBe(true);
  });
});
