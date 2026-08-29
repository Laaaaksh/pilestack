"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LocalTime } from "./LocalTime";

export interface StackCommentView {
  id: string;
  authorLogin: string;
  authorAvatarUrl: string | null;
  body: string;
  createdAt: string;
}

export function CommentThread({
  stackId,
  comments,
}: {
  stackId: string;
  comments: StackCommentView[];
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    const res = await fetch(`/api/stacks/${stackId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    setSubmitting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Couldn't post that comment.");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <div className="rounded-md border border-border">
      <div className="border-b border-border px-4 py-2 text-sm font-medium">
        Stack comments
        <span className="ml-2 font-normal text-muted">
          applies to every PR in this stack — not just one
        </span>
      </div>

      {comments.length === 0 ? (
        <p className="px-4 py-4 text-sm text-muted">No stack-wide comments yet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {comments.map((c) => (
            <li key={c.id} className="px-4 py-3">
              <div className="flex items-baseline gap-2 text-sm">
                <span className="font-medium">{c.authorLogin}</span>
                <span className="text-xs text-muted">
                  <LocalTime iso={c.createdAt} />
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="border-t border-border p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Comment on the whole stack…"
          rows={2}
          className="w-full resize-y rounded-md border border-border bg-transparent p-2 text-sm outline-none focus:border-accent"
        />
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
        <div className="mt-2 flex justify-end">
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Comment"}
          </button>
        </div>
      </form>
    </div>
  );
}
