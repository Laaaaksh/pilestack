/**
 * Pure stack-inference logic: given a repo's open pull requests, group the
 * ones that depend on each other into ordered stacks.
 *
 * A PR is part of a stack with another PR when its base branch is that other
 * PR's head branch — exactly the relationship git-spice, git-town, and a
 * manually-managed stack all produce on GitHub, since a PR's base is the only
 * place "this depends on that" is recorded. Inferring from base/head refs
 * means Pilestack needs no bespoke integration with any particular stacking
 * CLI: it reads the same signal GitHub's own compare view already relies on.
 *
 * No I/O here — this module only shapes data, so it's exercised entirely
 * with plain objects in tests (see stacks.test.ts).
 */

export interface StackablePr {
  id: number;
  headRef: string;
  baseRef: string;
}

export interface InferredStack<T extends StackablePr> {
  /** Stable identity for this stack: the head ref of its bottom-most PR. */
  signature: string;
  /** Ordered bottom (merges first) to top (merges last). */
  prs: T[];
  /**
   * True if the base/head refs among this group formed a cycle (shouldn't
   * happen with real git branches, but out-of-order webhook delivery could
   * transiently produce ref names that look circular). When true, `prs` falls
   * back to a stable but otherwise meaningless order (ascending id) instead
   * of hanging or throwing.
   */
  hasCycle: boolean;
}

/**
 * Groups PRs into stacks and orders each stack bottom-to-top.
 *
 * Only PRs the caller passes in are considered — callers should pass the
 * open PRs for one repository. A PR whose base isn't any other passed-in
 * PR's head is a lone PR, not a stack, and singleton groups are omitted from
 * the result: a "stack" is meaningfully two or more dependent PRs.
 */
export function inferStacks<T extends StackablePr>(prs: T[]): InferredStack<T>[] {
  const byHeadRef = new Map<string, T>();
  for (const pr of prs) {
    // Defensive: if two open PRs somehow share a head ref, prefer the one
    // with the higher id (more recently created) rather than picking
    // arbitrarily based on iteration order.
    const existing = byHeadRef.get(pr.headRef);
    if (!existing || pr.id > existing.id) {
      byHeadRef.set(pr.headRef, pr);
    }
  }

  const parentOf = new Map<number, T>();
  const childrenOf = new Map<number, T[]>();
  for (const pr of prs) {
    const parent = byHeadRef.get(pr.baseRef);
    if (parent && parent.id !== pr.id) {
      parentOf.set(pr.id, parent);
      const siblings = childrenOf.get(parent.id) ?? [];
      siblings.push(pr);
      childrenOf.set(parent.id, siblings);
    }
  }

  const componentId = new Map<number, number>();
  const components: T[][] = [];
  for (const pr of prs) {
    if (componentId.has(pr.id)) continue;
    const group: T[] = [];
    const stack: T[] = [pr];
    const seen = new Set<number>([pr.id]);
    while (stack.length > 0) {
      const current = stack.pop()!;
      group.push(current);
      const parent = parentOf.get(current.id);
      if (parent && !seen.has(parent.id)) {
        seen.add(parent.id);
        stack.push(parent);
      }
      for (const child of childrenOf.get(current.id) ?? []) {
        if (!seen.has(child.id)) {
          seen.add(child.id);
          stack.push(child);
        }
      }
    }
    const id = components.length;
    for (const member of group) componentId.set(member.id, id);
    components.push(group);
  }

  const result: InferredStack<T>[] = [];
  for (const group of components) {
    if (group.length < 2) continue;
    result.push(orderComponent(group, parentOf, childrenOf));
  }
  return result;
}

function orderComponent<T extends StackablePr>(
  group: T[],
  parentOf: Map<number, T>,
  childrenOf: Map<number, T[]>,
): InferredStack<T> {
  const groupIds = new Set(group.map((pr) => pr.id));
  const inDegree = new Map<number, number>();
  for (const pr of group) {
    const parent = parentOf.get(pr.id);
    inDegree.set(pr.id, parent && groupIds.has(parent.id) ? 1 : 0);
  }

  const queue = group.filter((pr) => inDegree.get(pr.id) === 0);
  // Deterministic ordering among siblings/roots: lower id first.
  queue.sort((a, b) => a.id - b.id);

  const ordered: T[] = [];
  while (queue.length > 0) {
    const pr = queue.shift()!;
    ordered.push(pr);
    const children = (childrenOf.get(pr.id) ?? []).filter((c) => groupIds.has(c.id));
    children.sort((a, b) => a.id - b.id);
    for (const child of children) {
      const next = (inDegree.get(child.id) ?? 0) - 1;
      inDegree.set(child.id, next);
      if (next === 0) queue.push(child);
    }
  }

  const hasCycle = ordered.length !== group.length;
  const finalOrder = hasCycle ? [...group].sort((a, b) => a.id - b.id) : ordered;
  const root = finalOrder.find((pr) => {
    const parent = parentOf.get(pr.id);
    return !parent || !groupIds.has(parent.id);
  }) ?? finalOrder[0];

  return { signature: root.headRef, prs: finalOrder, hasCycle };
}
