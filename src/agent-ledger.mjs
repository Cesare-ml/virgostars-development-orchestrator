// Ledger housekeeping: which claim folders are long expired and can be archived (removed from the branch tip;
// they stay in Git history). A folder is removable only if its latest attempt is older than the cutoff,
// so attempt numbering of any live or recent claim is never disturbed.
export const ARCHIVE_AFTER_HOURS = 6;

export function expiredClaimFolders(claims, now, hours = ARCHIVE_AFTER_HOURS) {
  const cutoff = now - hours * 3600_000;
  const out = [];
  for (const [path, list] of Object.entries(claims)) {
    const latest = list.reduce((a, b) => (b.attempt > a.attempt ? b : a));
    const t = Date.parse(latest.claimed_at);
    if (Number.isFinite(t) && t < cutoff) out.push(path);
  }
  return out.sort();
}
