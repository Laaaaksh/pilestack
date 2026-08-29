import { describe, expect, it } from "vitest";
import { inferStacks, type StackablePr } from "@/lib/stacks";

interface PR extends StackablePr {
  number: number;
}

function pr(id: number, number: number, headRef: string, baseRef: string): PR {
  return { id, number, headRef, baseRef };
}

describe("inferStacks", () => {
  it("returns nothing for unrelated PRs each based on trunk", () => {
    const prs = [pr(1, 1, "feature-a", "main"), pr(2, 2, "feature-b", "main")];
    expect(inferStacks(prs)).toEqual([]);
  });

  it("groups a linear three-PR stack in bottom-to-top order", () => {
    const prs = [
      pr(3, 3, "feature-c", "feature-b"),
      pr(1, 1, "feature-a", "main"),
      pr(2, 2, "feature-b", "feature-a"),
    ];

    const stacks = inferStacks(prs);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].signature).toBe("feature-a");
    expect(stacks[0].hasCycle).toBe(false);
    expect(stacks[0].prs.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it("keeps two independent stacks in the same repo separate", () => {
    const prs = [
      pr(1, 1, "stack-a-1", "main"),
      pr(2, 2, "stack-a-2", "stack-a-1"),
      pr(3, 3, "stack-b-1", "main"),
      pr(4, 4, "stack-b-2", "stack-b-1"),
    ];

    const stacks = inferStacks(prs);
    expect(stacks).toHaveLength(2);
    const signatures = stacks.map((s) => s.signature).sort();
    expect(signatures).toEqual(["stack-a-1", "stack-b-1"]);
  });

  it("excludes a lone PR based directly on trunk from the same repo's stacks", () => {
    const prs = [
      pr(1, 1, "stack-a-1", "main"),
      pr(2, 2, "stack-a-2", "stack-a-1"),
      pr(3, 3, "solo-feature", "main"),
    ];

    const stacks = inferStacks(prs);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].prs.map((p) => p.number)).toEqual([1, 2]);
  });

  it("treats a PR whose base branch has no open PR as its own stack root", () => {
    // baseRef "removed-branch" isn't any open PR's headRef (e.g. that PR
    // already merged), so this PR is the bottom of whatever remains above it.
    const prs = [
      pr(1, 1, "feature-a", "removed-branch"),
      pr(2, 2, "feature-b", "feature-a"),
    ];

    const stacks = inferStacks(prs);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].signature).toBe("feature-a");
    expect(stacks[0].prs.map((p) => p.number)).toEqual([1, 2]);
  });

  it("renders a branching stack (two PRs sharing one base) as one component, parent first", () => {
    const prs = [
      pr(1, 1, "base-feature", "main"),
      pr(2, 2, "child-a", "base-feature"),
      pr(3, 3, "child-b", "base-feature"),
    ];

    const stacks = inferStacks(prs);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].prs[0].number).toBe(1);
    expect(stacks[0].prs.slice(1).map((p) => p.number).sort()).toEqual([2, 3]);
  });

  it("never hangs and flags a cycle instead of throwing", () => {
    // Pathological input that shouldn't occur from real git refs, but a race
    // between two out-of-order webhook deliveries could momentarily produce
    // ref names that loop back on each other.
    const prs = [
      pr(1, 1, "a", "c"),
      pr(2, 2, "b", "a"),
      pr(3, 3, "c", "b"),
    ];

    const stacks = inferStacks(prs);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].hasCycle).toBe(true);
    // Falls back to a stable, deterministic order rather than hanging.
    expect(stacks[0].prs.map((p) => p.number)).toEqual([1, 2, 3]);
  });

  it("picks the higher id when two open PRs impossibly share a head ref", () => {
    const prs = [
      pr(1, 1, "feature-a", "main"),
      pr(5, 5, "feature-a", "main"),
      pr(2, 2, "feature-b", "feature-a"),
    ];

    const stacks = inferStacks(prs);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].prs.map((p) => p.number)).toEqual([5, 2]);
  });

  it("is stable across restacks that only change base commits, not ref names", () => {
    const before = inferStacks([
      pr(1, 1, "feature-a", "main"),
      pr(2, 2, "feature-b", "feature-a"),
    ]);
    // After PR 1 merges and the stack is restacked, PR 2's base moves to
    // main but its head ref name is unchanged — a fresh inference over the
    // remaining PRs should no longer form a stack (only one PR left).
    const after = inferStacks([pr(2, 2, "feature-b", "main")]);

    expect(before[0].signature).toBe("feature-a");
    expect(after).toEqual([]);
  });
});
