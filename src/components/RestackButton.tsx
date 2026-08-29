"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RestackPlan } from "@/lib/restack";

type Phase = "idle" | "loading-preview" | "confirming" | "running" | "done";

export function RestackButton({ stackId }: { stackId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [plan, setPlan] = useState<RestackPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ status: string; failedBranch?: string } | null>(null);

  async function openPreview() {
    setPhase("loading-preview");
    setError(null);
    const res = await fetch(`/api/stacks/${stackId}/restack`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Couldn't load a restack preview.");
      setPhase("idle");
      return;
    }
    const body = (await res.json()) as { plan: RestackPlan };
    setPlan(body.plan);
    setPhase("confirming");
  }

  async function confirmRestack() {
    setPhase("running");
    setError(null);
    const res = await fetch(`/api/stacks/${stackId}/restack`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.errorMessage ?? body.error ?? "Restack failed.");
      setPhase("confirming");
      return;
    }
    setOutcome(body.result);
    setPhase("done");
    router.refresh();
  }

  function close() {
    setPhase("idle");
    setPlan(null);
    setOutcome(null);
    setError(null);
  }

  if (phase === "idle" || phase === "loading-preview") {
    return (
      <button
        type="button"
        onClick={openPreview}
        disabled={phase === "loading-preview"}
        className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:border-accent disabled:opacity-50"
      >
        {phase === "loading-preview" ? "Loading preview…" : "Restack"}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-md border border-border bg-background p-5 shadow-lg">
        <h2 className="text-base font-semibold">Restack this stack?</h2>

        {phase === "confirming" && plan && (
          <>
            <p className="mt-2 text-sm text-muted">
              Pilestack will rebase each branch below onto its new base and force-push it
              (<code className="font-mono">--force-with-lease</code>, so a concurrent push you
              don&apos;t know about is refused, not clobbered). If any branch conflicts, everything
              below it in this list stays as pushed and the run stops there.
            </p>
            <ul className="mt-3 space-y-1 rounded-md bg-surface p-3 font-mono text-xs">
              {plan.branches.map((b) => (
                <li key={b.branch}>
                  #{b.prNumber} <span className="text-accent">{b.branch}</span> →{" "}
                  {b.newBase}
                  {b.baseChanged && (
                    <span className="text-warning"> (base changes from {b.currentBase})</span>
                  )}
                </li>
              ))}
            </ul>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={close}
                className="rounded-md border border-border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRestack}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground"
              >
                Confirm restack
              </button>
            </div>
          </>
        )}

        {phase === "running" && <p className="mt-3 text-sm text-muted">Restacking…</p>}

        {phase === "done" && outcome && (
          <>
            <p className="mt-3 text-sm">
              {outcome.status === "succeeded" && "Restack succeeded — every branch was rebased and pushed."}
              {outcome.status === "conflict" && (
                <>
                  Stopped: <span className="font-mono">{outcome.failedBranch}</span> conflicts with
                  its new base. Branches below it were already restacked; resolve the conflict
                  locally (<code className="font-mono">git rebase</code>) and push, then retry.
                </>
              )}
              {outcome.status === "failed" && (
                <>
                  Stopped: pushing <span className="font-mono">{outcome.failedBranch}</span> failed
                  {error ? ` (${error})` : ""}. Nothing was clobbered.
                </>
              )}
            </p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={close}
                className="rounded-md border border-border px-3 py-1.5 text-sm"
              >
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
