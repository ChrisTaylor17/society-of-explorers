export function chainStatusText(report: {
  links: { ok: boolean; checked: number; brokenAt: number | null; reason: string | null };
  unsupported: { count: number; trusted: false };
  completeness: { status: "unknown" | "prefix" | "exact" | "mismatch"; reason: string | null };
}): string {
  const links = report.links.ok
    ? `Links checked: ${report.links.checked} linked receipt${report.links.checked === 1 ? "" : "s"} consistent.`
    : `Links do not check out at record ${report.links.brokenAt}. ${report.links.reason}.`;
  const outside = report.unsupported.count === 0
    ? "Unsupported rows: 0."
    : `Unsupported rows: ${report.unsupported.count}. They are not verified, and a verifying signature does not make a legacy-shaped payload trusted history.`;
  const completeness = report.completeness.status === "unknown"
    ? "Completeness: unknown. No independent checkpoint is configured, so a deleted suffix would not be detected."
    : report.completeness.status === "prefix"
      ? "Completeness: the supplied checkpoint matches a prefix only, not the whole log."
      : report.completeness.status === "exact"
        ? "Completeness: the supplied checkpoint matches this linked log exactly. This module did not authenticate that checkpoint."
        : `Completeness: checkpoint mismatch (${report.completeness.reason}).`;
  return `${links} ${outside} ${completeness}`;
}

export function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return (
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(date) + " UTC"
  );
}

export function enjoymentLabel(value: string): string {
  if (value === "glad") return "Glad I went";
  if (value === "mixed") return "Mixed";
  if (value === "not-for-me") return "Not for me";
  return value;
}

export function againLabel(value: string): string {
  if (value === "yes") return "Would do it again";
  if (value === "maybe") return "Maybe";
  if (value === "no") return "Would not";
  return value;
}
