const CI_LABEL: Record<string, string> = {
  success: "Checks passing",
  failure: "Checks failing",
  pending: "Checks running",
  unknown: "No checks",
};

const CI_COLOR: Record<string, string> = {
  success: "text-success",
  failure: "text-danger",
  pending: "text-warning",
  unknown: "text-muted",
};

const CI_ICON: Record<string, string> = {
  success: "●",
  failure: "●",
  pending: "◐",
  unknown: "○",
};

export function CiBadge({ status }: { status: string }) {
  const label = CI_LABEL[status] ?? CI_LABEL.unknown;
  const color = CI_COLOR[status] ?? CI_COLOR.unknown;
  const icon = CI_ICON[status] ?? CI_ICON.unknown;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${color}`} title={label}>
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

const REVIEW_LABEL: Record<string, string> = {
  approved: "Approved",
  changes_requested: "Changes requested",
  pending: "Review pending",
  none: "No review yet",
};

const REVIEW_COLOR: Record<string, string> = {
  approved: "text-success",
  changes_requested: "text-danger",
  pending: "text-warning",
  none: "text-muted",
};

export function ReviewBadge({ status }: { status: string }) {
  const label = REVIEW_LABEL[status] ?? REVIEW_LABEL.none;
  const color = REVIEW_COLOR[status] ?? REVIEW_COLOR.none;
  return <span className={`text-xs ${color}`}>{label}</span>;
}

export function DraftBadge() {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted">
      Draft
    </span>
  );
}
