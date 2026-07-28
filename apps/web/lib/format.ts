/**
 * Display formatting shared by every surface. Kept in one file so a date never
 * reads one way on the dashboard and another on the detail page.
 */

const RTF = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['week', 604_800_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
];

/** "8 minutes ago", "13 hours ago", "1 week ago". */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const delta = new Date(iso).getTime() - now;
  const abs = Math.abs(delta);
  for (const [unit, ms] of UNITS) {
    if (abs >= ms) return RTF.format(Math.round(delta / ms), unit);
  }
  return 'just now';
}

/** "7/20/2026" — the Last Change column's date half. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US');
}

/** "07:32:39 pm" — the Last Change column's time half. */
export function shortTime(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso)
    .toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .toLowerCase();
}

/** "7/20/2026 | 6:27:24 AM" — the template tables' Last Change format. */
export function dateTimeStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US')} | ${d.toLocaleTimeString('en-US', { hour12: true })}`;
}

/** Certificate-grade timestamp: unambiguous, UTC, no locale surprises. */
export function auditStamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

/** The part of an email before the @ — used where DocuSign shows a short name. */
export function displayName(name: string | null | undefined, email: string): string {
  return name?.trim() || (email.split('@')[0] ?? email);
}
