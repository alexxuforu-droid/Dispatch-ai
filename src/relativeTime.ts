/**
 * The time a thing happened, in the words a person would use.
 *
 * A run list is read by scanning, not by reading. "2 h ago" says how recent the work is;
 * "2026-01-01T09:14:22.301Z" does not. The exact time is still available, on hover and to a
 * screen reader, because sometimes the exact minute is the thing that matters.
 */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString();
}
